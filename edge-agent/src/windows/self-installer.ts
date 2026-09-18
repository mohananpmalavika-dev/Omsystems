import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = typeof __dirname !== "undefined"
  ? __dirname
  : (typeof import.meta !== "undefined" && import.meta.url ? dirname(fileURLToPath(import.meta.url)) : process.cwd());

const ASSET_ROOT = join(moduleDirectory, "..", "vendor", "windows");
const NATIVE_MODULES_ROOT = join(moduleDirectory, "..", "release", "node_modules");
const SECURE_FACE_MODELS_ROOT = join(moduleDirectory, "..", "models", "secure-face");

const REQUIRED_BUNDLE_ASSETS = [
  ["ffmpeg.zip", join(ASSET_ROOT, "ffmpeg.zip")],
  ["mediamtx.zip", join(ASSET_ROOT, "mediamtx.zip")],
  ["cloudflared.exe", join(ASSET_ROOT, "cloudflared.exe")],
  ["Secure face ONNX models", SECURE_FACE_MODELS_ROOT],
  ["Windows native module runtime", NATIVE_MODULES_ROOT],
] as const;

/**
 * Validates the assets consumed by the native Inno Setup installer. The former
 * self-extracting installation path was retired because it depended on
 * PowerShell elevation and scripts; supported Windows packages are native
 * installers only.
 */
export function inspectBundledWindowsRuntime() {
  return REQUIRED_BUNDLE_ASSETS.map(([name, path]) => {
    if (!existsSync(path)) throw new Error(`The native Windows installer is missing ${name}`);
    const metadata = statSync(path);
    const nativeBinary = join(path, "@img", "sharp-win32-x64", "lib", "sharp-win32-x64-0.35.4.node");
    const requiredModels = ["manifest.json", "detector.onnx", "recognizer.onnx", "liveness.onnx"];
    if (name === "Secure face ONNX models") {
      const missingModels = requiredModels.filter((file) => {
        const model = join(path, file);
        return !existsSync(model) || statSync(model).size < 1024;
      });
      if (missingModels.length) throw new Error(`The bundled secure-face models are incomplete: ${missingModels.join(", ")}`);
    }
    const sizeBytes = name === "Windows native module runtime"
      ? (existsSync(nativeBinary) ? statSync(nativeBinary).size : 0)
      : name === "Secure face ONNX models"
        ? requiredModels.reduce((total, file) => total + statSync(join(path, file)).size, 0)
        : metadata.size;
    if (sizeBytes <= 0) throw new Error(`The bundled ${name} is empty`);
    return { name, sizeBytes };
  });
}

export function launchWindowsSelfInstaller(_environmentFile: string) {
  throw new Error("Self-extracting installation is no longer supported. Download and run the signed KryptonVision Windows installer; it performs setup without PowerShell.");
}
