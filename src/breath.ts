export const BREATH_IN_S = 4;
export const BREATH_OUT_S = 6;
const CYCLE_S = BREATH_IN_S + BREATH_OUT_S;

export type Breath = { phase: "in" | "out"; level: number };

/** Paced-breathing state for `elapsed` seconds into the scan. Level is 0 (empty) to 1 (full). */
export function breathAt(elapsed: number): Breath {
  if (!Number.isFinite(elapsed) || elapsed < 0) return { phase: "in", level: 0 };
  const c = elapsed % CYCLE_S;
  if (c < BREATH_IN_S) return { phase: "in", level: 0.5 * (1 - Math.cos((Math.PI * c) / BREATH_IN_S)) };
  return { phase: "out", level: 0.5 * (1 + Math.cos((Math.PI * (c - BREATH_IN_S)) / BREATH_OUT_S)) };
}
