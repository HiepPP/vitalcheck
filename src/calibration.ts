// Per-user cuff calibration for the blood-pressure estimate, kept in localStorage.
import type { BpFeatures, Calibration } from "./bp";

export const CALIBRATION_KEY = "vitalcheck.bp-calibration.v1";

const CUFF_RANGE = { sys: [70, 250], dia: [40, 150] } as const;

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return v >= lo && v <= hi;
}

/** Validates a cuff reading entered by the user. */
export function makeCalibration(
  sys: number,
  dia: number,
  features: BpFeatures,
  at: Date,
): { ok: true; value: Calibration } | { ok: false; error: string } {
  if (!Number.isInteger(sys) || !inRange(sys, CUFF_RANGE.sys)) return { ok: false, error: "SYS must be a whole number from 70 to 250" };
  if (!Number.isInteger(dia) || !inRange(dia, CUFF_RANGE.dia)) return { ok: false, error: "DIA must be a whole number from 40 to 150" };
  if (sys <= dia) return { ok: false, error: "SYS must be higher than DIA" };
  return { ok: true, value: { sys, dia, features: { ...features }, at: at.toISOString() } };
}

/** Parses stored JSON; anything malformed or out of range is treated as no calibration. */
export function parseCalibration(raw: string | null): Calibration | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  const f = c.features as Record<string, unknown> | undefined;
  if (!finite(c.sys) || !finite(c.dia) || typeof c.at !== "string" || Number.isNaN(Date.parse(c.at))) return null;
  if (!f || !finite(f.hr) || !finite(f.riseFrac) || !finite(f.widthFrac)) return null;
  const checked = makeCalibration(c.sys, c.dia, { hr: f.hr, riseFrac: f.riseFrac, widthFrac: f.widthFrac }, new Date(c.at));
  return checked.ok ? checked.value : null;
}

export function loadCalibration(store: KeyValueStore = localStorage): Calibration | null {
  return parseCalibration(store.getItem(CALIBRATION_KEY));
}

export function saveCalibration(c: Calibration, store: KeyValueStore = localStorage): void {
  store.setItem(CALIBRATION_KEY, JSON.stringify(c));
}

export function clearCalibration(store: KeyValueStore = localStorage): void {
  store.removeItem(CALIBRATION_KEY);
}
