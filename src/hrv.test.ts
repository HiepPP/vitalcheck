import { describe, expect, it } from "vitest";
import { estimateHrv, hrvFromFeet, PACED_BREATHS_PER_MIN } from "./hrv";

/** Blood-volume pulse with a fast rise over 20% of the beat and a slower fall. */
function volume(phase: number): number {
  const rise = 0.2;
  return phase < rise
    ? 0.5 - 0.5 * Math.cos((Math.PI * phase) / rise)
    : 0.5 + 0.5 * Math.cos((Math.PI * (phase - rise)) / (1 - rise));
}

/** Pulse whose rate swings by `rsa` (fraction) at `breathHz`. Returns the true foot times. */
function rsaWave(o: { bpm: number; rsa: number; breathHz: number; fs?: number; seconds?: number }) {
  const { fs = 30, seconds = 60 } = o;
  const f0 = o.bpm / 60;
  const signal = new Float64Array(Math.round(fs * seconds));
  const feet: number[] = [0];
  let phase = 0;
  for (let i = 0; i < signal.length; i++) {
    const t = i / fs;
    signal[i] = volume(phase - Math.floor(phase));
    const f = f0 * (1 + o.rsa * Math.sin(2 * Math.PI * o.breathHz * t));
    const next = phase + f / fs;
    if (Math.floor(next) > Math.floor(phase)) feet.push(t + (Math.floor(next) - phase) / f);
    phase = next;
  }
  return { waveform: { signal, fs }, feet };
}

function truth(feet: number[]) {
  const ibi = feet.slice(1).map((f, i) => f - feet[i]);
  const m = ibi.reduce((a, b) => a + b, 0) / ibi.length;
  const sdnn = Math.sqrt(ibi.reduce((a, b) => a + (b - m) ** 2, 0) / (ibi.length - 1));
  const d = ibi.slice(1).map((v, i) => v - ibi[i]);
  const rmssd = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
  return { rmssdMs: rmssd * 1000, sdnnMs: sdnn * 1000 };
}

const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(0.2 * want + 5);

describe("estimateHrv", () => {
  for (const fs of [30, 60]) {
    it(`matches true RMSSD and SDNN at ${fs} Hz`, () => {
      const { waveform, feet } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1, fs });
      const r = estimateHrv({ waveform, bpm: 70, snrDb: 10, fps: fs });
      expect(r.kind).toBe("estimate");
      if (r.kind !== "estimate") return;
      const t = truth(feet);
      near(r.rmssdMs, t.rmssdMs);
      near(r.sdnnMs, t.sdnnMs);
      expect(r.beats).toBeGreaterThanOrEqual(40);
    });
  }

  it("keeps RMSSD low when the heart rate is constant", () => {
    const { waveform } = rsaWave({ bpm: 70, rsa: 0, breathHz: 0.1 });
    const r = estimateHrv({ waveform, bpm: 70, snrDb: 10, fps: 30 });
    expect(r.kind).toBe("estimate");
    if (r.kind === "estimate") expect(r.rmssdMs).toBeLessThan(10);
  });

  it("finds the 6 per minute guide rate", () => {
    const { waveform } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1 });
    const r = estimateHrv({ waveform, bpm: 70, snrDb: 10, fps: 30 });
    expect(PACED_BREATHS_PER_MIN).toBe(6);
    expect(r.kind).toBe("estimate");
    if (r.kind !== "estimate") return;
    expect(Math.abs(r.breathsPerMin! - 6)).toBeLessThanOrEqual(0.5);
    expect(r.pacerFollowed).toBe(true);
  });

  it("flags breathing that does not follow the guide", () => {
    const { waveform } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.25 });
    const r = estimateHrv({ waveform, bpm: 70, snrDb: 10, fps: 30 });
    expect(r.kind).toBe("estimate");
    if (r.kind !== "estimate") return;
    expect(Math.abs(r.breathsPerMin! - 15)).toBeLessThanOrEqual(1);
    expect(r.pacerFollowed).toBe(false);
  });

  it("withholds without a waveform, with a weak signal, or at a low frame rate", () => {
    const { waveform } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1 });
    expect(estimateHrv({ waveform: null, bpm: null, snrDb: -Infinity, fps: 30 }).kind).toBe("withheld");
    expect(estimateHrv({ waveform, bpm: 70, snrDb: 5, fps: 30 }).kind).toBe("withheld");
    expect(estimateHrv({ waveform, bpm: 70, snrDb: 10, fps: 20 }).kind).toBe("withheld");
    expect(estimateHrv({ waveform, bpm: null, snrDb: 10, fps: 30 }).kind).toBe("withheld");
  });
});

describe("hrvFromFeet", () => {
  it("drops the long interval of a missed beat", () => {
    const { feet } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1 });
    const missed = [...feet.slice(0, 30), ...feet.slice(31)];
    const r = hrvFromFeet(missed);
    expect(r.kind).toBe("estimate");
    if (r.kind !== "estimate") return;
    expect(r.beats).toBeLessThan(missed.length - 1);
    near(r.rmssdMs, truth(feet).rmssdMs);
  });

  it("withholds RMSSD above 200 ms instead of clamping it", () => {
    // Alternating 1.2 s and 1.42 s intervals stay within 20% of the local median,
    // whichever of the two it is, and give an RMSSD of 220 ms.
    const feet = [0];
    for (let i = 0; i < 70; i++) feet.push(feet[i] + (i % 2 ? 1.42 : 1.2));
    expect(hrvFromFeet(feet).kind).toBe("withheld");
  });

  it("withholds when clean intervals are under 80% of all intervals", () => {
    const { feet } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1 });
    // A false foot in the middle of every third beat splits it into two short intervals.
    const noisy: number[] = [];
    feet.forEach((f, i) => {
      noisy.push(f);
      if (i % 3 === 0 && i + 1 < feet.length) noisy.push((f + feet[i + 1]) / 2);
    });
    expect(hrvFromFeet(noisy).kind).toBe("withheld");
  });

  it("withholds when fewer than 40 clean intervals remain", () => {
    const { feet } = rsaWave({ bpm: 70, rsa: 0.08, breathHz: 0.1, seconds: 30 });
    expect(hrvFromFeet(feet).kind).toBe("withheld");
  });
});
