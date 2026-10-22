import "./style.css";
import { analyze, fps, liveEstimate, std, type PulseResult, type Sample } from "./dsp";
import { loadLandmarker, onVideoFrame, openCamera, stopCamera, type CameraError } from "./camera";
import { FaceSampler, type Rect } from "./sampler";
import { estimateBloodPressure, type BpFeatures } from "./bp";
import { breathAt, breathRemaining } from "./breath";
import { clearCalibration, loadCalibration, makeCalibration, saveCalibration } from "./calibration";

const MEASURE_S = 60;
const SETTLE_S = 2;
const LOST_S = 1.5; // gap without a usable sample that restarts the measurement
const MOVE_LIMIT = 0.012; // std of normalized nose y over the last 60 samples

const params = new URLSearchParams(location.search);
const useTracking = params.get("track") !== "0";
const debug = params.get("debug") === "1";

const CAMERA_ERRORS: Record<CameraError, string> = {
  denied: "Camera access was denied. Allow it in your browser settings and start again.",
  notFound: "No camera found.",
  insecure: "The camera only works over HTTPS or on localhost.",
  unsupported: "This browser does not support camera access.",
  inUse: "The camera is already in use by another app.",
  unknown: "Camera not available. Allow camera access and start again.",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const overlay = $<HTMLCanvasElement>("overlay");
const ACCENT = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim();
const GUIDE_IDLE = "#8c919a";
const LINE = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
const ACCENT_RGB = [1, 3, 5].map((i) => parseInt(ACCENT.slice(i, i + 2), 16)).join(" ");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const BREATH_LABEL = { in: "Breathe in", out: "Breathe out" } as const;

function spans(parent: HTMLElement, n: number): HTMLElement[] {
  parent.replaceChildren(...Array.from({ length: n }, () => document.createElement("span")));
  return [...parent.children] as HTMLElement[];
}
const ticks = spans($("ticks"), 30);
const qualitySegs = spans($("qmeter"), 10);

let stream: MediaStream | null = null;
let stopFrames: (() => void) | null = null;
let liveBpm: number | null = null;

function show(view: "intro" | "scan" | "result") {
  for (const id of ["intro", "scan", "result"]) $(id).hidden = id !== view;
}

function setStatus(text: string) {
  const el = $("status");
  if (el.textContent !== text) el.textContent = text;
}

function setProgress(p: number) {
  const on = Math.round(Math.max(0, Math.min(1, p)) * ticks.length);
  ticks.forEach((el, i) => el.classList.toggle("on", i < on));
}

function setLiveBpm(bpm: number | null) {
  liveBpm = bpm;
  const el = $("live-bpm");
  if (bpm === null) {
    el.textContent = "--";
    return;
  }
  const digits = String(Math.round(bpm));
  el.innerHTML = `<span class="lead0">${"0".repeat(Math.max(0, 3 - digits.length))}</span>${digits}`;
}

const trace = $<HTMLCanvasElement>("trace");
const beatDot = $("beat");
const TRACE_S = 4;

/**
 * Stylised heartbeat, `t` seconds after the beat starts. The trace draws it at the live
 * BPM for display only: a camera measures a blood-volume pulse, which never looks like this.
 * Timings shrink at high rates so the last bump still fits in the beat.
 */
function beatShape(t: number, period: number): number {
  const s = Math.min(1, period / 0.86);
  const g = (c: number, w: number) => Math.exp(-0.5 * ((t - c) / w) ** 2);
  return (
    0.11 * g(0.12 * s, 0.022 * s) -
    0.14 * g(0.215 * s, 0.007) +
    g(0.235 * s, 0.008) -
    0.42 * g(0.258 * s, 0.009) +
    0.22 * g(0.44 * s, 0.045 * s)
  );
}

/** Draws the last 4 s of beats ending at `beats` (beat count since the scan started). */
function drawTrace(beats: number, bpm: number | null) {
  const dpr = devicePixelRatio || 1;
  const w = trace.clientWidth;
  const h = trace.clientHeight;
  if (!w) return;
  if (trace.width !== Math.round(w * dpr)) {
    trace.width = Math.round(w * dpr);
    trace.height = Math.round(h * dpr);
  }
  const ctx = trace.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 6;
  const right = w - pad;
  const base = h * 0.6;
  if (bpm === null) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, base);
    ctx.lineTo(right, base);
    ctx.stroke();
    beatDot.style.setProperty("--beat", "0");
    return;
  }
  const period = 60 / bpm;
  const amp = h * 0.5;
  const yAt = (x: number) => {
    const b = beats - (TRACE_S * (right - x)) / (right - pad) / period;
    return base - amp * beatShape((b - Math.floor(b)) * period, period);
  };
  const fade = (rgb: string, a: number) => {
    const g = ctx.createLinearGradient(pad, 0, right, 0);
    g.addColorStop(0, `rgb(${rgb} / 0)`);
    g.addColorStop(0.35, `rgb(${rgb} / ${a / 2})`);
    g.addColorStop(1, `rgb(${rgb} / ${a})`);
    return g;
  };
  ctx.beginPath();
  for (let x = pad; x <= right; x++) ctx.lineTo(x, yAt(x));
  ctx.lineJoin = "round";
  ctx.strokeStyle = fade(ACCENT_RGB, 1);
  ctx.lineWidth = 2;
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = fade("255 255 255", 0.55);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(right, yAt(right), 3, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  const peak = 0.235 * Math.min(1, period / 0.86);
  const sincePeak = (((beats - Math.floor(beats)) * period - peak + period) % period) / 0.3;
  beatDot.style.setProperty("--beat", Math.max(0, 1 - sincePeak).toFixed(3));
}

function stop() {
  stopFrames?.();
  stopFrames = null;
  stopCamera(stream);
  stream = null;
}

async function start() {
  $("camera-error").hidden = true;
  show("scan");
  setStatus("Starting camera and face tracking ...");
  setProgress(0);
  setLiveBpm(null);
  $("breath").textContent = `${BREATH_LABEL.in} · ${breathRemaining(0)}`;
  drawTrace(0, null);
  $("remaining").textContent = "";
  try {
    const [s, tracker] = await Promise.all([openCamera(video), useTracking ? loadLandmarker() : null]);
    stream = s;
    $("mode").textContent = tracker ? "Face tracked" : "Guide mode";
    run(new FaceSampler(video, tracker));
  } catch (e) {
    stop();
    show("intro");
    const el = $("camera-error");
    el.textContent = CAMERA_ERRORS[(typeof e === "string" ? e : "unknown") as CameraError] ?? CAMERA_ERRORS.unknown;
    el.hidden = false;
  }
}

function motion(samples: Sample[]): number {
  const ys = samples.slice(-60).map((s) => s.y).filter(Number.isFinite);
  return ys.length > 10 ? std(ys) : 0;
}

function run(sampler: FaceSampler) {
  let phase: "settle" | "measure" = "settle";
  let settleStart = -1;
  let restarts = 0;
  let samples: Sample[] = [];
  let measured = 0;
  let lastSampleAt = -1;
  let lastLiveAt = 0;
  let notice: { text: string; until: number } | null = null;
  // The pacer clock starts on the first frame and ignores face-lost restarts.
  let breathStart = -1;
  let breathCue = "";
  // Beat count for the trace. It advances at the live BPM, so a BPM update bends the
  // trace from now on instead of jumping it.
  let beats = 0;
  let lastFrameAt = -1;

  stopFrames = onVideoFrame(video, (t) => {
    const read = sampler.read(t);
    if (breathStart < 0) breathStart = t;
    const breath = breathAt(t - breathStart);
    const cue = `${BREATH_LABEL[breath.phase]} · ${breathRemaining(t - breathStart)}`;
    if (cue !== breathCue) {
      breathCue = cue;
      $("breath").textContent = cue;
    }
    drawOverlay(read.rois, read.face, sampler.tracking, breath.level);
    if (liveBpm !== null && lastFrameAt >= 0 && !reducedMotion.matches) beats += ((t - lastFrameAt) * liveBpm) / 60;
    lastFrameAt = t;
    drawTrace(beats, liveBpm);
    if (debug) {
      $("debug").hidden = false;
      $("debug").textContent = [
        `phase=${phase}`,
        `face=${read.face}`,
        `sample=${!!read.sample}`,
        `bright=${read.brightness.toFixed(0)}`,
        `skin=${read.skin}px`,
        `move=${motion(samples).toFixed(4)}`,
        `samples=${samples.length}`,
        `fps=${fps(samples).toFixed(1)}`,
        `restarts=${restarts}`,
      ].join("  ");
    }
    const problem = !read.face
      ? "No face detected"
      : read.brightness > 0 && read.brightness < 60
        ? "Too dark - add light from the front"
        : read.brightness > 225
          ? "Too bright - avoid direct light"
          : !read.sample
            ? "Move your face into the oval"
            : null;
    const shown = (fallback: string) => (notice && t < notice.until ? notice.text : fallback);

    if (phase === "settle") {
      if (problem) {
        if (settleStart >= 0) restarts++;
        settleStart = -1;
        setProgress(0);
        setStatus(problem);
        return;
      }
      if (settleStart < 0) settleStart = t;
      setProgress(Math.min(1, (t - settleStart) / SETTLE_S) * 0.15);
      setStatus(shown(sampler.tracking ? "Please hold still" : "No face tracking: keep your face exactly in the oval"));
      if (t - settleStart >= SETTLE_S) {
        phase = "measure";
        samples = [];
        measured = 0;
        lastSampleAt = t;
      }
      return;
    }

    if (!read.sample) {
      if (t - lastSampleAt > LOST_S) {
        phase = "settle";
        settleStart = -1;
        notice = { text: "Face lost - measurement restarted", until: t + 3 };
        setProgress(0);
      }
      setStatus(problem ?? "Move your face into the oval");
      return;
    }

    measured += t - lastSampleAt;
    lastSampleAt = t;
    samples.push(read.sample);
    setStatus(shown(motion(samples) > MOVE_LIMIT ? "Please hold still" : "Measuring"));
    setProgress(measured / MEASURE_S);
    $("remaining").textContent = `${Math.max(0, Math.ceil(MEASURE_S - measured))} s left`;

    if (measured > 8 && t - lastLiveAt > 1) {
      lastLiveAt = t;
      const live = liveEstimate(samples);
      if (live && live.snrDb > -3) setLiveBpm(live.bpm);
    }
    if (measured >= MEASURE_S) {
      stop();
      setStatus("Analysing ...");
      // Let the status paint before the synchronous DFT work.
      setTimeout(() => showResult(analyze(samples)), 30);
    }
  });
}

function drawOverlay(rois: Rect[], face: boolean, tracking: boolean, level: number) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w) return;
  if (overlay.width !== w) {
    overlay.width = w;
    overlay.height = h;
  }
  const ctx = overlay.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = Math.max(2, w / 200);
  ctx.strokeStyle = face ? ACCENT : GUIDE_IDLE;
  ctx.setLineDash([w / 60, w / 80]);
  // In guide mode the oval keeps its size: the sampler reads fixed regions inside it.
  const still = reducedMotion.matches;
  const scale = tracking && !still ? 1 + 0.04 * (2 * level - 1) : 1;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = still ? 0 : w * (0.005 + 0.03 * level);
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.47, Math.min(w, h) * 0.3 * scale, h * 0.4 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!still) {
    // Rings ripple out of the oval on inhale and fold back on exhale. They never
    // resize the oval itself, so guide mode keeps them too.
    ctx.lineWidth = Math.max(1, w / 400);
    [0.55, 0.32, 0.16].forEach((alpha, i) => {
      const k = scale * (1 + 0.1 * (i + 1) * level);
      ctx.globalAlpha = alpha * level;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.47, Math.min(w, h) * 0.3 * k, h * 0.4 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
  if (!face && tracking) return;
  ctx.fillStyle = `${ACCENT}26`;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(1, w / 600);
  for (const r of rois) {
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
}

function showResult(r: PulseResult) {
  show("result");
  $("pulse").textContent = r.bpm === null ? "-" : String(Math.round(r.bpm));
  $("range").textContent =
    r.bpm === null ? `Scan too short (${r.seconds.toFixed(0)} s)` : r.bpm >= 60 && r.bpm <= 100 ? "Resting range" : "Outside resting range";
  $("snr").textContent = `Signal ${Number.isFinite(r.snrDb) ? r.snrDb.toFixed(1) : "-"} dB`;
  // Thresholds for the quality label are this clone's choice; the original's are not known.
  $("quality").textContent = r.bpm === null ? "-" : r.quality >= 0.6 ? "Good" : r.quality >= 0.3 ? "Fair" : "Weak";
  const on = Math.round(r.quality * qualitySegs.length);
  qualitySegs.forEach((el, i) => el.classList.toggle("on", i < on));
  $("m-fps").textContent = `${r.fps.toFixed(0)} fps`;
  $("m-sec").textContent = `${r.seconds.toFixed(0)} s`;
  $("m-patch").textContent = r.patchesUsed ? `${r.patchesUsed}/16` : "Whole face";
  $("poor").hidden = r.quality >= 0.3;

  lastResult = r;
  closeCalibrationForm();
  renderBloodPressure();
}

let lastResult: PulseResult | null = null;
let lastFeatures: BpFeatures | null = null;

/** Storage can be unavailable (private mode, blocked site data); treat that as uncalibrated. */
function storedCalibration() {
  try {
    return loadCalibration();
  } catch {
    return null;
  }
}

function renderBloodPressure() {
  if (!lastResult) return;
  const r = lastResult;
  const calibration = storedCalibration();
  const bp = estimateBloodPressure(r.waveform, r.bpm, r.snrDb, calibration);
  lastFeatures = bp.features ?? null;
  $("bp").textContent = bp.kind === "estimate" ? `${bp.sys}/${bp.dia}` : "-";
  $("bp-unit").hidden = bp.kind !== "estimate";
  if (bp.kind === "estimate") $("bp-unit").textContent = `mmHg ±${bp.uncertainty}`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  $("bp-note").textContent =
    bp.kind === "estimate"
      ? `Rise ${pct(bp.features.riseFrac)} · width ${pct(bp.features.widthFrac)} of beat · ${bp.beats} beats`
      : bp.reason;
  $("bp-basis").textContent = calibration
    ? `Calibrated to your cuff reading ${calibration.sys}/${calibration.dia} on ${new Date(calibration.at).toLocaleDateString()}. Shows the estimated change since then. Not validated; do not use it for medical decisions.`
    : "Uncalibrated estimate from pulse shape. Not validated. Do not use it for medical decisions.";
  // Calibration stores this scan's pulse shape, so it needs features from this scan.
  $("cal-open").hidden = !lastFeatures;
  $("cal-open").textContent = calibration ? "Recalibrate" : "Calibrate with cuff";
  $("cal-clear").hidden = !calibration;
}

function closeCalibrationForm() {
  $("cal-form").hidden = true;
  $("cal-error").hidden = true;
}

$("cal-open").addEventListener("click", () => {
  $("cal-form").hidden = false;
  $<HTMLInputElement>("cal-sys").focus();
});
$("cal-cancel").addEventListener("click", closeCalibrationForm);
$("cal-clear").addEventListener("click", () => {
  try {
    clearCalibration();
  } catch {
    // Nothing stored if storage is unavailable.
  }
  renderBloodPressure();
});
$("cal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const error = $("cal-error");
  const show = (text: string) => {
    error.textContent = text;
    error.hidden = false;
  };
  if (!lastFeatures) return show("This scan has no usable pulse shape. Measure again first.");
  const sys = Number($<HTMLInputElement>("cal-sys").value);
  const dia = Number($<HTMLInputElement>("cal-dia").value);
  const made = makeCalibration(sys, dia, lastFeatures, new Date());
  if (!made.ok) return show(made.error);
  try {
    saveCalibration(made.value);
  } catch {
    return show("This browser does not allow saving the calibration.");
  }
  closeCalibrationForm();
  renderBloodPressure();
});

$("start").addEventListener("click", start);
$("again").addEventListener("click", start);
