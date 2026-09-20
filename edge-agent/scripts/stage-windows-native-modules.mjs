import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceModules = join(edgeRoot, "..", "node_modules");
const releaseModules = process.env.EDGE_AGENT_RELEASE_MODULES_DIR
  || join(edgeRoot, "release", "node_modules");
const requiredModules = [
  "sharp",
  "semver",
  "detect-libc",
  "@img/colour",
  "@img/sharp-win32-x64",
];

for (const moduleName of requiredModules) {
  const source = join(workspaceModules, moduleName);
  try {
    if (!(await stat(source)).isDirectory()) throw new Error("not_directory");
  } catch {
    throw new Error(
      `Missing ${moduleName} Windows runtime. Run npm.cmd install from the workspace root before building the Edge Agent.`,
    );
  }

  const destination = join(releaseModules, moduleName);
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

// pkg's internal CJS loader does not support package.json subpath exports mappings,
// so require("@img/sharp-win32-x64/sharp.node") in sharp.cjs fails unless this shim exists.
await writeFile(
  join(releaseModules, "@img", "sharp-win32-x64", "sharp.node.js"),
  "module.exports = require('./lib/sharp-win32-x64-0.35.4.node');\n",
);

process.stdout.write(`Staged Windows native modules in ${releaseModules}\n`);

