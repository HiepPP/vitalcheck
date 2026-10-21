// Copies the MediaPipe WASM runtime and downloads the face landmarker model into public/.
// Serving both locally keeps the WASM version matched to the installed JS package.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wasmSrc = `${root}node_modules/@mediapipe/tasks-vision/wasm`;
const wasmDst = `${root}public/mediapipe`;
const model = `${root}public/models/face_landmarker.task`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

cpSync(wasmSrc, wasmDst, { recursive: true });

if (!existsSync(model)) {
  mkdirSync(`${root}public/models`, { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  writeFileSync(model, Buffer.from(await res.arrayBuffer()));
}
