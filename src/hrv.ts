// Heart-rate variability and breathing rate from the beat feet of one scan.
//
// The pacer guides breathing at 6 per minute for the whole scan, so HRV is measured
// during paced breathing, and the breathing rate only checks whether the user followed
// the guide. It is not a natural breathing rate.
import { pulseShape, type Waveform } from "./bp";
import { BREATH_IN_S, BREATH_OUT_S } from "./breath";
import { peakFreq, spectrum } from "./dsp";

export interface HrvInput {
  waveform: Waveform | null;
  bpm: number | null;
  snrDb: number;
  fps: number; // measured camera frame rate
}

export type Hrv =
  | {
      kind: "estimate";
      rmssdMs: number;
      sdnnMs: number;
      beats: number;
      breathsPerMin: number | null;
      pacerFollowed: boolean;
    }
  | { kind: "withheld"; reason: string };

export const PACED_BREATHS_PER_MIN = 60 / (BREATH_IN_S + BREATH_OUT_S);

export const MIN_SNR_DB = 6;
/** Below this frame rate, foot timing error swamps beat-to-beat change. */
export const MIN_FPS = 25;
/** An IBI is clean when it is within this fraction of the median of the IBIs around it. */
export const CLEAN_TOLERANCE = 0.2;
export const MEDIAN_WINDOW = 11;
export const MIN_CLEAN_IBIS = 40;
export const MIN_CLEAN_FRACTION = 0.8;
export const MAX_RMSSD_MS = 200;
export const MAX_SDNN_MS = 250;
/** Breathing search band, 3 to 30 breaths per minute. */
export const BREATH_BAND_HZ = [0.05, 0.5] as const;
export const PACER_TOLERANCE_PER_MIN = 1;
const RESAMPLE_HZ = 4;

const FEW_BEATS = "Too few clean heartbeats for HRV";

function median(x: number[]): number {
  const s = [...x].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Breaths per minute from the IBI series: clean IBIs at beat midpoints, resampled to 4 Hz. */
function breathRate(times: number[], ibis: number[]): number | null {
  const start = times[0];
  const n = Math.floor((times[times.length - 1] - start) * RESAMPLE_HZ) + 1;
  if (n < 2) return null;
  const grid = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = start + k / RESAMPLE_HZ;
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const u = (t - times[j]) / (times[j + 1] - times[j]);
    grid[k] = ibis[j] + (ibis[j + 1] - ibis[j]) * u;
  }
  return 60 * peakFreq(spectrum(grid, RESAMPLE_HZ, BREATH_BAND_HZ[0], BREATH_BAND_HZ[1]));
}

/** HRV from foot times in seconds, ascending. Cleans the beat intervals itself. */
export function hrvFromFeet(feet: number[]): Hrv {
  const ibis = feet.slice(1).map((f, i) => f - feet[i]);
  const half = MEDIAN_WINDOW >> 1;
  // The median spans 11 IBIs centred on this one, includes it, and shrinks at the series ends.
  const clean = ibis.map((v, i) => {
    const local = median(ibis.slice(Math.max(0, i - half), i + half + 1));
    return Math.abs(v - local) <= CLEAN_TOLERANCE * local;
  });
  const kept = ibis.filter((_, i) => clean[i]);
  if (kept.length < MIN_CLEAN_IBIS || kept.length < MIN_CLEAN_FRACTION * ibis.length) {
    return { kind: "withheld", reason: FEW_BEATS };
  }

  let sq = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < ibis.length; i++) {
    if (!clean[i] || !clean[i + 1]) continue;
    sq += (ibis[i + 1] - ibis[i]) ** 2;
    pairs++;
  }
  if (pairs === 0) return { kind: "withheld", reason: FEW_BEATS };
  const rmssdMs = 1000 * Math.sqrt(sq / pairs);
  const m = kept.reduce((a, b) => a + b, 0) / kept.length;
  const sdnnMs = 1000 * Math.sqrt(kept.reduce((a, b) => a + (b - m) ** 2, 0) / (kept.length - 1));
  if (rmssdMs > MAX_RMSSD_MS || sdnnMs > MAX_SDNN_MS) {
    return { kind: "withheld", reason: "HRV outside the expected range - measure again" };
  }

  const times = ibis.flatMap((_, i) => (clean[i] ? [(feet[i] + feet[i + 1]) / 2] : []));
  const breathsPerMin = breathRate(times, kept);
  const pacerFollowed =
    breathsPerMin !== null &&
    Math.abs(breathsPerMin - PACED_BREATHS_PER_MIN) <= PACER_TOLERANCE_PER_MIN;
  return {
    kind: "estimate",
    rmssdMs,
    sdnnMs,
    beats: kept.length,
    breathsPerMin,
    pacerFollowed,
  };
}

export function estimateHrv(r: HrvInput): Hrv {
  if (!r.waveform || r.bpm === null) return { kind: "withheld", reason: "Scan too short for HRV" };
  if (r.snrDb < MIN_SNR_DB) {
    const reason = `Signal too weak for HRV (${r.snrDb.toFixed(1)} dB, needs ${MIN_SNR_DB})`;
    return { kind: "withheld", reason };
  }
  if (r.fps < MIN_FPS) {
    const reason = `Frame rate too low for HRV (${Math.round(r.fps)} fps, needs ${MIN_FPS})`;
    return { kind: "withheld", reason };
  }
  // Repeats the beat search already done for blood pressure, so that estimate stays unchanged.
  const shape = pulseShape(r.waveform, r.bpm / 60);
  if (!shape) return { kind: "withheld", reason: FEW_BEATS };
  return hrvFromFeet(shape.feet);
}
