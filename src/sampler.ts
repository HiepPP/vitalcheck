// Per-frame skin colour sampling from forehead and cheek patches.
import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Rgb, Sample } from "./dsp";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PatchStat extends Rgb {
  n: number; // skin pixel count
  area: number;
}

export interface FrameRead {
  sample: Sample | null;
  face: boolean;
  rois: Rect[];
  brightness: number;
  skin: number;
}

// MediaPipe Face Mesh landmark indices.
const LM = {
  foreheadTop: 10,
  foreheadLeft: 109,
  foreheadRight: 338,
  browLeft: 105,
  browRight: 334,
  cheekLeft: 50,
  cheekRight: 280,
  faceLeft: 234,
  faceRight: 454,
  nose: 1,
} as const;

const LUMA_RANGE = [40, 240] as const;
const luma = (c: Rgb) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

function faceRois(lm: NormalizedLandmark[], w: number, h: number): Rect[] {
  const p = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const faceW = Math.abs(p(LM.faceRight).x - p(LM.faceLeft).x);
  const top = p(LM.foreheadTop).y;
  const brow = (p(LM.browLeft).y + p(LM.browRight).y) / 2;
  const l = p(LM.foreheadLeft).x;
  const r = p(LM.foreheadRight).x;
  const forehead = { x: Math.min(l, r), y: top + 0.25 * (brow - top), w: Math.abs(r - l), h: 0.55 * (brow - top) };
  const square = (c: { x: number; y: number }) => {
    const s = 0.16 * faceW;
    return { x: c.x - s / 2, y: c.y - s / 2, w: s, h: s };
  };
  return [forehead, square(p(LM.cheekLeft)), square(p(LM.cheekRight))];
}

/** Fixed regions inside the on-screen oval, used when face tracking is unavailable. */
function guideRois(w: number, h: number): Rect[] {
  const cx = w / 2;
  const s = Math.min(w, h) * 0.42;
  return [
    { x: cx - s * 0.25, y: h * 0.24, w: s * 0.5, h: h * 0.07 },
    { x: cx - s * 0.42, y: h * 0.5, w: s * 0.2, h: h * 0.09 },
    { x: cx + s * 0.22, y: h * 0.5, w: s * 0.2, h: h * 0.09 },
  ];
}

function grid(r: Rect, cols: number, rows: number): Rect[] {
  const out: Rect[] = [];
  const w = r.w / cols;
  const h = r.h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push({ x: r.x + i * w, y: r.y + j * h, w, h });
  return out;
}

/** Forehead 4x2 + each cheek 2x2 = 16 patches. */
function toPatches(rois: Rect[]): Rect[] {
  const [forehead, left, right] = rois;
  return [...grid(forehead, 4, 2), ...grid(left, 2, 2), ...grid(right, 2, 2)];
}

/** YCbCr skin classifier. */
function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 35 && y < 245 && cb > 77 && cb < 130 && cr > 130 && cr < 180;
}

function skinMean(px: Uint8ClampedArray, area: number): PatchStat {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!isSkin(px[i], px[i + 1], px[i + 2])) continue;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  }
  return n ? { r: r / n, g: g / n, b: b / n, n, area } : { r: 0, g: 0, b: 0, n: 0, area };
}

/** Weight patches by skin coverage and down-weight patches whose brightness flickers. */
function combine(stats: PatchStat[], jitter: number[]): (Rgb & { n: number }) | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  let n = 0;
  stats.forEach((s, i) => {
    if (s.n < 8) return;
    const l = luma(s);
    if (l < LUMA_RANGE[0] || l > LUMA_RANGE[1]) return;
    const w = (s.area > 0 ? s.n / s.area : 0) / (1 + (jitter[i] ?? 0) / 2);
    if (w <= 0) return;
    r += s.r * w;
    g += s.g * w;
    b += s.b * w;
    wsum += w;
    n += s.n;
  });
  return wsum <= 0 || n < 60 ? null : { r: r / wsum, g: g / wsum, b: b / wsum, n };
}

export class FaceSampler {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private rois: Rect[] = [];
  private lastFaceAt = -Infinity;
  private noseY = NaN;
  private frame = 0;
  private patchLuma: number[] = [];
  private jitter: number[] = [];

  constructor(
    private video: HTMLVideoElement,
    private tracker: FaceLandmarker | null,
  ) {}

  get tracking(): boolean {
    return this.tracker !== null;
  }

  read(t: number): FrameRead {
    const { videoWidth: w, videoHeight: h } = this.video;
    const none: FrameRead = { sample: null, face: false, rois: [], brightness: 0, skin: 0 };
    if (!w || !h) return none;
    if (this.canvas.width !== w) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(this.video, 0, 0, w, h);

    let face = true;
    if (this.tracker) {
      // Landmarks move slowly; tracking every other frame halves the model cost.
      if (this.frame++ % 2 === 0) {
        const lm = this.tracker.detectForVideo(this.video, t * 1000).faceLandmarks?.[0];
        if (lm) {
          this.rois = faceRois(lm, w, h);
          this.noseY = lm[LM.nose].y;
          this.lastFaceAt = t;
        }
      }
      face = t - this.lastFaceAt < 0.5;
    } else {
      this.rois = guideRois(w, h);
    }
    if (!face || !this.rois.length) return none;

    const patches = toPatches(this.rois);
    const stats = patches.map((p, i) => {
      const x = Math.max(0, Math.floor(p.x));
      const y = Math.max(0, Math.floor(p.y));
      const pw = Math.min(w - x, Math.ceil(p.w));
      const ph = Math.min(h - y, Math.ceil(p.h));
      if (pw <= 0 || ph <= 0) return { r: 0, g: 0, b: 0, n: 0, area: 0 };
      const s = skinMean(this.ctx.getImageData(x, y, pw, ph).data, pw * ph);
      this.trackJitter(i, s);
      return s;
    });
    const skin = stats.reduce((a, s) => a + s.n, 0);
    const c = combine(stats, this.jitter);
    if (!c) return { sample: null, face, rois: patches, brightness: 0, skin };
    const parts = stats.map((s) => (s.n >= 8 ? { r: s.r, g: s.g, b: s.b } : { r: NaN, g: NaN, b: NaN }));
    return {
      sample: { t, r: c.r, g: c.g, b: c.b, y: this.noseY, parts },
      face,
      rois: patches,
      brightness: luma(c),
      skin,
    };
  }

  private trackJitter(i: number, s: PatchStat): void {
    if (!s.n) {
      this.patchLuma[i] = NaN;
      return;
    }
    const l = luma(s);
    const prev = this.patchLuma[i];
    if (Number.isFinite(prev)) {
      const d = Math.abs(l - prev);
      this.jitter[i] = Number.isFinite(this.jitter[i]) ? this.jitter[i] * 0.9 + d * 0.1 : d;
    }
    this.patchLuma[i] = l;
  }
}
