import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const edgeAgentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const directory of ["build", "dist", "release"]) {
  const target = resolve(edgeAgentRoot, directory);
  if (dirname(target) !== edgeAgentRoot) throw new Error(`unsafe_clean_target:${target}`);
  await rm(target, { recursive: true, force: true });
}
