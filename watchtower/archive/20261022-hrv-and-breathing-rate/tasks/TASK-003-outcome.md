# TASK-003 Outcome

## Status

DONE (human checks deferred to the UI checker)

## Changed

- `index.html`: new panel after the blood-pressure panel, before `meta`. Ids `hrv`, `hrv-unit`, `hrv-note`, `hrv-breath`, `hrv-basis`. Classes `panel`, `row`, `k`, `bpv`, `u`, `note` only. No chip, no CSS change.
- `src/main.ts`: import `estimateHrv`, `PACED_BREATHS_PER_MIN` from `./hrv`. Added `renderHrv(r: PulseResult)`. `showResult` calls it after `renderBloodPressure()`.

## Contract

- Consumes `estimateHrv`, `Hrv`, `PACED_BREATHS_PER_MIN` from `src/hrv.ts` by exact name. `HrvInput` is satisfied structurally by `PulseResult`.
- `renderHrv` sets all five fields on every call: value, unit hidden, note, breath line hidden and text, basis note. No value from an earlier scan stays.
- Withheld: value `-`, unit and breath line hidden, `reason` in the note.
- Copy follows the spec. The number 6 comes from `PACED_BREATHS_PER_MIN`. A null rate shows `-`.
- Spec copy kept as written for a constant heart rate (no extra logic).

## Verified

- `npm run typecheck`: exit 0.
- Group-level run (this group has only TASK-003): `npx vitest run --reporter=json --outputFile=/tmp/group-b.json` gave 43/43 pass. `npm run build` built OK (exit 0).
- No GitNexus index for this repo. Fallback `rg`: `showResult` is called only from `run()` in `src/main.ts`. Risk LOW.
- Anti-goal: `git diff -U0 src/main.ts` shows only 19 added lines and 0 removed: the import, the `renderHrv(r);` call, and the `renderHrv` function. No changed line in `renderBloodPressure`, the `cal-*` handlers, or the heart-rate lines. PASS.

DEFERRED (UI checker), all need a real face:

- Scan while following the guide: panel shows values, "matched the 6/min guide", and the basis note.
- Scan while breathing fast: line says "did not match the 6/min guide".
- "Measure again" then a second scan: only the second scan's values show.
- Weak signal: panel shows `-` and a reason, no unit, no breathing line.

## Anti-goal

| Checkpoint | Value | Source | Time |
|---|---|---|---|
| At completion | 19 added, 0 removed lines in `src/main.ts`; none inside BP, `cal-*`, or HR lines | `git diff -U0 src/main.ts` | 2026-10-22 |

Result: PASS. Tripwire not crossed.

## Lessons

- `PulseResult` already has `waveform`, `bpm`, `snrDb`, `fps`, so `estimateHrv(r)` takes it with no adapter.
- An editor diagnostic "all imports unused" appeared right after the import edit, before `renderHrv` existed. It was stale; typecheck passes.

## Lead Close

- Lead re-check before commit 17313b0: `npm run typecheck` exit 0, `npx vitest run` 43/43, `npm run build` exit 0, `git diff -U0 src/main.ts` showed only added lines outside `renderBloodPressure` and the `cal-*` handlers. 2026-10-22.
- UI checks: UNVERIFIED (unattended). They need a real face, and the headless fake camera never finishes a scan. Owner check: Q-003.
