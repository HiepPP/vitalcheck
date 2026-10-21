import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type CameraError = "insecure" | "unsupported" | "denied" | "notFound" | "inUse" | "unknown";

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw "insecure" satisfies CameraError;
  if (!navigator.mediaDevices?.getUserMedia) throw "unsupported" satisfies CameraError;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 120 } },
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await lockExposure(stream);
    return stream;
  } catch (e) {
    const name = (e as DOMException)?.name;
    throw (
      name === "NotAllowedError" || name === "SecurityError"
        ? "denied"
        : name === "NotFoundError" || name === "OverconstrainedError"
          ? "notFound"
          : name === "NotReadableError"
            ? "inUse"
            : "unknown"
    ) satisfies CameraError;
  }
}

/** Auto exposure and white balance would add slow colour drift; lock them once settled. */
async function lockExposure(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const lock: Record<string, string> = {};
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes("manual")) lock.exposureMode = "manual";
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes("manual")) lock.whiteBalanceMode = "manual";
  if (!Object.keys(lock).length) return;
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await track.applyConstraints({ advanced: [lock as MediaTrackConstraintSet] });
  } catch {
    // Unsupported locks are not fatal.
  }
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

let landmarker: Promise<FaceLandmarker | null> | null = null;

/** Resolves to null when the model cannot load; the app then falls back to fixed regions. */
export function loadLandmarker(): Promise<FaceLandmarker | null> {
  landmarker ??= (async () => {
    try {
      const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
      return await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    } catch (e) {
      console.warn("Face landmarker unavailable", e);
      return null;
    }
  })();
  return landmarker;
}

/**
 * Calls `cb` once per new video frame with a timestamp in seconds. Prefers the
 * frame's mediaTime when it increases; some browsers report a constant value.
 */
export function onVideoFrame(video: HTMLVideoElement, cb: (t: number) => void): () => void {
  let stopped = false;
  let useMedia: boolean | null = null;
  let firstMedia = NaN;
  const pick = (media: number | undefined, now: number): number | null => {
    if (useMedia === null) {
      if (media === undefined) useMedia = false;
      else if (Number.isNaN(firstMedia)) {
        firstMedia = media;
        return null;
      } else useMedia = media > firstMedia;
    }
    return useMedia ? media! : now;
  };
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    const tick = (_: number, meta: VideoFrameCallbackMetadata) => {
      if (stopped) return;
      const t = pick(meta?.mediaTime, performance.now() / 1000);
      if (t !== null) cb(t);
      video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  } else {
    let last = -1;
    const tick = () => {
      if (stopped) return;
      if (video.currentTime !== last) {
        last = video.currentTime;
        cb(performance.now() / 1000);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return () => {
    stopped = true;
  };
}
