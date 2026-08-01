import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ASSET_ROOT = join(__dirname, "..", "vendor", "windows");
const INSTALLER_ROOT = join(__dirname, "..", "installer", "windows");

const REQUIRED_BUNDLE_ASSETS = [
  ["ffmpeg.zip", join(ASSET_ROOT, "ffmpeg.zip")],
  ["mediamtx.zip", join(ASSET_ROOT, "mediamtx.zip")],
  ["cloudflared.exe", join(ASSET_ROOT, "cloudflared.exe")],
  ["install-edge-agent.ps1", join(INSTALLER_ROOT, "install-edge-agent.ps1")],
  ["uninstall-edge-agent.ps1", join(INSTALLER_ROOT, "uninstall-edge-agent.ps1")],
] as const;

export function inspectBundledWindowsRuntime() {
  return REQUIRED_BUNDLE_ASSETS.map(([name, path]) => {
    if (!existsSync(path)) throw new Error(`The all-in-one installer is missing ${name}`);
    const sizeBytes = statSync(path).size;
    if (sizeBytes <= 0) throw new Error(`The bundled ${name} is empty`);
    return { name, sizeBytes };
  });
}

export function launchWindowsSelfInstaller(environmentFile: string) {
  if (process.platform !== "win32") throw new Error("The embedded installer can only run on Windows");
  const stage = join(process.env.TEMP ?? process.cwd(), `SentinelGridEdgeInstall-${process.pid}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "config"), { recursive: true });
  mkdirSync(join(stage, "runtime-packages"), { recursive: true });

  try {
    copyFileSync(process.execPath, join(stage, "edge-agent.exe"));
    writeFileSync(join(stage, "config", "edge-agent.env"), environmentFile, "utf8");
    copyAsset(join(ASSET_ROOT, "ffmpeg.zip"), join(stage, "runtime-packages", "ffmpeg.zip"));
    copyAsset(join(ASSET_ROOT, "mediamtx.zip"), join(stage, "runtime-packages", "mediamtx.zip"));
    copyAsset(join(ASSET_ROOT, "cloudflared.exe"), join(stage, "runtime-packages", "cloudflared.exe"));
    copyAsset(join(INSTALLER_ROOT, "install-edge-agent.ps1"), join(stage, "install-edge-agent.ps1"));
    copyAsset(join(INSTALLER_ROOT, "uninstall-edge-agent.ps1"), join(stage, "uninstall-edge-agent.ps1"));
    copyOptionalAsset(join(ASSET_ROOT, "THIRD_PARTY_NOTICES.txt"), join(stage, "THIRD_PARTY_NOTICES.txt"));

    const installerPath = join(stage, "install-edge-agent.ps1");
    const command = `$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${powerShellLiteral(installerPath)}) -Verb RunAs -Wait -PassThru; exit $process.ExitCode`;
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      stdio: "inherit",
      windowsHide: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Installation was cancelled or failed (exit ${result.status ?? "unknown"})`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function copyAsset(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`The all-in-one installer is missing ${source.split(/[\\/]/).at(-1)}`);
  writeFileSync(destination, readFileSync(source));
}

function copyOptionalAsset(source: string, destination: string) {
  if (existsSync(source)) writeFileSync(destination, readFileSync(source));
}

function powerShellLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
