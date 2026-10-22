# Memory

## Avoid

- Avoid drawing the measured POS signal as the live wave, or calling the trace an ECG, while the owner wants a monitor-style beat at the live BPM. Reason: [ADR-0001](watchtower/decisions/ADR-0001-stylised-beat-trace-over-measured-signal.md).
- Avoid an ease-in-out breath curve while the oval swing stays small (+/-4%). Reason: [ADR-0002](watchtower/decisions/ADR-0002-near-linear-breath-curve-over-ease-in-out.md).
- Avoid 5/5 or 3/3 breathing rhythms while calm is the pacer goal. Reason: [ADR-0003](watchtower/decisions/ADR-0003-four-in-six-out-breathing-rhythm.md).
- Avoid presenting the scan's breathing rate as a natural rate, or HRV as a resting value, while the pacer runs the whole scan. Reason: [ADR-0004](watchtower/decisions/ADR-0004-paced-hrv-over-free-breathing.md).

## Learnings

- 2026-10-22: A headless Chrome fake camera (`--use-fake-device-for-media-stream`) shows no face. It can check the scan overlay and the label, but a scan never finishes and a face can never be lost. Plan any result-view or face-lost check as a human check with a real face.
- 2026-10-22: The fake camera shows a green test card with a spinning pie and a timer. Say so when you share a screenshot from it, or the owner reads it as the real UI.
- 2026-10-22: Show visual work in Claude Design first, then build it. A spec written before the design (TASK-001) needed a full rewrite after the owner saw the animation.
