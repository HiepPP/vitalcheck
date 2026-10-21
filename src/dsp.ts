// rPPG signal processing: uniform resampling, POS (Wang et al. 2017),
// zero-phase Butterworth band-pass, windowed DFT and harmonic SNR.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Sample extends Rgb {
  t: number; // seconds
  y: number; // normalized nose y, NaN when unknown
  parts?: Rgb[]; // per-patch means, NaN when a patch had too little skin
}

interface Series {
  fs: number;
  t0: number;
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  y: Float64Array;
}

interface Spectrum {
  freqs: Float64Array;
  power: Float64Array;
}

export interface PulseResult {
  bpm: number | null;
  snrDb: number;
  quality: number; // 0..1
  fps: number;
  seconds: number;
  patchesUsed: number;
  /** Unfiltered whole-face POS signal; per-patch fusion is band-limited and loses pulse shape. */
  waveform: { signal: Float64Array; fs: number } | null;
}

/** Heart-rate band in Hz: 42-210 BPM. */
export const HR_BAND = [0.7, 3.5] as const;

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
}

export function std(x: ArrayLike<number>): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return x.length > 1 ? Math.sqrt(s / (x.length - 1)) : 0;
}

export function fps(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  return (samples.length - 1) / (samples[samples.length - 1].t - samples[0].t);
}

/** Linear interpolation onto a uniform grid; frame times from the camera are irregular. */
function resample(samples: Sample[], fs: number, t0 = samples[0]?.t ?? 0, n?: number): Series {
  const empty = new Float64Array();
  if (samples.length < 2) return { fs, t0, r: empty, g: empty, b: empty, y: empty };
  const len = n ?? Math.floor((samples[samples.length - 1].t - t0) * fs) + 1;
  const r = new Float64Array(len);
  const g = new Float64Array(len);
  const b = new Float64Array(len);
  const y = new Float64Array(len);
  let j = 0;
  for (let i = 0; i < len; i++) {
    const t = t0 + i / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const p = samples[j];
    const q = samples[j + 1];
    const f = q.t > p.t ? Math.min(1, Math.max(0, (t - p.t) / (q.t - p.t))) : 0;
    r[i] = p.r + (q.r - p.r) * f;
    g[i] = p.g + (q.g - p.g) * f;
    b[i] = p.b + (q.b - p.b) * f;
    y[i] = p.y + (q.y - p.y) * f;
  }
  return { fs, t0, r, g, b, y };
}

/** Plane-Orthogonal-to-Skin projection with 1.6 s overlap-add windows. */
export function pos(r: Float64Array, g: Float64Array, b: Float64Array, fs: number): Float64Array {
  const n = r.length;
  const w = Math.max(2, Math.round(1.6 * fs));
  const out = new Float64Array(n);
  if (n < w) return out;
  const s1 = new Float64Array(w);
  const s2 = new Float64Array(w);
  for (let start = 0; start + w <= n; start++) {
    let mr = 0;
    let mg = 0;
    let mb = 0;
    for (let k = 0; k < w; k++) {
      mr += r[start + k];
      mg += g[start + k];
      mb += b[start + k];
    }
    mr /= w;
    mg /= w;
    mb /= w;
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    for (let k = 0; k < w; k++) {
      const rn = r[start + k] / mr;
      const gn = g[start + k] / mg;
      const bn = b[start + k] / mb;
      s1[k] = gn - bn;
      s2[k] = gn + bn - 2 * rn;
    }
    const d = std(s2);
    const alpha = d > 0 ? std(s1) / d : 0;
    let m = 0;
    for (let k = 0; k < w; k++) m += s1[k] + alpha * s2[k];
    m /= w;
    for (let k = 0; k < w; k++) out[start + k] += s1[k] + alpha * s2[k] - m;
  }
  return out;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function butter2(type: "lp" | "hp", fc: number, fs: number): Biquad {
  const w = (2 * Math.PI * fc) / fs;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const k = type === "lp" ? (1 - c) / 2 : (1 + c) / 2;
  const b1 = type === "lp" ? 1 - c : -(1 + c);
  return { b0: k / a0, b1: b1 / a0, b2: k / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

function runBiquad(x: Float64Array, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** 4th-order high-pass + 4th-order low-pass, run forward and backward (zero phase). */
export function bandpass(x: Float64Array, fs: number, lo: number, hi: number): Float64Array {
  const n = x.length;
  if (n < 4) return new Float64Array(x);
  // Odd reflection at both ends suppresses filter start-up transients.
  const pad = Math.min(n - 1, Math.round((3 * fs) / lo));
  const m = mean(x);
  const buf = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) buf[i] = 2 * (x[0] - m) - (x[pad - i] - m);
  for (let i = 0; i < n; i++) buf[pad + i] = x[i] - m;
  for (let i = 0; i < pad; i++) buf[pad + n + i] = 2 * (x[n - 1] - m) - (x[n - 2 - i] - m);
  const stages = [butter2("hp", lo, fs), butter2("hp", lo, fs), butter2("lp", hi, fs), butter2("lp", hi, fs)];
  let y: Float64Array = buf;
  for (const s of stages) y = runBiquad(y, s);
  y.reverse();
  for (const s of stages) y = runBiquad(y, s);
  y.reverse();
  return y.slice(pad, pad + n);
}

/** Hann-windowed DFT evaluated only on [lo, hi] with a fine frequency step. */
export function spectrum(x: Float64Array, fs: number, lo: number, hi: number, step = 0.005): Spectrum {
  const n = x.length;
  const bins = Math.max(1, Math.floor((hi - lo) / step) + 1);
  const freqs = new Float64Array(bins);
  const power = new Float64Array(bins);
  const m = mean(x);
  const xw = new Float64Array(n);
  for (let i = 0; i < n; i++) xw[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  for (let k = 0; k < bins; k++) {
    const f = lo + k * step;
    const w = (2 * Math.PI * f) / fs;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      re += xw[i] * Math.cos(w * i);
      im -= xw[i] * Math.sin(w * i);
    }
    freqs[k] = f;
    power[k] = re * re + im * im;
  }
  return { freqs, power };
}

export function peakFreq(s: Spectrum): number {
  let best = 0;
  for (let i = 1; i < s.power.length; i++) if (s.power[i] > s.power[best]) best = i;
  return s.freqs[best];
}

/** Mean power near f0 and its harmonics versus the rest of the band, in dB. */
export function snrDb(s: Spectrum, f0: number): number {
  let sig = 0;
  let noise = 0;
  let ns = 0;
  let nn = 0;
  const top = s.freqs[s.freqs.length - 1];
  for (let i = 0; i < s.freqs.length; i++) {
    const f = s.freqs[i];
    let harmonic = false;
    for (let h = 1; h * f0 <= top + 0.2; h++) {
      if (Math.abs(f - h * f0) <= 0.1 * h) {
        harmonic = true;
        break;
      }
    }
    if (harmonic) {
      sig += s.power[i];
      ns++;
    } else {
      noise += s.power[i];
      nn++;
    }
  }
  if (!ns || !nn) return -Infinity;
  return 10 * Math.log10((sig / ns + 1e-12) / (noise / nn + 1e-12));
}

function bandSpectrum(x: Float64Array, fs: number, step?: number): Spectrum {
  return spectrum(bandpass(x, fs, HR_BAND[0], HR_BAND[1]), fs, HR_BAND[0], HR_BAND[1], step);
}

/** Shift `x` in place to best correlate with `ref` within ±maxLag samples. */
function alignTo(x: Float64Array, ref: Float64Array, maxLag: number): void {
  const n = x.length;
  let lag = 0;
  let best = -Infinity;
  for (let l = -maxLag; l <= maxLag; l++) {
    let c = 0;
    for (let i = Math.max(0, -l); i < Math.min(n, n - l); i++) c += x[i + l] * ref[i];
    if (c > best) {
      best = c;
      lag = l;
    }
  }
  if (lag === 0) return;
  const src = x.slice();
  for (let i = 0; i < n; i++) {
    const j = i + lag;
    x[i] = j >= 0 && j < n ? src[j] : 0;
  }
}

/** POS per patch, aligned and weighted by each patch's linear SNR at the global pulse frequency. */
function fusePatches(samples: Sample[], global: Series): { signal: Float64Array; used: number } | null {
  const parts = samples.find((s) => s.parts)?.parts?.length ?? 0;
  const n = global.r.length;
  if (parts < 2 || !n) return null;
  const fs = global.fs;
  const f0 = peakFreq(bandSpectrum(pos(global.r, global.g, global.b, fs), fs));
  const fused = new Float64Array(n);
  let weights = 0;
  let used = 0;
  let ref: Float64Array | null = null;
  for (let p = 0; p < parts; p++) {
    const rows = samples
      .filter((s) => s.parts && Number.isFinite(s.parts[p]?.r))
      .map((s) => ({ t: s.t, ...s.parts![p], y: NaN }));
    if (rows.length < n * 0.8) continue;
    const ser = resample(rows, fs, global.t0, n);
    const sig = bandpass(pos(ser.r, ser.g, ser.b, fs), fs, HR_BAND[0], HR_BAND[1]);
    const w = 10 ** (snrDb(spectrum(sig, fs, HR_BAND[0], HR_BAND[1]), f0) / 10);
    if (!Number.isFinite(w) || w <= 0) continue;
    const rms = Math.sqrt(mean(sig.map((v) => v * v)));
    if (rms <= 0) continue;
    const norm = sig.map((v) => v / rms);
    if (ref) alignTo(norm, ref, Math.max(1, Math.round((0.25 * fs) / f0)));
    else ref = norm;
    for (let i = 0; i < n; i++) fused[i] += norm[i] * w;
    weights += w;
    used++;
  }
  if (used < 2 || weights <= 0) return null;
  for (let i = 0; i < n; i++) fused[i] /= weights;
  return { signal: fused, used };
}

function analysisRate(samples: Sample[]): number {
  const f = fps(samples);
  return f >= 90 ? 120 : f >= 45 ? 60 : 30;
}

/** Final estimate over the whole recording. Needs at least 15 s. */
export function analyze(samples: Sample[]): PulseResult {
  const seconds = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;
  const base: PulseResult = { bpm: null, snrDb: -Infinity, quality: 0, fps: fps(samples), seconds, patchesUsed: 0, waveform: null };
  const fs = analysisRate(samples);
  const ser = resample(samples, fs);
  if (ser.r.length < fs * 15) return base;
  const whole = pos(ser.r, ser.g, ser.b, fs);
  const fused = fusePatches(samples, ser);
  const score = (x: Float64Array) => {
    const s = bandSpectrum(x, fs);
    return snrDb(s, peakFreq(s));
  };
  const signal = fused && score(fused.signal) > score(whole) ? fused.signal : whole;
  const spec = bandSpectrum(signal, fs);
  const f0 = peakFreq(spec);
  const snr = snrDb(spec, f0);
  return {
    ...base,
    bpm: f0 * 60,
    snrDb: snr,
    quality: Math.max(0, Math.min(1, snr / 10)),
    patchesUsed: signal === fused?.signal ? fused.used : 0,
    waveform: { signal: whole, fs },
  };
}

/** Live estimate over the last `window` seconds at a fixed 30 Hz grid. */
export function liveEstimate(samples: Sample[], window = 10): { bpm: number; snrDb: number } | null {
  const end = samples[samples.length - 1]?.t ?? 0;
  const recent = samples.filter((s) => s.t >= end - window);
  if (recent.length < 2 || recent[recent.length - 1].t - recent[0].t < window * 0.8 || fps(recent) < 6) return null;
  const ser = resample(recent, 30);
  const spec = bandSpectrum(pos(ser.r, ser.g, ser.b, 30), 30, 0.01);
  const f0 = peakFreq(spec);
  return { bpm: f0 * 60, snrDb: snrDb(spec, f0) };
}
