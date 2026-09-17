import { deflateRawSync } from "node:zlib";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = process.argv[2] ? resolve(process.argv[2]) : join(edgeRoot, "release");
const executablePath = join(releaseRoot, "edge-agent.exe");
const deflatedPath = `${executablePath}.deflated`;
const metaPath = `${executablePath}.deflated.json`;

const metadata = await stat(executablePath).catch(() => undefined);
if (!metadata || !metadata.isFile() || metadata.size === 0) {
  console.log("No edge-agent.exe found to cache, skipping.");
  process.exit(0);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 * (crc & 1));
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

try {
  const existingMeta = JSON.parse(await readFile(metaPath, "utf8"));
  const existingDeflated = await stat(deflatedPath).catch(() => undefined);
  if (
    existingMeta.size === metadata.size &&
    existingMeta.mtimeMs === metadata.mtimeMs &&
    existingDeflated &&
    existingDeflated.size > 0
  ) {
    console.log("Pre-deflated cache is already up to date.");
    process.exit(0);
  }
} catch {
  // Generate
}

console.log(`Generating deflated cache for ${executablePath} (${metadata.size} bytes)...`);
const exeBuffer = await readFile(executablePath);
const crc = crc32(exeBuffer);
const deflated = deflateRawSync(exeBuffer, { level: 1 });
await writeFile(deflatedPath, deflated);
await writeFile(metaPath, JSON.stringify({ size: metadata.size, mtimeMs: metadata.mtimeMs, crc }));
console.log(`✅ Cached deflated package: ${deflated.length} bytes (CRC: ${crc})`);
