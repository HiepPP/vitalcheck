// Experimental blood-pressure estimate from rPPG pulse shape.
//
// Uncalibrated, the model is a hand-set heuristic, not fitted to data: it encodes only
// the published directions that higher heart rate, a faster systolic upstroke and a
// narrower pulse tend to accompany higher pressure. With a cuff calibration the same
// coefficients only predict the change from the user's own reference reading.
// Accuracy is unvalidated in both modes.
import { bandpass, mean, std } from "./dsp";

export interface Waveform {
  signal: Float64Array; // unfiltered POS output
  fs: number;
}

/** Pulse-shape features measured on the ensemble-averaged beat. */
export interface BpFeatures {
  hr: number; // BPM
  riseFrac: number; // foot-to-peak time / beat interval
  widthFrac: number; // width at half amplitude / beat interval
}

export interface Calibration {
  sys: number;
  dia: number;
  features: BpFeatures;
  at: string; // ISO timestamp of the cuff reading
}

export type BloodPressure =
  | { kind: "estimate"; sys: number; dia: number; uncertainty: number; calibrated: boolean; features: BpFeatures; beats: number }
  | { kind: "withheld"; reason: string; features?: BpFeatures; beats?: number };

const MIN_SNR_DB = 6;
const MIN_BEATS = 15;
const MIN_TEMPLATE_CORR = 0.8;
const TEMPLATE_POINTS = 64;
const UNCERTAINTY = 15; // mmHg; display range, not a measured error bound

const MODEL = {
  sys: { base: 120, hr: 0.3, rise: -50 }, // per BPM, per unit fraction of the beat interval
  dia: { base: 80, hr: 0.25, width: -20 },
  ref: { hr: 70, rise: 0.2, width: 0.45 },
} as const;

/** Inputs and outputs outside these ranges are outside what the heuristic claims to cover. */
const FEATURE_RANGE = { riseFrac: [0.05, 0.5], widthFrac: [0.15, 0.75] } as const;
const OUTPUT_RANGE = { sys: [90, 160], dia: [55, 100], minPulsePressure: 20 } as const;
const MAX_CALIBRATED_DELTA = { sys: 25, dia: 15 } as const;

/** Sub-sample offset of an extremum at index i from a parabola through its neighbours. */
function vertex(x: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= x.length - 1) return 0;
  const d = x[i - 1] - 2 * x[i] + x[i + 1];
  return d === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (x[i - 1] - x[i + 1])) / d));
}

function argExtreme(x: ArrayLike<number>, from: number, to: number, max: boolean): number {
  let best = -1;
  for (let i = Math.max(0, from); i <= Math.min(x.length - 1, to); i++) {
    if (best < 0 || (max ? x[i] > x[best] : x[i] < x[best])) best = i;
  }
  return best;
}

function median(x: number[]): number {
  const s = [...x].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Linear interpolation at a fractional index. */
function at(x: Float64Array, pos: number): number {
  const i = Math.max(0, Math.min(x.length - 2, Math.floor(pos)));
  return x[i] + (x[i + 1] - x[i]) * (pos - i);
}

function correlation(a: Float64Array, b: Float64Array): number {
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

function pointwiseMedian(beats: Float64Array[]): Float64Array {
  const out = new Float64Array(TEMPLATE_POINTS);
  for (let i = 0; i < out.length; i++) out[i] = median(beats.map((b) => b[i]));
  return out;
}

/**
 * Sign that makes `x` a blood-volume pulse. A volume pulse rises faster than it
 * decays, so its first difference is positively skewed. `x` must already be band
 * limited: raw frame noise has its own skew and can decide the sign on its own.
 */
export function volumeSign(x: Float64Array): 1 | -1 {
  const d = new Float64Array(x.length - 1);
  for (let i = 0; i < d.length; i++) d[i] = x[i + 1] - x[i];
  const m = mean(d);
  const s = std(d) || 1;
  let skew = 0;
  for (const v of d) skew += ((v - m) / s) ** 3;
  return skew >= 0 ? 1 : -1;
}

export interface PulseShape {
  riseFrac: number;
  widthFrac: number;
  ibi: number; // seconds, median of accepted beats
  beats: number; // accepted beats
  candidates: number; // beats before template gating
  feet: number[]; // seconds, every detected foot in time order, before interval gating
}

/**
 * Segments beats foot to foot, time-normalizes each to its own interval, averages them
 * into a template, drops beats that correlate below 0.8 with it, and measures rise and
 * half-amplitude width on the final template as fractions of the beat interval.
 */
export function pulseShape(w: Waveform, f0: number): PulseShape | null {
  const { fs } = w;
  // Wide band keeps the waveform shape; the narrow band around f0 only locates beats.
  // An 8 Hz ceiling rounded the systolic upstroke and biased rise time by about +35 ms.
  const wide = bandpass(w.signal, fs, 0.7, Math.min(12, fs / 2 - 1));
  const narrow = bandpass(w.signal, fs, Math.max(0.56, 0.6 * f0), 1.6 * f0);
  const sign = volumeSign(wide);
  const shape = shapeWithSign(wide, narrow, sign, fs, f0);
  // Large symmetric artefacts can still flip the skew. The averaged beat is a steadier
  // test of the same asymmetry: the right sign gives a clearly shorter rise.
  const flipped = shapeWithSign(wide, narrow, sign > 0 ? -1 : 1, fs, f0);
  return flipped && (!shape || flipped.riseFrac < shape.riseFrac - 0.05) ? flipped : shape;
}

function shapeWithSign(wideIn: Float64Array, narrowIn: Float64Array, sign: 1 | -1, fs: number, f0: number): PulseShape | null {
  const wide = sign > 0 ? wideIn : wideIn.map((v) => -v);
  const narrow = sign > 0 ? narrowIn : narrowIn.map((v) => -v);
  const period = fs / f0;
  const minGap = Math.max(1, Math.floor(0.6 * period));

  // Feet are found near troughs of the narrow band. Anchoring on peaks let a large
  // artefact pull the "peak", and with it the foot, into the middle of a beat.
  const troughs: number[] = [];
  for (let i = 1; i < narrow.length - 1; i++) {
    if (narrow[i] >= 0 || narrow[i] > narrow[i - 1] || narrow[i] >= narrow[i + 1]) continue;
    const last = troughs[troughs.length - 1];
    if (last === undefined || i - last >= minGap) troughs.push(i);
    else if (narrow[i] < narrow[last]) troughs[troughs.length - 1] = i;
  }

  const feet: number[] = [];
  const reach = Math.round(0.3 * period);
  for (const tr of troughs) {
    const foot = argExtreme(wide, tr - reach, tr + reach, false);
    if (foot < 1 || foot >= wide.length - 1) continue;
    const pos = foot + vertex(wide, foot);
    const last = feet[feet.length - 1];
    if (last === undefined || pos - last >= minGap) feet.push(pos);
    // Two candidates inside one beat: keep the lower one, which is the real foot.
    else if (wide[foot] < at(wide, last)) feet[feet.length - 1] = pos;
  }

  const intervals = feet.slice(1).map((f, i) => f - feet[i]);
  if (intervals.length < MIN_BEATS) return null;
  const typical = median(intervals);
  const beats: { shape: Float64Array; ibi: number }[] = [];
  intervals.forEach((len, i) => {
    // Missed or extra detections and ectopic beats distort the normalized shape.
    if (len < 0.7 * typical || len > 1.3 * typical) return;
    const shape = new Float64Array(TEMPLATE_POINTS);
    for (let k = 0; k < TEMPLATE_POINTS; k++) shape[k] = at(wide, feet[i] + (k * len) / (TEMPLATE_POINTS - 1));
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of shape) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (hi - lo <= 0) return;
    for (let k = 0; k < TEMPLATE_POINTS; k++) shape[k] = (shape[k] - lo) / (hi - lo);
    beats.push({ shape, ibi: len / fs });
  });
  if (beats.length < MIN_BEATS) return null;

  // A pointwise median keeps the first template clean when a minority of beats carry artefacts.
  const first = pointwiseMedian(beats.map((b) => b.shape));
  const kept = beats.filter((b) => correlation(b.shape, first) >= MIN_TEMPLATE_CORR);
  if (kept.length < MIN_BEATS) return null;
  const template = pointwiseMedian(kept.map((b) => b.shape));

  const span = TEMPLATE_POINTS - 1;
  const pk = argExtreme(template, 1, span - 1, true);
  const foot = argExtreme(template, 0, pk, false);
  if (pk <= foot) return null;
  const rise = (pk + vertex(template, pk) - (foot + vertex(template, foot))) / span;
  const half = template[foot] + (template[pk] - template[foot]) / 2;
  let left = NaN;
  for (let i = foot; i < pk; i++) {
    if (template[i] < half && template[i + 1] >= half) left = i + (half - template[i]) / (template[i + 1] - template[i]);
  }
  let right = NaN;
  for (let i = pk; i < span; i++) {
    if (template[i] >= half && template[i + 1] < half) {
      right = i + (template[i] - half) / (template[i] - template[i + 1]);
      break;
    }
  }
  const width = (right - left) / span;
  if (!Number.isFinite(width)) return null;
  return { riseFrac: rise, widthFrac: width, ibi: median(kept.map((b) => b.ibi)), beats: kept.length, candidates: beats.length, feet: feet.map((f) => f / fs) };
}

function modelSys(f: BpFeatures): number {
  return MODEL.sys.base + MODEL.sys.hr * (f.hr - MODEL.ref.hr) + MODEL.sys.rise * (f.riseFrac - MODEL.ref.rise);
}

function modelDia(f: BpFeatures): number {
  return MODEL.dia.base + MODEL.dia.hr * (f.hr - MODEL.ref.hr) + MODEL.dia.width * (f.widthFrac - MODEL.ref.width);
}

const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/**
 * Uncalibrated: absolute heuristic, withheld outside its declared range instead of
 * clamped. Calibrated: the cuff reading plus the model's predicted change since then.
 */
export function estimateFromFeatures(features: BpFeatures, beats: number, calibration: Calibration | null): BloodPressure {
  const withheld = (reason: string): BloodPressure => ({ kind: "withheld", reason, features, beats });
  if (!inRange(features.riseFrac, FEATURE_RANGE.riseFrac) || !inRange(features.widthFrac, FEATURE_RANGE.widthFrac)) {
    return withheld("Pulse shape outside the estimate's range");
  }
  if (calibration) {
    const dSys = modelSys(features) - modelSys(calibration.features);
    const dDia = modelDia(features) - modelDia(calibration.features);
    if (Math.abs(dSys) > MAX_CALIBRATED_DELTA.sys || Math.abs(dDia) > MAX_CALIBRATED_DELTA.dia) {
      return withheld("Change since calibration too large to estimate - recalibrate with your cuff");
    }
    return {
      kind: "estimate",
      sys: Math.round(calibration.sys + dSys),
      dia: Math.round(calibration.dia + dDia),
      uncertainty: UNCERTAINTY,
      calibrated: true,
      features,
      beats,
    };
  }
  const sys = modelSys(features);
  const dia = modelDia(features);
  if (!inRange(sys, OUTPUT_RANGE.sys) || !inRange(dia, OUTPUT_RANGE.dia) || sys - dia < OUTPUT_RANGE.minPulsePressure) {
    return withheld("Outside the uncalibrated estimate's range - calibrate with your cuff");
  }
  return { kind: "estimate", sys: Math.round(sys), dia: Math.round(dia), uncertainty: UNCERTAINTY, calibrated: false, features, beats };
}

export function estimateBloodPressure(
  w: Waveform | null,
  bpm: number | null,
  snrDb: number,
  calibration: Calibration | null = null,
): BloodPressure {
  if (!w || bpm === null) return { kind: "withheld", reason: "Scan too short for blood pressure" };
  if (snrDb < MIN_SNR_DB) return { kind: "withheld", reason: `Signal too weak for blood pressure (${snrDb.toFixed(1)} dB, needs ${MIN_SNR_DB})` };
  const shape = pulseShape(w, bpm / 60);
  if (!shape) return { kind: "withheld", reason: "Too few clean heartbeats for blood pressure" };
  return estimateFromFeatures({ hr: bpm, riseFrac: shape.riseFrac, widthFrac: shape.widthFrac }, shape.beats, calibration);
}
