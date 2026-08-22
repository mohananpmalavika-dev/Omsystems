import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const staticDirectory = path.resolve("dist/server/_next/static");
const files = await readdir(staticDirectory);
const runtimeFile = files.find((file) => file.startsWith("rolldown-runtime-") && file.endsWith(".js"));

if (!runtimeFile) {
  throw new Error(`Unable to find the Rolldown runtime in ${staticDirectory}`);
}

const runtimePath = path.join(staticDirectory, runtimeFile);
const source = await readFile(runtimePath, "utf8");
const patched = source.replace("e(import.meta.url)", 'e("/worker.js")');

if (patched === source) {
  throw new Error(`Expected createRequire(import.meta.url) pattern was not found in ${runtimePath}`);
}

await writeFile(runtimePath, patched);
console.log(`Patched ${runtimeFile} for the Sites worker runtime.`);
