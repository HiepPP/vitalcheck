# Questions

Owner questions of the active plan. One row per question. Specs and outcomes cite the ID instead of repeating the text.

| ID | TASK | Blocks | Question | Default | Status | Answer |
|----|------|--------|----------|---------|--------|--------|
| Q-001 | TASK-001 | TASK-001 | With a real face on `feat/breathing-pacer-oval` (5ecb14b or later): (1) does the beat trace scroll with one spike per beat at the shown BPM, with the beat dot flashing? (2) does "Measure again" show "Breathe in · 4" first? (3) does covering the camera for 2 s mid-scan keep the pill rhythm? A fake camera cannot show a face, finish a scan, or lose a face. | none | ANSWERED | 2026-10-22: the owner reported PASS for (1), (2), and (3) with a real face. |
| Q-002 | TASK-001 | - | After a slow camera or model load, the first breath can be short (a "Breathe out" flicker of 18 ms once, or an early first exhale). The pacer uses video frame time, as specified. Is this acceptable, or should the pacer start on wall-clock time after the first frame? | keep video frame time | ANSWERED | Keep video frame time for the pacer (owner, 2026-10-22). |

Status: OPEN, DEFAULTED (a run took the default; the owner may still answer), ANSWERED, DROPPED.
Blocks: the TASKs that cannot start until the question is answered, or `-` when the spec gives a safe default.
