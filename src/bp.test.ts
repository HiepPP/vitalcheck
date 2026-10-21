import { describe, expect, it } from "vitest";
import { analyze, bandpass, type Sample } from "./dsp";
import { estimateBloodPressure, estimateFromFeatures, pulseShape, volumeSign, type BpFeatures } from "./bp";
import { CALIBRATION_KEY, clearCalibration, loadCalibration, makeCalibration, parseCalibration, saveCalibration } from "./calibration";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  };
}

/** Blood-volume pulse: fast cosine rise over `riseFrac` of the beat, slower cosine fall. */
function volume(phase: number, riseFrac: number): number {
  return phase < riseFrac
    ? 0.5 - 0.5 * Math.cos((Math.PI * phase) / riseFrac)
    : 0.5 + 0.5 * Math.cos((Math.PI * (phase - riseFrac)) / (1 - riseFrac));
}

interface WaveOpts {
  bpm: number;
  riseFrac: number;
  fs?: number;
  seconds?: number;
  sign?: 1 | -1;
  noise?: number;
  /** Amplitude of a 20 Hz sawtooth that rises slowly and drops sharply (needs fs >= 60). */
  sawtooth?: number;
  /** Adds a motion-like spike in the middle of every n-th beat. */
  spikeEvery?: number;
}

/** A POS-like signal built directly, so shape features have a known ground truth. */
function wave(o: WaveOpts) {
  const { fs = 30, seconds = 60, sign = 1, noise = 0, sawtooth = 0 } = o;
  const rand = rng(11);
  const f = o.bpm / 60;
  const signal = new Float64Array(Math.round(fs * seconds));
  for (let i = 0; i < signal.length; i++) {
    const t = i / fs;
    const beat = Math.floor(t * f);
    const phase = t * f - beat;
    let v = volume(phase, o.riseFrac);
    if (o.spikeEvery && beat % o.spikeEvery === 0) v += 1.5 * Math.exp(-(((phase - 0.65) / 0.04) ** 2));
    v += noise * rand() + sawtooth * ((t * 20) % 1);
    signal[i] = sign * v;
  }
  return { signal, fs };
}

describe("pulseShape", () => {
  it("measures rise as a fraction of the beat interval", () => {
    const s = pulseShape(wave({ bpm: 70, riseFrac: 0.2 }), 70 / 60)!;
    expect(s).not.toBeNull();
    // Band-limiting rounds the upstroke, so the measurement runs slightly long.
    expect(s.riseFrac - 0.2).toBeGreaterThan(-0.02);
    expect(s.riseFrac - 0.2).toBeLessThan(0.05);
    expect(s.ibi).toBeCloseTo(60 / 70, 2);
  });

  it("gives the same normalized shape at different heart rates (review point 1)", () => {
    const slow = pulseShape(wave({ bpm: 60, riseFrac: 0.2 }), 1)!;
    const fast = pulseShape(wave({ bpm: 100, riseFrac: 0.2 }), 100 / 60)!;
    // Absolute PW50 differed by about 0.2 s between these rates; the fraction must not.
    expect(Math.abs(slow.widthFrac - fast.widthFrac)).toBeLessThan(0.01);
    // Filtering rounds the upstroke by a roughly fixed time (about 25-30 ms here), which
    // is a larger fraction of a shorter beat, so riseFrac keeps a small residual HR trend.
    expect(Math.abs(slow.riseFrac - fast.riseFrac)).toBeLessThan(0.06);
  });

  it("drops beats that do not match the template and keeps the shape (review point 2)", () => {
    const clean = pulseShape(wave({ bpm: 70, riseFrac: 0.2 }), 70 / 60)!;
    const spikyWave = wave({ bpm: 70, riseFrac: 0.2, spikeEvery: 4 });
    // These spikes outgrow the pulse and flip even the filtered skew, so the averaged-beat
    // polarity check must recover the sign and spikes must not move the beat feet.
    expect(volumeSign(bandpass(spikyWave.signal, spikyWave.fs, 0.7, 12))).toBe(-1);
    const spiky = pulseShape(spikyWave, 70 / 60)!;
    expect(spiky).not.toBeNull();
    expect(spiky.beats).toBeLessThan(spiky.candidates);
    expect(spiky.candidates - spiky.beats).toBeGreaterThanOrEqual(Math.floor(spiky.candidates / 4) - 2);
    expect(Math.abs(spiky.riseFrac - clean.riseFrac)).toBeLessThan(0.02);
    expect(Math.abs(spiky.widthFrac - clean.widthFrac)).toBeLessThan(0.02);
  });

  it("orients a noisy, inverted signal from the filtered waveform (review point 3)", () => {
    const opts = { bpm: 70, riseFrac: 0.2, fs: 60, noise: 0.05, sawtooth: 0.5 } as const;
    const upright = wave(opts);
    const inverted = wave({ ...opts, sign: -1 });
    // On the raw signal the sharp sawtooth drops dominate the skew and pick the wrong sign.
    expect(volumeSign(upright.signal)).toBe(-1);
    const a = pulseShape(upright, 70 / 60)!;
    const b = pulseShape(inverted, 70 / 60)!;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a.riseFrac - 0.2)).toBeLessThan(0.05);
    expect(Math.abs(b.riseFrac - 0.2)).toBeLessThan(0.05);
  });
});

const typical: BpFeatures = { hr: 70, riseFrac: 0.2, widthFrac: 0.45 };

describe("estimateFromFeatures", () => {
  it("returns the uncalibrated estimate inside the model range", () => {
    expect(estimateFromFeatures(typical, 60, null)).toMatchObject({ kind: "estimate", sys: 120, dia: 80, calibrated: false });
  });

  it("withholds instead of clamping outside the model range (review point 4)", () => {
    const r = estimateFromFeatures({ hr: 190, riseFrac: 0.06, widthFrac: 0.3 }, 60, null);
    expect(r.kind).toBe("withheld");
    if (r.kind === "withheld") {
      expect(r.reason).toMatch(/calibrate/);
      // Features stay available so the user can calibrate from this scan.
      expect(r.features).toEqual({ hr: 190, riseFrac: 0.06, widthFrac: 0.3 });
    }
  });

  it("withholds when the pulse shape itself is implausible", () => {
    expect(estimateFromFeatures({ ...typical, riseFrac: 0.6 }, 60, null).kind).toBe("withheld");
  });
});

describe("calibration", () => {
  const cal = makeCalibration(135, 88, typical, new Date("2026-10-21T09:00:00Z"));
  if (!cal.ok) throw new Error(cal.error);

  it("reproduces the cuff reading for the calibration scan's own features", () => {
    expect(estimateFromFeatures(typical, 60, cal.value)).toMatchObject({ kind: "estimate", sys: 135, dia: 88, calibrated: true });
  });

  it("estimates only the model's change from the cuff reading", () => {
    // +20 BPM -> +0.3*20 SYS and +0.25*20 DIA; a faster upstroke raises SYS further.
    expect(estimateFromFeatures({ ...typical, hr: 90 }, 60, cal.value)).toMatchObject({ sys: 141, dia: 93 });
    expect(estimateFromFeatures({ ...typical, riseFrac: 0.1 }, 60, cal.value)).toMatchObject({ sys: 140, dia: 88 });
  });

  it("does not apply the uncalibrated output range to a calibrated reading", () => {
    const high = makeCalibration(175, 105, typical, new Date());
    if (!high.ok) throw new Error(high.error);
    expect(estimateFromFeatures(typical, 60, high.value)).toMatchObject({ kind: "estimate", sys: 175, dia: 105 });
  });

  it("withholds a change too large to trust", () => {
    const r = estimateFromFeatures({ ...typical, hr: 160 }, 60, cal.value);
    expect(r).toMatchObject({ kind: "withheld" });
  });

  it("validates cuff input", () => {
    expect(makeCalibration(120, 125, typical, new Date())).toMatchObject({ ok: false });
    expect(makeCalibration(300, 80, typical, new Date())).toMatchObject({ ok: false });
    expect(makeCalibration(120.5, 80, typical, new Date())).toMatchObject({ ok: false });
  });

  it("round-trips through storage and ignores malformed data", () => {
    const store = new Map<string, string>();
    const kv = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    expect(loadCalibration(kv)).toBeNull();
    saveCalibration(cal.value, kv);
    expect(loadCalibration(kv)).toEqual(cal.value);
    store.set(CALIBRATION_KEY, "{not json");
    expect(loadCalibration(kv)).toBeNull();
    expect(parseCalibration(JSON.stringify({ ...cal.value, sys: "135" }))).toBeNull();
    expect(parseCalibration(JSON.stringify({ ...cal.value, features: { hr: 70 } }))).toBeNull();
    clearCalibration(kv);
    expect(store.has(CALIBRATION_KEY)).toBe(false);
  });
});

/** RGB frames from a volume pulse: more blood absorbs more light, green most strongly. */
function synthFrames(bpm: number, riseFrac: number, pulse = 0.006, seconds = 60): Sample[] {
  const rand = rng(7);
  const f = bpm / 60;
  const out: Sample[] = [];
  for (let t = 0; t < seconds; t += (1 / 30) * (1 + 0.2 * rand())) {
    const v = volume((t * f) % 1, riseFrac);
    out.push({
      t,
      r: 170 * (1 - 0.3 * pulse * v + 0.001 * rand()),
      g: 120 * (1 - pulse * v + 0.001 * rand()),
      b: 100 * (1 - 0.5 * pulse * v + 0.001 * rand()),
      y: 0.5,
    });
  }
  return out;
}

describe("estimateBloodPressure from frames", () => {
  it("estimates from a full scan and maps a faster upstroke to a higher systolic value", () => {
    const fast = analyze(synthFrames(70, 0.12));
    const slow = analyze(synthFrames(70, 0.28));
    const a = estimateBloodPressure(fast.waveform, fast.bpm, fast.snrDb);
    const b = estimateBloodPressure(slow.waveform, slow.bpm, slow.snrDb);
    expect(a.kind).toBe("estimate");
    expect(b.kind).toBe("estimate");
    if (a.kind === "estimate" && b.kind === "estimate") expect(a.sys).toBeGreaterThan(b.sys);
  });

  it("withholds the estimate when there is no pulse", () => {
    const r = analyze(synthFrames(70, 0.2, 0));
    expect(estimateBloodPressure(r.waveform, r.bpm, r.snrDb).kind).toBe("withheld");
  });

  it("withholds the estimate for a short scan", () => {
    const r = analyze(synthFrames(70, 0.2, 0.006, 10));
    expect(estimateBloodPressure(r.waveform, r.bpm, r.snrDb)).toEqual({ kind: "withheld", reason: "Scan too short for blood pressure" });
  });
});
