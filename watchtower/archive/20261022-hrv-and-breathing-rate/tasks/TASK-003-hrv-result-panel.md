# TASK-003 HRV panel in the result view

Group: B (writes index.html, src/main.ts; starts after TASK-002 by order only)
Class: code

## Brief

Goal: Show RMSSD, SDNN, and the guide check in the result view, with a note that HRV was measured during 6 per minute guided breathing.

Change: the result view shows heart rate and blood pressure -> it also shows an "Heart rate variability" panel under the blood-pressure panel.

Boundaries:

- Follows [ADR-0004](watchtower/decisions/ADR-0004-paced-hrv-over-free-breathing.md): never call the breathing rate a natural rate, and never compare HRV with resting values.
- Reuse the existing panel classes in [index.html](index.html) (`panel`, `row`, `k`, `chip`, `bpv`, `u`, `note`). Do not edit [src/style.css](src/style.css) unless the panel cannot render with these classes.
- Do not change `renderBloodPressure` or the calibration handlers in [src/main.ts](src/main.ts).
- Planner call: when `pacerFollowed` is false, still show the HRV values, and say the breathing did not match the guide.
- Planner call: copy text, in English like the rest of the UI:
  - Main value: RMSSD rounded to whole ms, unit `ms RMSSD`.
  - Note when estimated: `SDNN <n> ms · <beats> beats`.
  - Breathing line when `pacerFollowed`: `Breathing <x.x>/min, matched the 6/min guide.`
  - Breathing line otherwise: `Breathing <x.x>/min, did not match the 6/min guide. HRV may differ from a guided scan.` Use `-` for the rate when `breathsPerMin` is null.
  - Fixed basis note: `Measured during guided breathing at 6 breaths per minute. Slow breathing raises HRV, so do not compare it with resting values. Not validated; do not use it for medical decisions.`
  - When withheld: value `-`, hide the unit and the breathing line, and show the `reason` in the note.
- Use `PACED_BREATHS_PER_MIN` for the number 6 in the copy.
- Trap: `showResult` in [src/main.ts](src/main.ts) runs again on "Measure again". Every HRV field must be set on each call, so no value from the last scan stays.

How:

- Add the panel markup in [index.html](index.html), after the blood-pressure panel and before the `meta` list.
- Add `renderHrv(r: PulseResult)` in [src/main.ts](src/main.ts). Call it from `showResult` with `estimateHrv(r)`.

Files:

- [index.html](index.html) (new HRV panel with ids `hrv`, `hrv-unit`, `hrv-note`, `hrv-breath`, `hrv-basis`)
- [src/main.ts](src/main.ts) (import from [src/hrv.ts](src/hrv.ts), add `renderHrv`, call it in `showResult`)

Interfaces:

- Consumes: `export interface HrvInput { waveform: Waveform | null; bpm: number | null; snrDb: number; fps: number }` in src/hrv.ts from TASK-002
- Consumes: `export type Hrv = { kind: "estimate"; rmssdMs: number; sdnnMs: number; beats: number; breathsPerMin: number | null; pacerFollowed: boolean } | { kind: "withheld"; reason: string }` in src/hrv.ts from TASK-002
- Consumes: `export function estimateHrv(r: HrvInput): Hrv` in src/hrv.ts from TASK-002
- Consumes: `export const PACED_BREATHS_PER_MIN: number` (6) in src/hrv.ts from TASK-002

Expected result:

- WHEN a scan ends with an HRV estimate THE result view SHALL show RMSSD, SDNN, beat count, the breathing line, and the basis note.
- WHEN `pacerFollowed` is false THE result view SHALL show the values and the "did not match" breathing line.
- IF HRV is withheld THEN THE result view SHALL show `-` and the reason, with no unit and no breathing line.
- WHEN the user taps "Measure again" and the next scan ends THE HRV panel SHALL show only the new scan's values.

Anti-goal: heart-rate and blood-pressure rendering stay unchanged; tripwire; read from `git diff -U0 src/main.ts` at completion -> no changed line inside `renderBloodPressure`, the `cal-*` handlers, or the heart-rate lines of `showResult` except the new `renderHrv` call.

## Verify

- `npm run typecheck` -> exit 0
- `npm test` -> all tests pass
- `npm run build` -> exit 0
- `git diff -U0 src/main.ts` -> anti-goal holds as written above
- Human check (needs a real face; the headless fake camera never finishes a scan): run `npm run dev`, finish one scan while following the guide -> HRV panel shows values, "matched the 6/min guide", and the basis note
- Human check: finish one scan while breathing fast on purpose -> breathing line says "did not match the 6/min guide"
- Human check: tap "Measure again" and finish a second scan -> HRV panel shows the second scan's values only
- Human check: cover part of the face or dim the light so the signal is weak -> HRV panel shows `-` and a reason
