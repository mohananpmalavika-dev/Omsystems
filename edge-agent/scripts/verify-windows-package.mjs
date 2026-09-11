import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const executable = join(edgeRoot, "release", "edge-agent.exe");

if (!existsSync(executable)) {
  throw new Error(`Windows package verification failed: ${executable} was not created.`);
}

// pkg can cross-compile a Windows executable on the Linux control-plane image,
// but that runner cannot execute it. Asset validation has already happened
// before packaging; run the executable-level smoke check only on Windows.
if (process.platform !== "win32") {
  process.stdout.write("Windows package smoke check deferred: cross-compiled artifact cannot run on this host.\n");
  process.exit(0);
}

const result = spawnSync(executable, ["--verify-bundle"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Windows package verification failed with exit code ${result.status ?? "unknown"}.`);
}
