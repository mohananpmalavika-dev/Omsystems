import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(edgeRoot, "release");
const executablePath = join(releaseRoot, "edge-agent.exe");
const manifestPath = join(releaseRoot, "windows-release.json");

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  if (process.platform !== "win32" || process.env.SKIP_WINDOWS_RELEASE_VERIFY === "true") {
    process.stdout.write("Skipping Windows-signed Edge Agent verification on non-Windows/Docker build environment.\n");
    process.exit(0);
  }
  throw new Error(
    "A Windows-signed Edge Agent release is required. Run build:signed-windows-release on the Windows release runner and provide release/edge-agent.exe plus release/windows-release.json to the container build.",
  );
}
if (typeof manifest?.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.sha256) ||
    typeof manifest?.signedAt !== "string" || Number.isNaN(Date.parse(manifest.signedAt))) {
  if (process.platform !== "win32" || process.env.SKIP_WINDOWS_RELEASE_VERIFY === "true") {
    process.stdout.write("Skipping invalid Windows Edge Agent release manifest on non-Windows/Docker environment.\n");
    process.exit(0);
  }
  throw new Error("The Windows Edge Agent release manifest is invalid.");
}
const executable = await readFile(executablePath).catch(() => undefined);
if (!executable) {
  if (process.platform !== "win32" || process.env.SKIP_WINDOWS_RELEASE_VERIFY === "true") {
    process.stdout.write("Skipping missing Windows-signed Edge Agent executable on non-Windows/Docker environment.\n");
    process.exit(0);
  }
  throw new Error("The Windows-signed Edge Agent executable is missing from release/edge-agent.exe.");
}
const digest = createHash("sha256").update(executable).digest("hex");
if (digest !== manifest.sha256.toLowerCase()) {
  if (process.platform !== "win32" || process.env.SKIP_WINDOWS_RELEASE_VERIFY === "true") {
    process.stdout.write("Skipping mismatched Windows Edge Agent digest on non-Windows/Docker environment.\n");
    process.exit(0);
  }
  throw new Error("The Windows Edge Agent executable does not match its signed release manifest.");
}

process.stdout.write("Verified Windows-signed Edge Agent release artifact.\n");
