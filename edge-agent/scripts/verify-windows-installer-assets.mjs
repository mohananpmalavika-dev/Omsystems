import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredAssets = [
  "vendor/windows/ffmpeg.zip",
  "vendor/windows/mediamtx.zip",
  "vendor/windows/cloudflared.exe",
  "installer/windows/sentinel-grid.iss",
  "models/secure-face/manifest.json",
  "models/secure-face/detector.onnx",
  "models/secure-face/recognizer.onnx",
  "models/secure-face/liveness.onnx",
];

const missing = [];
for (const relativePath of requiredAssets) {
  try {
    const metadata = await stat(join(edgeRoot, relativePath));
    if (!metadata.isFile() || metadata.size <= 0) missing.push(relativePath);
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length) {
  throw new Error(
    `Native Windows installer cannot be built because required assets are missing or empty: ${missing.join(", ")}. ` +
    "Run npm.cmd run fetch:windows-runtime and restore the native installer definition before building.",
  );
}

process.stdout.write(`Verified ${requiredAssets.length} native Windows installer assets.\n`);
