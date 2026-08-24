import { readFile, writeFile } from "node:fs/promises";

const marker = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");
const source = await readFile("C:/Users/Dhanya/Downloads/Local-Camera-Pilot-scanner-setup (3).exe");
const footerLength = marker.length + 4;
const footer = source.subarray(source.length - footerLength);
if (!footer.subarray(4).equals(marker)) throw new Error("Downloaded installer has no embedded configuration");
const configLength = footer.readUInt32LE(0);
if (configLength < 1 || configLength > 256 * 1024) throw new Error("Invalid embedded configuration length");
const embedded = source.subarray(source.length - footerLength - configLength);
const patched = await readFile("edge-agent/release/edge-agent.exe");
await writeFile(
  "C:/Users/Dhanya/AppData/Local/Temp/SentinelGrid-fixed-reused-installer.exe",
  Buffer.concat([patched, embedded]),
);
console.log(`Patched installer created with ${configLength} bytes of preserved embedded configuration.`);
