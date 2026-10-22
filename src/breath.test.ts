import { describe, expect, it } from "vitest";
import { BREATH_IN_S, BREATH_OUT_S, breathAt } from "./breath";

describe("breathAt", () => {
  it("paces a 4 s inhale and a 6 s exhale", () => {
    expect(BREATH_IN_S).toBe(4);
    expect(BREATH_OUT_S).toBe(6);
  });

  it("starts an inhale at level 0", () => {
    expect(breathAt(0)).toEqual({ phase: "in", level: 0 });
  });

  it("switches to the exhale at the top of the breath", () => {
    const end = breathAt(BREATH_IN_S - 1e-6);
    expect(end.phase).toBe("in");
    expect(end.level).toBeCloseTo(1, 4);
    const top = breathAt(BREATH_IN_S);
    expect(top.phase).toBe("out");
    expect(top.level).toBeCloseTo(1, 6);
  });

  it("rises during the inhale and falls during the exhale", () => {
    for (let i = 1; i < 40; i++) {
      expect(breathAt(i / 10).level).toBeGreaterThan(breathAt((i - 1) / 10).level);
    }
    for (let i = 41; i < 100; i++) {
      expect(breathAt(i / 10).phase).toBe("out");
      expect(breathAt(i / 10).level).toBeLessThan(breathAt((i - 1) / 10).level);
    }
  });

  it("stays within 0 and 1", () => {
    for (let i = 0; i <= 300; i++) {
      const { level } = breathAt(i / 10);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it("repeats every 10 s", () => {
    for (const t of [0.7, 2.5, 5.2, 9.3]) {
      const a = breathAt(t);
      const b = breathAt(t + 3 * (BREATH_IN_S + BREATH_OUT_S));
      expect(b.phase).toBe(a.phase);
      expect(b.level).toBeCloseTo(a.level, 6);
    }
  });

  it("treats negative or non-finite time as the cycle start", () => {
    for (const t of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(breathAt(t)).toEqual({ phase: "in", level: 0 });
    }
  });
});
