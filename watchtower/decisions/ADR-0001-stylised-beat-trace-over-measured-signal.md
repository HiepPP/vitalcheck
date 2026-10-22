# ADR-0001 Stylised beat trace over measured signal wave

Status: accepted
Date: 2026-10-22
Supersedes: -
Scope: src/main.ts index.html src/style.css
Guard: forbid-text [Ee][Cc][Gg] in index.html src/main.ts src/style.css

## Context

- Before PR #1, the live wave drew the band-passed POS signal of the last 4 s as 48 bars, updated every 0.2 s ([src/main.ts](src/main.ts), `drawWave`, removed in 63bfea7).
- The owner asked for a pulse animation that reflects the live BPM, and gave two glowing monitor-trace references.
- A camera measures a blood-volume pulse, not heart electricity, so the measured signal never looks like those references.

## Decision

- The live wave draws a stylised beat (P bump, sharp spike with a dip, rounded T bump) at the live BPM, with a beat dot next to "BPM / live".
- It shows only after the first live BPM. Before that, it is a flat dim line.
- App text and code never call it an ECG.
- The owner chose this on 2026-10-22 and shipped it in PR #1 (merge e1556ce).

## Consequences

- The scan screen no longer shows the measured signal or its noise. Signal quality is visible only in the result screen.
- `beatShape` and `drawTrace` in [src/main.ts](src/main.ts) are display only. They must never feed `analyze`, `liveEstimate`, or the BP estimate.

## Options Considered

- Measured POS signal, scrolled smoothly each frame: rejected. The owner wanted the reference look, and the measured signal cannot show it.
- Bar wave of the measured signal (the old view): rejected. It jumped every 0.2 s and did not read as a beat.

## Revisit If

- Users or reviewers report that the trace suggests a medical-grade or ECG reading.
- The app adds a mode that must show signal quality live during the scan.
