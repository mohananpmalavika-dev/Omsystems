import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Native Node add-ons cannot be loaded from pkg's virtual snapshot filesystem.
 * The Windows release therefore installs sharp and its native DLLs beside the
 * executable, then resolves the module from that real directory at runtime.
 */
const sidecarDirectory = (process as NodeJS.Process & { pkg?: unknown }).pkg
  ? dirname(process.execPath)
  : process.cwd();
const loadNativeModule = createRequire(join(sidecarDirectory, "edge-agent-runtime.cjs"));

const sharp: typeof import("sharp").default = loadNativeModule(
  (process as NodeJS.Process & { pkg?: unknown }).pkg
    ? join(sidecarDirectory, "node_modules", "sharp")
    : "sharp",
);

export default sharp;
