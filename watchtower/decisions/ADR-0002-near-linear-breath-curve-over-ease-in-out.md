# ADR-0002 Near-linear breath curve over ease-in-out

Status: accepted
Date: 2026-10-22
Supersedes: -
Scope: src/breath.ts src/breath.test.ts src/main.ts

## Context

- The first pacer used a cosine ease-in-out in `breathAt` ([src/breath.ts](src/breath.ts), a7cc113).
- The owner saw the oval move the wrong way. Browser samples showed the direction was right, but each phase started almost still: `breathAt(0.5).level` was 0.038, so the oval stalled for about 1 s after the label changed.

## Decision

- `breathAt` uses `e = 0.85 * x + 0.15 * 0.5 * (1 - cos(pi * x))`: near-linear with a short soft turn.
- The test "keeps moving at the start of each phase" in [src/breath.test.ts](src/breath.test.ts) guards it (level above 0.1 after 0.5 s of inhale).
- The owner chose this on 2026-10-22; shipped in 63bfea7.

## Consequences

- The oval and rings keep moving through each whole phase. The turn at the top and bottom is less smooth.

## Options Considered

- Cosine ease-in-out: rejected. Its slow start read as a reversed breath (0.038 level after 0.5 s).
- Pure linear: not chosen. A hard corner at each turn looks mechanical; the 15% soft part removes it.

## Revisit If

- Owner or user tests say the turn now feels abrupt.
- The oval swing grows well beyond +/-4%, so a stall would no longer be the main visible effect.
