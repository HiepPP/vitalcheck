# TASK-002 Outcome

## Status

DONE

## Changed

- `src/bp.ts`: `PulseShape.feet: number[]` added. `shapeWithSign` fills it with every detected foot, in seconds (`f / fs`), before the 0.7-1.3 interval gate. `pulseShape` returns the kept sign's result, so `feet` comes from it.
- `src/hrv.ts` (new, DOM-free): `HrvInput`, `Hrv`, `estimateHrv`, `hrvFromFeet`, `PACED_BREATHS_PER_MIN`, and the threshold constants.
- `src/hrv.test.ts` (new): the spec's red tests, verbatim.

## Contract

- `PulseShape.feet: number[]`: foot times in seconds, ascending.
- `export interface HrvInput { waveform: Waveform | null; bpm: number | null; snrDb: number; fps: number }`
- `export type Hrv = { kind: "estimate"; rmssdMs; sdnnMs; beats; breathsPerMin: number | null; pacerFollowed: boolean } | { kind: "withheld"; reason: string }`
- `export function estimateHrv(r: HrvInput): Hrv`, `export function hrvFromFeet(feet: number[]): Hrv`
- `export const PACED_BREATHS_PER_MIN` = `60 / (BREATH_IN_S + BREATH_OUT_S)` = 6.
- Threshold constants for TASK-004: `MIN_SNR_DB` 6, `MIN_FPS` 25, `CLEAN_TOLERANCE` 0.2, `MEDIAN_WINDOW` 11, `MIN_CLEAN_IBIS` 40, `MIN_CLEAN_FRACTION` 0.8, `MAX_RMSSD_MS` 200, `MAX_SDNN_MS` 250, `BREATH_BAND_HZ` [0.05, 0.5], `PACER_TOLERANCE_PER_MIN` 1.
- Reason strings match the spec's planner call. The fps reason rounds `fps` to a whole number.

## Verified

- Red: `npx vitest run src/hrv.test.ts` before any other edit gave `Cannot find module './hrv'` (0 tests, suite failed), 2026-10-22 18:09.
- `npx vitest run src/hrv.test.ts`: 10/10 pass.
- `npm run typecheck`: exit 0.
- `rg -n "document|window" src/hrv.ts`: no match, after a comment reword. The first hit was the word "window" in a comment.
- `rg -n "Math.min\(|Math.max\(" src/hrv.ts`: one hit, `Math.max(0, i - half)`. It is the slice start of the local median window, not a clamp on RMSSD, SDNN, or the breathing rate.
- Group-level run (this group has only TASK-002): `npx vitest run` gave 43/43 pass (33 before + 10 new), and `npm run build` gave exit 0, 2026-10-22 18:12.
- Measured values (scratch file outside the repo): 30 Hz RMSSD 25.9 vs 25.6 ms true, SDNN 49.1 vs 48.4; 60 Hz RMSSD 25.4 vs 25.6, SDNN 49.0 vs 48.4; 0.1 Hz gives 6.0/min, pacerFollowed true; 0.25 Hz gives 15.0/min, false; constant rate RMSSD 4.9 ms; missed foot RMSSD 25.2.

## Anti-goal

Blood-pressure output must not change. Tripwire not crossed.

| Checkpoint | Value | Source | Time |
|---|---|---|---|
| Before changes | 16/16 pass | `npx vitest run src/bp.test.ts` | 2026-10-22 18:08 |
| After `src/bp.ts` edit | 16/16 pass, exit 0 | same | 2026-10-22 18:10 |
| At completion | 16/16 pass, exit 0 | same, private JSON report | 2026-10-22 18:12 |

Lead baseline on f24ef60: 16 passed, 2026-10-22 18:07.

- Lead re-check: 16/16 pass in `npx vitest run src/bp.test.ts`, full run 43/43, typecheck exit 0; 2026-10-22, before commit 5409168.
- Result: PASS against "bp tests all pass, same count (16)".

## Lessons

- The red test "withholds when clean intervals are under 80% of all intervals" passes through the RMSSD range gate, not the 80% gate. A centred 11-IBI median always agrees with the centre IBI in its S S L L pattern, so every IBI counts as clean. A scratch check confirmed the 80% gate on its own: removing every 5th foot (75% clean) gives `Too few clean heartbeats for HRV`, and every 7th (about 83%) gives an estimate.
- The shared report `.vitest/json/output.json` can be overwritten by another vitest run, and one read showed 0/0. Use `--reporter=json --outputFile=<private path>` for counts.
- GitNexus has no index for this repo. Impact analysis fell back to `rg`: `PulseShape` is used only in `src/bp.ts`, so the added field is LOW risk.
- With a constant heart rate, `breathsPerMin` is a noise peak (20.1/min seen) and `pacerFollowed` is false. TASK-003 should not show a breathing rate as meaningful when RMSSD is very low.
