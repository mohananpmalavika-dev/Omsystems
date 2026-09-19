import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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

const hasInstallerFile = typeof manifest.installerFile === "string";
const hasInstallerHash = typeof manifest.installerSha256 === "string";
if (!hasInstallerFile && !hasInstallerHash) {
  process.stdout.write("Verified Windows Edge Agent release checksum.\n");
  process.exit(0);
}
if (!hasInstallerFile || !/^KryptonVisionInstaller-v[0-9A-Za-z.-]+-windows\.exe$/.test(manifest.installerFile)) {
  throw new Error("The Windows Edge Agent release manifest is missing a valid native installer filename.");
}
if (typeof manifest.installerSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.installerSha256)) {
  throw new Error("The Windows Edge Agent release manifest is missing a valid native installer checksum.");
}
const installerPath = join(edgeRoot, "installer", "windows", "output", manifest.installerFile);
if (basename(installerPath) !== manifest.installerFile) {
  throw new Error("The Windows Edge Agent installer filename is unsafe.");
}
const installer = await readFile(installerPath).catch(() => undefined);
if (!installer?.length) {
  throw new Error(`The native Windows Edge Agent installer is missing from ${installerPath}.`);
}
const installerDigest = createHash("sha256").update(installer).digest("hex");
if (installerDigest !== manifest.installerSha256.toLowerCase()) {
  throw new Error("The native Windows Edge Agent installer does not match its checksum manifest.");
}

const sourcePath = join(edgeRoot, "installer", "windows", "sentinel-grid.iss");
const source = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");
const sourceDigest = createHash("sha256").update(source).digest("hex");
if (typeof manifest.installerSourceSha256 !== "string" || sourceDigest !== manifest.installerSourceSha256.toLowerCase()) {
  throw new Error("The Windows installer was not built from the current installer source. Rebuild the Windows installer and publish its generated manifest together.");
}

process.stdout.write("Verified Windows Edge Agent release and native installer checksums.\n");
