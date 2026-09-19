import fs from "node:fs";
import path from "node:path";

const inputFile = "C:/Omsystems/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.21-windows.exe";
const outputDir = "C:/Omsystems/Omsystems/scratch/installer_chunks";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const CHUNK_SIZE = 25 * 1024 * 1024; // 25 MB
const buffer = Buffer.alloc(CHUNK_SIZE);
const fd = fs.openSync(inputFile, "r");

let chunkIndex = 0;
let bytesRead = 0;

while ((bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, null)) > 0) {
  const chunkFileName = `part_${String(chunkIndex).padStart(2, "0")}`;
  const chunkPath = path.join(outputDir, chunkFileName);
  fs.writeFileSync(chunkPath, buffer.subarray(0, bytesRead));
  console.log(`Wrote ${chunkFileName}: ${bytesRead} bytes`);
  chunkIndex++;
}

fs.closeSync(fd);
console.log(`Done. Created ${chunkIndex} chunks.`);
