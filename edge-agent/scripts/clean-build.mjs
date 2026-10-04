import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const edgeAgentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const directory of ["build", "dist"]) {
  const target = resolve(edgeAgentRoot, directory);
  if (dirname(target) !== edgeAgentRoot) throw new Error(`unsafe_clean_target:${target}`);
  await rm(target, { recursive: true, force: true });
}

const releaseTarget = resolve(edgeAgentRoot, "release");
try {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const entries = await readdir(releaseTarget);
  for (const entry of entries) {
    if (entry !== "windows-release.json") {
      await rm(join(releaseTarget, entry), { recursive: true, force: true });
    }
  }
} catch {
  // release directory may not exist
}
