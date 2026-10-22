# TASK-001 Outcome

## Outcome

### Status

DONE. The code is committed as a7cc113, 63bfea7, and 5ecb14b. The owner passed all three real-face checks of Q-001 on 2026-10-22. See "Owner checks" at the end.

### Changed

- `src/breath.ts` (new): `BREATH_IN_S`, `BREATH_OUT_S`, `breathAt`. Pure cosine ease, no DOM. Negative or non-finite time returns the cycle start. The boundary at 4 s is in the out phase.
- `src/breath.test.ts` (new): the 7 red tests from the spec, unchanged.
- `src/main.ts`: module-level `reducedMotion` media query list, label text map, label reset to "Breathe in" in `start`, pacer clock and phase-change label write in `run`, and `drawOverlay` takes `level`. The oval radii scale by `1 + 0.04 * (2 * level - 1)` only when tracking is on and reduced motion is off. The glow uses `shadowBlur` and is off with reduced motion. The oval is still drawn before the early return.
- `index.html`: HUD label `#breath` inside `.view`, no `aria-live`. The intro Voice cell now reads "Silent, breathe with the oval".
- `src/style.css`: `.breath` label at the bottom center of `.view`.
- `README.md`: two sentences next to the settle and measure paragraph. The owner hunk near "Everything runs on the device" is untouched.

### Contract

The label shows "Breathe in" for 4 s and "Breathe out" for 6 s, repeating every 10 s. The clock starts on the first video frame of `run` and uses `t` minus the first `t`. It is not reset by face-lost restarts. Each new `run` starts a new clock. Tracking mode scales the oval 0.96 to 1.04 and changes the glow. Guide mode keeps the size and changes only the glow. Reduced motion keeps the oval still and the label still switches. With tracking on and no face, the oval keeps the grey colour and still breathes.

### Verified

- Red: `npx vitest run src/breath.test.ts` before `src/breath.ts` existed failed on the missing module (no tests ran).
- Green: the same command now passes 7 of 7.
- `npm test`: 3 files, 30 tests passed (dsp and bp unchanged).
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- `rg` on `index.html`: the Voice cell reads "Silent, breathe with the oval".
- DEFERRED (UI checker): label timing, oval size at the top and bottom of a breath (about 8%), `?track=0` size and glow, reduced-motion emulation mid-scan, 320 px layout, "Measure again" label reset.
- DEFERRED (Human check): covering the camera for more than 1.5 s keeps the rhythm.

### Anti-goal

`git diff --numstat -- src/dsp.ts src/sampler.ts src/bp.ts src/camera.ts` gave empty output (0 changed lines) at each checkpoint:

- Before changes: 0, 2026-10-22T03:30:47Z.
- After `src/breath.ts` passed: 0, 03:31:02Z.
- After the `main.ts`, `index.html`, `style.css` edits: 0, 03:31:18Z.
- At completion, after README and all checks: 0, 03:31:29Z.

No tripwire crossed.

### Lessons

- `breathAt` uses `0.5 * (1 - Math.cos(...))`, so the start is a positive 0 and `toEqual` passes.
- The glow needs `shadowBlur` reset to 0 after the oval stroke, so the ROI rectangles do not glow.

## UI Checks

Run on 2026-10-22 against commit a7cc113 (no source file edited). Headless Chrome through playwright-core, launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`. The fake camera shows a green test pattern with no face. Face tracking loaded ("Face tracked") on the default URL. Screenshots and raw samples are in `/tmp/uichk`. Oval width was read from the `#overlay` canvas as the bounding box of pixels with alpha 250 or more, so the glow does not count. The glow level was read as the summed canvas alpha.

1. Label timing: PASS. In the clean runs the label reads "Breathe in" first, then "Breathe out" 3.76 s to 3.94 s after the first pacer frame, then "Breathe in" 6.00 s later, then "Breathe out" 4.0 s later (for example 6.251, 12.249, 16.250, 22.218, 26.252 s on the page clock). Caveat: the pacer clock is the video frame time. After a long camera or model load stall, the first frames are stale and the first cycle is distorted. In one cold run the label flickered "Breathe out" for 18 ms right after the first frame. In two runs under CPU load (parallel browsers) the first "Breathe out" came 0.16 s and 2.5 s after the first frame, then the 6 s and 4 s rhythm held. This follows the spec design (use `t` minus the first `t`). No fix was tried.
2. Face tracking on, no face: PASS. Mode label "Face tracked", oval grey, still breathing. Oval width was 277 px at the bottom of a breath and 301 px at the top (ratio 1.087, target 1.083). Height was 370 px and 400 px (1.081). The size peaked at the end of the inhale (about 4 s) and fell back to the minimum at about 10 s. The canvas was 640 by 480. The glow level moved from about 0.70M to 0.99M alpha with the size.
3. `?track=0`: PASS. Mode label "Guide mode". Oval width stayed 289 px for the whole run (height 385 or 386 px, one pixel of dash rounding). The glow level changed from 1.24M to 1.48M alpha and followed the breath. The label rhythm matched check 1 (out at 3.94 s, in at 6.00 s later).
4. Reduced motion mid scan: PASS. The emulation was switched on at 15.11 s (page clock) in a face-tracked scan. Before it, the width moved between 277 and 297 px and the glow between 0.69M and 0.98M. After it, all 149 samples had width 289 px, height 385 px and glow 497264 (no change at all, the oval at neutral size with no shadow). The label still switched at 16.67 s, 22.62 s and 26.67 s.
5. 320 px viewport: PASS. `#breath` box: left 119.3, top 405.2, right 200.7, bottom 419.2. `.view` box: left 0, top 64, right 320, bottom 433.2. So the label is fully inside. The `.hud` box ends at bottom 92 and right 61.8. The four `.br` corners end at bottom 377.8 at the lowest, above the label top of 405.2. No overlap. No horizontal scroll (scrollWidth 320). Screenshot: `/tmp/uichk/narrow.png`.
6. "Measure again" reset: UNVERIFIED. A scan needs a usable pulse signal to finish. A 72 s guide-mode scan with the fake camera ended with "Move your face into the oval" and never reached the result view, so the real "Measure again" button could not be clicked. Code path read in `src/main.ts`: `start()` writes "Breathe in" to `#breath` (line 106) before it awaits the camera. `run()` makes new local `breathStart` and `breathPhase` values, so its first frame writes the label fresh. The first-click path ("Start measurement") ran the same `start()` and showed "Breathe in" first in every run. This is evidence for the shared code, not for the button.
7. Human check with a real face (cover the camera for more than 1.5 s): UNVERIFIED. It needs a human.

Cleanup: the dev server was stopped, port 5173 is free, and no headless Chrome process is left.

Lead note: the first-cycle distortion after a load stall is recorded as Q-002. It is not a spec failure, so no fix round ran.

## Revision 2026-10-22: design 3a

The owner chose design 3a from Claude Design ("D Breathing Pacer v3") and asked for it in the app. The spec now describes the shipped design. The sections above describe the first build, a7cc113.

### Changed

- 63bfea7: `breathAt` uses the near-linear curve. `breathRemaining` is new. The oval has 3 rippling rings. A "Breathe in · N" pill at the top of the video replaces the bottom label. A glowing beat trace drawn at the live BPM replaces the bar wave, and a beat dot sits next to "BPM / live".
- 5ecb14b: the oval is a solid 2 CSS px line, not dashes. Line widths and glow are set in CSS px through the cover crop. With reduced motion, the glow is fixed at a medium value, where it was off before.

### Contract

- Behavior change, asked for by the owner: the wave no longer draws the measured POS signal. It draws a stylised beat at the live BPM, only after the first live BPM.
- No app text says "ECG".

### Verified

- `npx vitest run` -> 3 files, 33 tests pass (10 in `src/breath.test.ts`); run on 5ecb14b.
- "keeps moving at the start of each phase" fails on the old cosine curve: `breathAt(0.5).level` was 0.038, and the limit is 0.1.
- `npm run typecheck` -> exit 0. `npm run build` -> exit 0.
- `rg -n -i "ecg" index.html src/main.ts src/style.css` -> no match.
- Headless Chrome with the fake camera on 63bfea7: the pill showed "Breathe in · 1" and "Breathe in · 3", the oval grew, and the rings showed. The trace was a flat line, because the fake camera shows no face and no BPM exists.
- Headless Chrome with the fake camera and `?track=0` on 5ecb14b: the oval is a solid amber line with rings. The pill showed "Breathe out · 6".
- Claude Design page, before the curve fix: the halo did follow the breath (225 px to 243 px on inhale), but each phase started almost still. After the fix, every 0.5 s sample grew during the inhale and shrank during the exhale.
- Real-face checks: see "Owner checks" below.
- 320 px layout and reduced motion: rerun on 5ecb14b; see "UI Checks on 5ecb14b" below.

### Anti-goal

- 63bfea7 and 5ecb14b: `git diff --numstat a7cc113~1 -- src/dsp.ts src/sampler.ts src/bp.ts src/camera.ts` -> 0 lines; 2026-10-22T04:56Z.
- Result: PASS against the limit of 0 lines.

### Lessons

- Chrome's fake camera shows a green test card with a spinning pie. Screenshots from it do not show the real scan view. Say so when you share them.
- An ease-in-out curve on a slow breath looks stalled at each turn. Use a near-linear curve for a breathing pacer.

## UI Checks on 5ecb14b

Run on 2026-10-22 in headless Chrome with the fake camera, against the dev server at `http://vitalcheck.localhost:1355`.

- 320 px viewport: PASS. The pill box is left 82, top 74, right 237, bottom 102. It is fully inside `.view`, and it overlaps neither `.hud` nor any `.br` corner bracket. `scrollWidth` is 320, so there is no horizontal scroll.
- Reduced motion, emulated from page load: PASS. `matchMedia("(prefers-reduced-motion: reduce)")` was true. The summed overlay alpha was 340304 for the first two samples, then 343027 for the next 12 samples (one every 0.7 s), across a switch from "Breathe out" to "Breathe in". The pill still counted down. The single early step does not follow the breath. It is most likely a one-time layout settle that changed the CSS-px line width; this cause is not confirmed.
- Reduced motion switched on mid-scan: the summed alpha moved from 340304 to 343027 once, then held for 6 samples while the pill counted "Breathe out" from 6 to 1.

## Owner checks

The owner ran these with a real face at `http://vitalcheck.localhost:1355` on `feat/breathing-pacer-oval` and reported PASS for each on 2026-10-22:

1. The beat trace scrolls with one spike per beat at the shown BPM, and the beat dot flashes: PASS.
2. "Measure again" after a finished scan shows "Breathe in · 4" first: PASS.
3. Covering the camera for more than 1.5 s mid-scan shows "Face lost - measurement restarted", and the pill keeps its rhythm: PASS.
