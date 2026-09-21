import { copyFileSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.argv[2] || join(edgeRoot, "release", "edge-agent.exe");
const nativeSharpBinary = join(
  dirname(executable),
  "node_modules",
  "@img",
  "sharp-win32-x64",
  "lib",
  "sharp-win32-x64-0.35.4.node",
);
const sharpRuntimeDependencies = [
  join(dirname(executable), "node_modules", "sharp", "package.json"),
  join(dirname(executable), "node_modules", "semver", "package.json"),
  join(dirname(executable), "node_modules", "detect-libc", "package.json"),
  join(dirname(executable), "node_modules", "@img", "colour", "package.json"),
];
const onnxNativeDirectory = join(dirname(executable), "node_modules", "onnxruntime-node", "bin", "napi-v6", "win32", "x64");
const onnxNativeDependencies = ["onnxruntime_binding.node", "onnxruntime.dll"];

if (!existsSync(executable)) {
  throw new Error(`Windows package verification failed: ${executable} was not created.`);
}
if (!existsSync(nativeSharpBinary)) {
  throw new Error(
    `Windows package verification failed: sharp native runtime is missing (${nativeSharpBinary}).`,
  );
}
for (const dependency of sharpRuntimeDependencies) {
  if (!existsSync(dependency)) {
    throw new Error(
      `Windows package verification failed: sharp runtime dependency is missing (${dependency}).`,
    );
  }
}
for (const filename of onnxNativeDependencies) {
  if (!existsSync(join(onnxNativeDirectory, filename))) {
    throw new Error(`Windows package verification failed: ONNX Runtime native file is missing (${filename}).`);
  }
}

// pkg can cross-compile a Windows executable on the Linux control-plane image,
// but that runner cannot execute it. Asset validation has already happened
// before packaging; run the executable-level smoke check only on Windows.
if (process.platform !== "win32") {
  process.stdout.write("Windows package smoke check deferred: cross-compiled artifact cannot run on this host.\n");
  process.exit(0);
}

// A smoke check beside the checkout can silently borrow native dependencies
// from the workspace's node_modules. Reproduce a clean branch installation.
const isolatedDirectory = mkdtempSync(join(tmpdir(), "sentinel-edge-release-"));
try {
  const isolatedExecutable = join(isolatedDirectory, "edge-agent.exe");
  copyFileSync(executable, isolatedExecutable);
  cpSync(join(dirname(executable), "node_modules"), join(isolatedDirectory, "node_modules"), { recursive: true });
  for (const argument of ["--verify-bundle", "--version"]) {
    const result = spawnSync(isolatedExecutable, [argument], { cwd: isolatedDirectory, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Windows package verification failed for ${argument} with exit code ${result.status ?? "unknown"}.`);
    }
  }
} finally {
  rmSync(isolatedDirectory, { recursive: true, force: true });
}
