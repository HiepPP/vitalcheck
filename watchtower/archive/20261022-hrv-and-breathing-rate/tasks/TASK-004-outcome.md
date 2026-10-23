# TASK-004 Outcome

## Status

DONE

## Changed

- `README.md`: new `## Heart rate variability and breathing (experimental)` section (before `## Run locally`) and a `src/hrv.ts` row in the project layout table.

## Contract

- Docs only. Every threshold matches the constants in `src/hrv.ts` and `watchtower/CONTEXT.md`: 6 dB, 25 fps, 20%, 11 IBIs, 40 IBIs, 80%, 200 ms, 250 ms, 3 to 30 per minute, within 1 of 6 per minute. No differences found.

## Verified

- `rg` finds one section heading (line 56, before `## Run locally` at line 77) and one `src/hrv.ts` row (line 111).
- Text states HRV is measured during guided 6 per minute breathing and is not comparable with resting values (ADR-0004).
- Not yet done (lead): `git show --stat HEAD -- README.md` after the group commit.

## Anti-goal

Owner hunk: the `docs/how-rppg-works.md` link line in the intro.

| Checkpoint | Value | Source | Time |
| --- | --- | --- | --- |
| before edit | link hunk present, unstaged, 2 insertions 1 deletion | `git diff -- README.md` | 2026-10-22 pre-edit |
| after edit | link hunk unchanged (same lines, still unstaged); other hunks are this TASK's | `git diff -- README.md` | 2026-10-22 post-edit |
| after commit | pending (lead) | | |

## Lessons

none

## Lead Close

- After commit 99695dc: `git show --stat HEAD` -> README.md only, 22 insertions; `git diff README.md` -> the owner link hunk is still unstaged and unchanged. 2026-10-22.
- Result: PASS against the tripwire "owner hunk stays unstaged and unchanged".
