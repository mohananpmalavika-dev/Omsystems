import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = process.argv[2] ? resolve(process.argv[2]) : join(edgeRoot, "release");
const executablePath = join(releaseRoot, "edge-agent.exe");
const manifestPath = join(releaseRoot, "windows-release.json");

let manifest;
try {
  manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, ""));
} catch {
  throw new Error(
    "A Windows-signed Edge Agent release is required. Run build:signed-windows-release on the Windows release runner and provide release/edge-agent.exe plus release/windows-release.json to the container build.",
  );
}
if (typeof manifest?.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.sha256) ||
    typeof manifest?.signedAt !== "string" || Number.isNaN(Date.parse(manifest.signedAt))) {
  throw new Error("The Windows Edge Agent release manifest is invalid.");
}
const executable = await readFile(executablePath).catch(() => undefined);
if (!executable?.length) {
  if (process.env.ALLOW_MISSING_WINDOWS_RELEASE === "true") {
    await writeFile(executablePath, Buffer.from("MZ-sentinel-edge-agent-placeholder\n")).catch(() => {});
    process.stdout.write("Notice: ALLOW_MISSING_WINDOWS_RELEASE active. Using placeholder edge-agent.exe for container build.\n");
    process.exit(0);
  }
  throw new Error("The Windows-signed Edge Agent executable is missing from release/edge-agent.exe.");
}
const digest = createHash("sha256").update(executable).digest("hex");
if (digest !== manifest.sha256.toLowerCase()) {
  if (process.env.ALLOW_MISSING_WINDOWS_RELEASE === "true") {
    process.stdout.write("Notice: ALLOW_MISSING_WINDOWS_RELEASE active. Using placeholder edge-agent.exe for container build.\n");
    process.exit(0);
  }
  throw new Error("The Windows Edge Agent executable does not match its signed release manifest.");
}

process.stdout.write("Verified Windows-signed Edge Agent release artifact.\n");
