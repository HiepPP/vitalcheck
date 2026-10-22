export const BREATH_IN_S = 4;
export const BREATH_OUT_S = 6;
const CYCLE_S = BREATH_IN_S + BREATH_OUT_S;

export type Breath = { phase: "in" | "out"; level: number };

// Mostly linear, with a short soft turn: an ease-in-out curve looked stalled at the
// start of each phase, so the oval seemed to move the wrong way.
const ease = (x: number) => 0.85 * x + 0.15 * 0.5 * (1 - Math.cos(Math.PI * x));

/** Paced-breathing state for `elapsed` seconds into the scan. Level is 0 (empty) to 1 (full). */
export function breathAt(elapsed: number): Breath {
  if (!Number.isFinite(elapsed) || elapsed < 0) return { phase: "in", level: 0 };
  const c = elapsed % CYCLE_S;
  if (c < BREATH_IN_S) return { phase: "in", level: ease(c / BREATH_IN_S) };
  return { phase: "out", level: 1 - ease((c - BREATH_IN_S) / BREATH_OUT_S) };
}

/** Whole seconds left in the current phase, for the countdown cue. */
export function breathRemaining(elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0) return BREATH_IN_S;
  const c = elapsed % CYCLE_S;
  return Math.ceil(c < BREATH_IN_S ? BREATH_IN_S - c : CYCLE_S - c);
}
