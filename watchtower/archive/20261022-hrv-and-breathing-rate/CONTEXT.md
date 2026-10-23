# Plan Context

## Shared Context

- HRV and breathing come from the beat feet that [src/bp.ts](src/bp.ts) already finds in `shapeWithSign`. Feet sit on the whole-face POS signal `PulseResult.waveform` from [src/dsp.ts](src/dsp.ts).
- The pacer runs 4 s in and 6 s out for the whole scan, so the guide rate is 6 breaths per minute ([src/breath.ts](src/breath.ts)).
- Quality thresholds, shared by code ([src/hrv.ts](src/hrv.ts)) and docs ([README.md](README.md)):
  - Signal quality `snrDb` at least 6 dB. This is the same gate as blood pressure.
  - Measured camera `fps` at least 25. Below that, foot timing error swamps beat-to-beat change.
  - Beat intervals (IBIs) count as clean when they are within 20% of the median of the 11 IBIs around them.
  - At least 40 clean IBIs, and clean IBIs are at least 80% of all IBIs.
  - RMSSD uses only pairs of neighbouring clean IBIs. SDNN uses all clean IBIs.
  - Results above 200 ms RMSSD or 250 ms SDNN are withheld, not clamped.
  - Breathing rate is the peak of the IBI series spectrum from 3 to 30 breaths per minute.
  - The user followed the guide when the breathing rate is within 1 breath per minute of 6.
- The app is a wellness estimate, not a medical device. Keep the disclaimers.

## Decisions

- Follows [ADR-0004](watchtower/decisions/ADR-0004-paced-hrv-over-free-breathing.md): breathing rate is only a guide check, and HRV is labelled as measured during 6 per minute guided breathing.

## Open Decisions

- None.

## References

- [src/bp.ts](src/bp.ts), [src/dsp.ts](src/dsp.ts), [src/breath.ts](src/breath.ts)
- `npm test`, `npm run typecheck`, `npm run build`
