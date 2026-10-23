# ADR-0004 Report HRV under the pacer over a free-breathing mode

Status: accepted
Date: 2026-10-22
Supersedes: -
Scope: src/hrv.ts src/main.ts index.html README.md

## Context

- The face oval paces breathing at 4 s in and 6 s out for the whole 60 s scan. That is 6 breaths per minute ([src/breath.ts](src/breath.ts), [ADR-0003](watchtower/decisions/ADR-0003-four-in-six-out-breathing-rhythm.md)).
- A breathing rate measured during the scan will almost always be near 6 per minute. It does not show the user's natural rate.
- Slow paced breathing makes the heart rate swing more within each breath. RMSSD and SDNN then read higher than resting values.

## Decision

- Keep the pacer. Use the measured breathing rate only to check whether the user followed the 6 per minute guide.
- Label HRV as measured during 6 per minute guided breathing. Do not compare it with resting norms.
- Hiep chose this on 2026-10-22, during planning of the HRV feature.

## Consequences

- The app does not report a natural breathing rate.
- The result view needs a fixed note that explains the paced condition.
- HRV values are comparable between scans of this app, not with other devices.

## Options Considered

- Free-breathing mode with the pacer turned off: rejected. It needs more UI and tests, and the pacer is a wanted feature.
- HRV only, no breathing rate: rejected. Hiep asked for a breathing measure, and it is useful as a compliance check.

## Revisit If

- Hiep wants a natural resting breathing rate or resting HRV norms.
- The pacer is removed or made optional.
