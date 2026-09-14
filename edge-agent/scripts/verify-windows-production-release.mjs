import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
    "A Windows Edge Agent release with a checksum manifest is required. Provide release/edge-agent.exe plus its matching release/windows-release.json to the container build.",
  );
}
if (typeof manifest?.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
  throw new Error("The Windows Edge Agent release manifest is invalid.");
}
const executable = await readFile(executablePath).catch(() => undefined);
if (!executable?.length) {
  throw new Error("The Windows Edge Agent executable is missing from release/edge-agent.exe.");
}
const digest = createHash("sha256").update(executable).digest("hex");
if (digest !== manifest.sha256.toLowerCase()) {
  throw new Error("The Windows Edge Agent executable does not match its checksum manifest.");
}

process.stdout.write("Verified Windows Edge Agent release checksum.\n");
