# TASK-001 Breathing pacer on the face oval

Group: standalone (writes [src/breath.ts](src/breath.ts), [src/breath.test.ts](src/breath.test.ts), [src/main.ts](src/main.ts), [index.html](index.html), [src/style.css](src/style.css), [README.md](README.md))
Class: code

## Brief

Goal: During a scan, a halo around the face oval breathes in a calm 4 s in, 6 s out rhythm, with a "Breathe in · N" countdown pill. A glowing beat trace below the BPM moves at the live heart rate. The user follows the halo to breathe steadily.

Change: static dashed oval, bottom text label, and bar wave of the measured signal -> solid amber oval with glow and 3 rippling rings, a countdown pill at the top of the video, and a stylised beat trace drawn at the live BPM.

Design: Claude Design project "Pulse Check - Premium UI directions", page "D Breathing Pacer v3" (option 3a). Shipped in commits a7cc113, 63bfea7, and 5ecb14b.

Boundaries:

- Rhythm: 4 s inhale, 6 s exhale, 10 s cycle, 6 breaths per minute. The owner chose this calm pattern.
- Curve: `breathAt` in [src/breath.ts](src/breath.ts) uses a near-linear ease, `e = 0.85 * x + 0.15 * 0.5 * (1 - cos(pi * x))`. Reason: the first ease-in-out curve stalled for about 1 s at the start of each phase, so the owner saw the oval move the wrong way.
- Timing: the pacer starts on the first video frame of `run` in [src/main.ts](src/main.ts), so it covers the 2 s settle phase and the 60 s measure phase. It keeps its clock through face-lost restarts. A new scan starts a new clock.
- Oval: a solid 2 CSS px line, not dashes. `drawOverlay` converts CSS px to canvas px through the cover crop. The oval is amber with a face and grey `GUIDE_IDLE` without one.
- Face tracked (`tracking` is true in `drawOverlay`): the oval radii scale from 0.96 (level 0) to 1.04 (level 1) of the current size. The glow grows with the level.
- Rings: 3 rings of 1 CSS px scale out of the oval by 10%, 20%, and 30% of the level, at alpha 0.55, 0.32, and 0.16 times the level. They fold back on exhale.
- Guide mode (`tracking` is false, for `?track=0` or a failed landmarker): the oval keeps its size. The glow and the rings still breathe, because they do not move the oval. Reason: `guideRois` in [src/sampler.ts](src/sampler.ts) samples fixed regions inside the on-screen oval.
- Pill: a "Breathe in · N" / "Breathe out · N" pill at the top center of the `.view` box in [index.html](index.html). N comes from `breathRemaining` in [src/breath.ts](src/breath.ts). Its dot does not blink. The status line keeps "Measuring" and all problem messages.
- Beat trace: a canvas `#trace` replaces the bar wave. It draws the last 4 s of a stylised beat (P bump, sharp spike with a dip, rounded T bump) at the live BPM, with an amber glow, a left fade, and a bright head dot. A beat count advances at the live BPM, so a BPM update bends the trace from now on and does not jump it. Before the first live BPM, it shows a flat dim line.
- Beat dot: a dot next to "BPM / live" flashes on each spike of the trace.
- Honesty: the trace is drawn, not measured. A camera measures a blood-volume pulse, which never looks like this shape. The app text must not call it an ECG. The trace shows only after a live BPM exists.
- `prefers-reduced-motion: reduce`: the oval and rings do not move, the glow stays at a fixed medium value, and the trace stops scrolling. The pill still counts down.
- Intro copy: the `Voice` cell reads "Silent, breathe with the oval".
- README: one or two sentences next to the settle and measure text say that the oval paces 4 s in and 6 s out, and that slow paced breathing can make the heart rate swing a little within each breath.
- Display only. Do not touch the measurement pipeline: `FaceSampler`, `analyze`, `liveEstimate`, `estimateBloodPressure`, and their thresholds stay as they are.
- Planner call: the pill has no `aria-live`, because a change every second is noisy for screen readers.
- Planner call: `start` in [src/main.ts](src/main.ts) resets the pill to "Breathe in · 4" and the trace to the flat line, so both are correct while the camera loads.
- Trap: `t` in the `onVideoFrame` callback in [src/camera.ts](src/camera.ts) is seconds from `mediaTime` or from `performance.now() / 1000`. Use `t` minus the run's first `t`. Do not mix in `Date.now()`.
- Trap: the pill reuses `.dot`, which blinks by default. `.breath .dot` turns the blink off.
- Trap: `drawOverlay` and `drawTrace` run on every frame. Write the pill text only when it changes.

How:

- `breathAt` and `breathRemaining` in [src/breath.ts](src/breath.ts) are pure. No DOM.
- `run` in [src/main.ts](src/main.ts) keeps the pacer clock and the beat count, updates the pill, and calls `drawOverlay` and `drawTrace` each frame.
- `drawOverlay` draws the solid oval, its glow, and the rings. `drawTrace` draws the beat trace and sets `--beat` on the beat dot.

Files:

- [src/breath.ts](src/breath.ts) (`BREATH_IN_S`, `BREATH_OUT_S`, `breathAt`, `breathRemaining`)
- [src/breath.test.ts](src/breath.test.ts) (10 tests for the curve, the phase switch, the countdown, and bad input)
- [src/main.ts](src/main.ts) (pacer clock, pill, halo in `drawOverlay`, `beatShape`, `drawTrace`, reduced-motion check)
- [index.html](index.html) (pill inside `.view`, beat dot, `#trace` canvas, intro `Voice` copy)
- [src/style.css](src/style.css) (pill, beat dot, trace size)
- [README.md](README.md) (pacer note in the scan text)

Expected result:

- WHEN the scan view starts THE pill SHALL show "Breathe in · 4", and the oval SHALL start at its smallest size (scale 0.96).
- WHILE the scan runs, THE pacer SHALL switch to "Breathe out" after 4 s and back to "Breathe in" 6 s later, repeat every 10 s, and count N down each second.
- WHILE face tracking is on, THE oval SHALL grow from 0.96 to 1.04 of its size during the whole inhale and shrink during the whole exhale, with no stall at the turn.
- WHILE the breath rises, THE rings SHALL move out and brighten, and WHILE it falls THE rings SHALL fold back and fade.
- WHILE guide mode is on, THE oval SHALL keep its size, and only the glow and rings SHALL change.
- WHEN the face is lost and the measurement restarts THE pacer SHALL keep its rhythm without a reset.
- WHEN a new scan starts from "Measure again" THE pill SHALL show "Breathe in · 4" first.
- WHILE no live BPM exists, THE trace SHALL show a flat dim line, and the beat dot SHALL rest.
- WHILE a live BPM exists, THE trace SHALL scroll with one spike per beat at that BPM, and the beat dot SHALL flash on each spike.
- WHILE `prefers-reduced-motion: reduce` matches, THE oval, rings, and trace SHALL stay still, AND THE pill SHALL still count down.
- IF `breathAt` or `breathRemaining` gets a negative or non-finite time THEN THE function SHALL return the cycle start: phase `in`, level 0, or 4 s left.

Tests: [src/breath.test.ts](src/breath.test.ts) holds the shipped tests. The 7 tests from the first plan still pass on the new curve. Three tests were added: "keeps moving at the start of each phase" (it fails on the old cosine curve, which reached only 0.038 after 0.5 s), and two `breathRemaining` tests.

Anti-goal: changed lines in the measurement pipeline files ([src/dsp.ts](src/dsp.ts), [src/sampler.ts](src/sampler.ts), [src/bp.ts](src/bp.ts), [src/camera.ts](src/camera.ts)) stay at 0; tripwire; read from `git diff --numstat` before changes, after each material change, and at completion.

## Verify

- `npx vitest run src/breath.test.ts` -> all 10 tests pass.
- `npm test` -> all tests pass, and the existing `dsp` and `bp` tests stay green.
- `npm run typecheck` -> exit 0.
- `npm run build` -> exit 0.
- `git diff --numstat a7cc113~1 -- src/dsp.ts src/sampler.ts src/bp.ts src/camera.ts` -> no output (anti-goal, limit 0 lines).
- `rg -n -i "ecg" index.html src/main.ts src/style.css` -> no match (no "ECG" in app text or code comments).
- UI check (Chrome with `--use-fake-device-for-media-stream`), start a scan -> the pill counts "Breathe in · 4" down to 1, then "Breathe out · 6" down to 1, and repeats.
- UI check, face tracking on -> the oval is a solid line, grows during the whole inhale and shrinks during the whole exhale, and the rings move out and back.
- UI check, `?track=0` -> the oval keeps the same size across a breath, and only its glow and the rings change.
- UI check, emulate `prefers-reduced-motion: reduce` mid-scan -> from then on the oval, rings, and trace do not move, and the pill still counts down.
- UI check, viewport 320 px wide -> the pill is fully visible inside the video view and does not overlap the "Live" HUD or the corner brackets.
- UI check, before the first live BPM -> the trace is a flat dim line, and the beat dot rests.
- Human check with a real face: after about 8 s the trace scrolls with one spike per beat at the shown BPM, and the beat dot flashes on each spike.
- Human check with a real face: "Measure again" after a finished scan -> the pill shows "Breathe in · 4" first.
- Human check with a real face: cover the camera for more than 1.5 s mid-scan -> "Face lost - measurement restarted" shows, and the pill keeps its rhythm without a jump to "Breathe in".
- Intro screen -> the `Voice` cell reads "Silent, breathe with the oval".
