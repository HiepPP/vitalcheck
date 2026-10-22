# TASK-002 HRV and breathing logic

Group: A (writes src/bp.ts, src/hrv.ts, src/hrv.test.ts)
Class: risky

## Brief

Goal: Compute RMSSD, SDNN, and a breathing rate from the beat feet of one scan. Check whether the user followed the 6 per minute guide.

Change: beat feet stay private in `shapeWithSign` -> `PulseShape.feet` exposes them, and a new pure module [src/hrv.ts](src/hrv.ts) turns them into HRV and a breathing rate.

Boundaries:

- Follows [ADR-0004](watchtower/decisions/ADR-0004-paced-hrv-over-free-breathing.md): the breathing rate is only a guide check, not a natural rate.
- Use the thresholds in [watchtower/CONTEXT.md](watchtower/CONTEXT.md) as named constants in [src/hrv.ts](src/hrv.ts). Do not change them to make a test pass.
- Keep [src/hrv.ts](src/hrv.ts) and [src/bp.ts](src/bp.ts) DOM-free, as [CLAUDE.md](CLAUDE.md) requires.
- Out-of-range results return `kind: "withheld"`. Never clamp, as in [src/bp.ts](src/bp.ts).
- Trap: `shapeWithSign` in [src/bp.ts](src/bp.ts): `feet` holds fractional sample indices. `PulseShape.feet` must be in seconds (divide by `fs`).
- Trap: `pulseShape` in [src/bp.ts](src/bp.ts) runs `shapeWithSign` twice, with both signs, and keeps one. `feet` must come from the kept result, or feet sit on peaks instead of feet.
- Trap: `feet` must hold every detected foot in time order, before the 0.7-1.3 interval gate in `shapeWithSign`. HRV does its own IBI cleaning.
- Planner call: `estimateHrv` calls `pulseShape` again. That repeats work already done for blood pressure, but it keeps `estimateBloodPressure` and its return type unchanged. The cost is small for 60 s of signal.
- Planner call: HRV uses the same beat feet as blood pressure. When `pulseShape` returns null, `estimateHrv` returns withheld. HRV does not get a separate foot-only path.
- Planner call: the local median for IBI cleaning is centred on the IBI, includes it, and spans 11 IBIs. The window shrinks at the ends of the series.
- Planner call: reason strings, shown to the user as is:
  - null waveform or null `bpm`: `Scan too short for HRV`
  - weak signal: `Signal too weak for HRV (<x.x> dB, needs 6)`
  - low frame rate: `Frame rate too low for HRV (<n> fps, needs 25)`
  - `pulseShape` null, or too few clean IBIs: `Too few clean heartbeats for HRV`
  - over the RMSSD or SDNN limit: `HRV outside the expected range - measure again`
- Planner call: a builder must not loosen a red-test tolerance. If a test fails on code that follows this spec, report the measured value as UNSATISFIABLE in the outcome. The planner then fixes the spec.
- Planner call: import `BREATH_IN_S` and `BREATH_OUT_S` from [src/breath.ts](src/breath.ts) for the guide rate, so it cannot drift from the pacer.

How:

- Add `feet: number[]` to `PulseShape` in [src/bp.ts](src/bp.ts). Fill it in `shapeWithSign`.
- Add `hrvFromFeet` in [src/hrv.ts](src/hrv.ts): IBIs from feet, local-median cleaning, RMSSD, SDNN, count and range gates, breathing rate.
- Breathing rate: put clean IBIs at the midpoint time of each beat, interpolate onto a 4 Hz grid, and take `peakFreq(spectrum(..., 0.05, 0.5))` from [src/dsp.ts](src/dsp.ts), times 60.
- Add `estimateHrv` in [src/hrv.ts](src/hrv.ts): null waveform, `snrDb`, and `fps` gates, then `pulseShape(waveform, bpm / 60)`, then `hrvFromFeet`.

Files:

- [src/bp.ts](src/bp.ts) (add `feet` to `PulseShape` and fill it in `shapeWithSign`)
- [src/hrv.ts](src/hrv.ts) (new pure module)
- [src/hrv.test.ts](src/hrv.test.ts) (new tests, below)

Interfaces:

- Produces: `PulseShape.feet: number[]` (foot times in seconds, ascending), used by `estimateHrv` in this TASK
- Produces: `export interface HrvInput { waveform: Waveform | null; bpm: number | null; snrDb: number; fps: number }` in src/hrv.ts for TASK-003
- Produces: `export type Hrv = { kind: "estimate"; rmssdMs: number; sdnnMs: number; beats: number; breathsPerMin: number | null; pacerFollowed: boolean } | { kind: "withheld"; reason: string }` in src/hrv.ts for TASK-003
- Produces: `export function estimateHrv(r: HrvInput): Hrv` in src/hrv.ts for TASK-003
- Produces: `export function hrvFromFeet(feet: number[]): Hrv` in src/hrv.ts, used by the tests in this TASK
- Produces: `export const PACED_BREATHS_PER_MIN: number` (6) in src/hrv.ts for TASK-003
- Produces: named threshold constants in src/hrv.ts with the values in watchtower/CONTEXT.md for TASK-004

Expected result:

- WHEN the feet come from a pulse whose rate swings with breathing THE `estimateHrv` SHALL return RMSSD and SDNN within 20% plus 5 ms of the true values, at 30 Hz and at 60 Hz.
- WHEN the heart rate is constant THE `estimateHrv` SHALL return RMSSD below 10 ms.
- WHEN the rate swings at 0.1 Hz THE `estimateHrv` SHALL return a breathing rate within 0.5 of 6 per minute and `pacerFollowed: true`.
- WHEN the rate swings at 0.25 Hz THE `estimateHrv` SHALL return a breathing rate within 1 of 15 per minute and `pacerFollowed: false`.
- IF one foot is missing THEN THE `hrvFromFeet` SHALL drop the long IBI and keep RMSSD within 20% plus 5 ms of the true value.
- IF `waveform` or `bpm` is null, `snrDb` is below 6, or `fps` is below 25 THEN THE `estimateHrv` SHALL return `kind: "withheld"` with a reason.
- IF fewer than 40 clean IBIs remain THEN THE `hrvFromFeet` SHALL return `kind: "withheld"`.
- IF clean IBIs are under 80% of all IBIs THEN THE `hrvFromFeet` SHALL return `kind: "withheld"`.
- IF RMSSD is above 200 ms or SDNN is above 250 ms THEN THE `hrvFromFeet` SHALL return `kind: "withheld"`, not a clamped value.

Red tests:

File: [src/hrv.test.ts](src/hrv.test.ts)

```ts
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
```

Anti-goal: blood-pressure output must not change; tripwire; read from `npx vitest run src/bp.test.ts` (all pass, same test count as before) before changes, after the [src/bp.ts](src/bp.ts) edit, and at completion.

## Verify

- `npx vitest run src/hrv.test.ts` -> all tests pass
- `npx vitest run src/bp.test.ts` -> all pass, same count as on the base commit
- `npm run typecheck` -> exit 0
- `rg -n "document|window" src/hrv.ts` -> no match (DOM-free)
- `rg -n "Math.min\(|Math.max\(" src/hrv.ts` -> any match is not used to clamp RMSSD, SDNN, or the breathing rate (read each hit)
