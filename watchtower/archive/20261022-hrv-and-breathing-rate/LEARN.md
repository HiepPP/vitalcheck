# Learn 20261022-hrv-and-breathing-rate

## Summary

Discrepancy: 2 found. The code shipped as planned, but one red test missed its gate and the UI checks never ran.

## Per TASK

- TASK-002: plan HRV logic with 10 red tests -> shipped [src/hrv.ts](src/hrv.ts) and `PulseShape.feet`, all tests pass, blood-pressure tests unchanged at 16/16. Mistake: the test "withholds when clean intervals are under 80% of all intervals" reached the RMSSD range gate, not the 80% gate. The planner did not check that a centred 11-IBI median accepts the split-beat pattern. Fix: commit aab10b6 added a test that drops every 5th foot, with every 7th as the control.
- TASK-003: plan HRV panel with the spec copy -> shipped the panel and `renderHrv`, code checks pass. Mistake: the four real-face checks stayed UNVERIFIED (Q-003 OPEN), because a headless fake camera cannot finish a scan. Fix: plan result-view checks as owner checks from the start, as MEMORY.md already says.
- TASK-004: match.

## Plan-Level

- none. The groups wrote disjoint files, and B and C ran in parallel after A.

## Lessons

- For a red test of one gate, prove in the spec that the input passes every other gate first, for example by asserting the clean count and the reason string.
- Stage only the TASK's README hunks with `git apply --cached` when the owner has uncommitted README work. This kept the owner hunk safe through two commits and a branch switch.
