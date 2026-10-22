# ADR-0003 4 s in, 6 s out rhythm over 5/5 and 3/3

Status: accepted
Date: 2026-10-22
Supersedes: -
Scope: src/breath.ts src/main.ts README.md index.html

## Context

- The pacer guides the user's breathing during the 2 s settle and 60 s measure phases.
- Slow paced breathing raises beat-to-beat heart-rate swing (sinus arrhythmia). It can widen the pulse peak in `analyze`, and the README says so.

## Decision

- The pacer runs a 4 s inhale and a 6 s exhale: a 10 s cycle, 6 breaths per minute (`BREATH_IN_S`, `BREATH_OUT_S` in [src/breath.ts](src/breath.ts)).
- The owner chose this calm pattern on 2026-10-22 during plan setup; shipped in a7cc113.

## Consequences

- The longer exhale helps calm. The measured BPM may swing a little within each breath.

## Options Considered

- Even 5 s in, 5 s out (resonance breathing): rejected. The owner preferred the longer, calming exhale.
- Natural 3 s in, 3 s out: rejected. It changes the measurement least, but it is less calming, and calm was the goal.

## Revisit If

- Result quality or BPM spread is measurably worse with the pacer than without it on the same people.
- The product goal moves from calm to measurement accuracy first.
