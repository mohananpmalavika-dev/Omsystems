import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredAssets = [
  "vendor/windows/ffmpeg.zip",
  "vendor/windows/mediamtx.zip",
  "vendor/windows/cloudflared.exe",
  "installer/windows/install-edge-agent.ps1",
  "installer/windows/uninstall-edge-agent.ps1",
  "installer/windows/open-dashboard-scan.ps1",
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
    `Windows self-installer cannot be built because required assets are missing or empty: ${missing.join(", ")}. ` +
    "Run npm.cmd run fetch:windows-runtime and restore the installer scripts before building.",
  );
}

process.stdout.write(`Verified ${requiredAssets.length} Windows self-installer assets.\n`);
