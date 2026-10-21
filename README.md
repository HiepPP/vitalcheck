# vitalcheck

Camera-based pulse estimate (rPPG), rebuilt from a static reading of the shipped
https://vitalcheck.waaaa.co/ bundle. Everything runs in the browser.

Pipeline: MediaPipe Face Landmarker -> forehead and cheek regions split into 16 patches
-> YCbCr skin mean RGB per frame -> uniform resampling -> POS -> 0.7-3.5 Hz
zero-phase Butterworth band-pass -> Hann-windowed DFT peak -> BPM and harmonic SNR.

Blood pressure (experimental): `src/bp.ts` segments beats foot to foot, time-normalizes
them, builds a median template, drops beats that correlate below 0.8 with it, and measures
rise time and half-amplitude width as fractions of the beat interval. Uncalibrated, hand-set
heuristic coefficients turn these and heart rate into SYS/DIA; results outside the model's
range are withheld, not clamped. With a cuff calibration (stored in localStorage) the app
shows the cuff reading plus the model's estimated change since then. Neither mode is
validated against real measurements.

## Run

```sh
npm install
npm run dev   # copies MediaPipe WASM and downloads the model into public/ on first run
```

Open http://localhost:5173. The camera needs HTTPS or localhost.
Add `?debug=1` for live diagnostics and `?track=0` to use fixed regions without face tracking.

## Check

```sh
npm run typecheck && npm test
```

Wellness estimate only, not a medical device.
