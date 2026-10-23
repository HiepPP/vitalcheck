# TASK-004 Document HRV and breathing

Group: C (writes README.md; starts after TASK-002 by order only)
Class: docs

## Brief

Goal: Document how the app computes HRV and the breathing guide check, with every quality threshold, as [CLAUDE.md](CLAUDE.md) asks when pipeline behavior changes.

Change: [README.md](README.md) explains heart rate and blood pressure -> it also has an HRV and breathing section and a `src/hrv.ts` row in the project layout.

Boundaries:

- Follows [ADR-0004](watchtower/decisions/ADR-0004-paced-hrv-over-free-breathing.md): say that the breathing rate only checks the guide, and that HRV is measured during 6 per minute breathing.
- Take every threshold from [watchtower/CONTEXT.md](watchtower/CONTEXT.md). Check each number against the constants in [src/hrv.ts](src/hrv.ts) after TASK-002. If they differ, the code wins; report the difference.
- Match the style of the `## Blood pressure (experimental)` section: short bullets, plain words, and a closing "not validated" line.
- Trap: [README.md](README.md) has an uncommitted owner hunk in the intro that links `docs/how-rppg-works.md`. Do not stage, change, or revert it. Stage only this TASK's hunks, for example with `git diff README.md > /tmp/readme.patch`, edit the patch to keep only this TASK's hunks, then `git apply --cached /tmp/readme.patch`.

How:

- Add `## Heart rate variability and breathing (experimental)` after the blood-pressure section and before `## Run locally`.
- Add a `src/hrv.ts` row to the `## Project layout` table.

Files:

- [README.md](README.md) (new section and one table row)

Interfaces:

- Consumes: named threshold constants in src/hrv.ts with the values in watchtower/CONTEXT.md from TASK-002

Expected result:

- WHEN a reader opens [README.md](README.md) THE HRV section SHALL list how RMSSD, SDNN, and the breathing rate are computed and every threshold in [watchtower/CONTEXT.md](watchtower/CONTEXT.md).
- WHEN a reader reads the HRV section THE text SHALL say that HRV is measured during guided 6 per minute breathing and is not comparable with resting values.

Anti-goal: the owner's uncommitted README hunk stays unstaged and unchanged; tripwire; read from `git diff README.md` before the edit and after the commit -> the `docs/how-rppg-works.md` link line is still an unstaged change.

## Verify

- `rg -n "## Heart rate variability and breathing" README.md` -> one match, before `## Run locally`
- `rg -n "src/hrv.ts" README.md` -> one match in the project layout table
- Read the new section -> it states 6 dB, 25 fps, 20%, 11 IBIs, 40 IBIs, 80%, 200 ms, 250 ms, 3 to 30 per minute, and within 1 of 6 per minute
- `git show --stat HEAD -- README.md` after the group commit, then `git diff README.md` -> the commit has only this TASK's hunks; the owner's link hunk is still unstaged
