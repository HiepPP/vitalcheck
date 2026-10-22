# Learn 20261022-breathing-pacer-oval

## Summary

Discrepancy: 1 found. The first build matched its spec, but the owner then changed the design twice, so the spec was rewritten after the code shipped.

## Per TASK

- TASK-001: plan "subtle oval that grows 4% with a bottom text label and a cosine ease" -> shipped "solid amber oval with glow and 3 rings, a countdown pill at the top, a near-linear curve, and a stylised beat trace at the live BPM in place of the measured wave" (a7cc113, 63bfea7, 5ecb14b; PR #1, merge e1556ce). Mistake: the plan fixed the visual design in text before the owner saw any motion; the owner said "only text is displayed" and asked for a real animation. The cosine ease also looked reversed, because each phase started almost still. Fix: make a moving design in Claude Design first, and let the owner pick it before writing the spec. Test easing by sampling motion right after each phase change.

## Plan-Level

- Plan misdescribes reality: the spec and Review Focus had to be rewritten after 63bfea7 and 5ecb14b. The rewrite was done before DONE, so the archived spec matches the code.
- Scope creep, asked for by the owner: the beat trace and beat dot were not in the plan. They replaced the measured wave, which is a behavior change for existing input. PR #1 lists it.
- Out-of-plan commit: fcd0814 added the Paseo dev service with portless. It is not part of any TASK.
- Verification gap: a fake camera cannot show a face, so 3 checks needed the owner. Two automated screen checks (320 px and reduced motion) went stale when the pill moved, and had to run again.

## Lessons

- For visual work, design and approve the motion before the spec. A text spec of an animation hides how it feels.
- Write a test that samples motion right after each phase change. The test "keeps moving at the start of each phase" would have caught the stall.
- When a design change moves an element, mark its earlier screen checks stale and rerun them before DONE.
- Name fake-camera screenshots as such. The green test card was read as the real UI.
