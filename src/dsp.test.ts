import { describe, expect, it } from "vitest";
import { analyze, liveEstimate, type Sample } from "./dsp";

// Seeded PRNG so failures reproduce.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  };
}

/**
 * Synthetic face video: skin colour with a small pulsatile component (strongest in
 * green, as with haemoglobin absorption), slow multiplicative illumination drift,
 * per-frame noise and irregular frame timing.
 */
function synth(opts: { bpm: number; seconds?: number; fps?: number; pulse?: number; parts?: number; noisyPart?: boolean }) {
  const { bpm, seconds = 60, fps = 30, pulse = 0.004, parts = 0 } = opts;
  const rand = rng(42);
  const f = bpm / 60;
  const out: Sample[] = [];
  let t = 0;
  while (t < seconds) {
    const light = 1 + 0.05 * Math.sin(2 * Math.PI * 0.05 * t);
    const p = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t + 1);
    const px = (k: number) => {
      const noise = k === 0 && opts.noisyPart ? 0.02 : 0.002;
      return {
        r: 170 * light * (1 + 0.3 * pulse * p + noise * rand()),
        g: 120 * light * (1 + pulse * p + noise * rand()),
        b: 100 * light * (1 + 0.5 * pulse * p + noise * rand()),
      };
    };
    const whole = px(-1);
    out.push({
      t,
      ...whole,
      y: 0.5,
      parts: parts ? Array.from({ length: parts }, (_, k) => px(k)) : undefined,
    });
    t += (1 / fps) * (1 + 0.3 * rand());
  }
  return out;
}

describe("analyze", () => {
  it.each([55, 72, 110])("recovers %i BPM from a 60 s whole-face signal", (bpm) => {
    const r = analyze(synth({ bpm }));
    expect(r.bpm).not.toBeNull();
    expect(Math.abs(r.bpm! - bpm)).toBeLessThan(1.5);
    expect(r.quality).toBeGreaterThan(0.5);
  });

  it("fuses patches and still finds the pulse when one patch is noisy", () => {
    const r = analyze(synth({ bpm: 80, parts: 16, noisyPart: true }));
    expect(Math.abs(r.bpm! - 80)).toBeLessThan(1.5);
  });

  it("reports low quality when there is no pulse", () => {
    const r = analyze(synth({ bpm: 72, pulse: 0 }));
    expect(r.quality).toBeLessThan(0.3);
  });

  it("refuses to estimate from less than 15 s", () => {
    expect(analyze(synth({ bpm: 72, seconds: 10 })).bpm).toBeNull();
  });
});

describe("liveEstimate", () => {
  it("tracks the last 10 s", () => {
    const live = liveEstimate(synth({ bpm: 90, seconds: 12 }));
    expect(live).not.toBeNull();
    expect(Math.abs(live!.bpm - 90)).toBeLessThan(3);
  });
});
