import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const EMBEDDED_CONFIG_MARKER = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");
const MAX_EMBEDDED_CONFIG_BYTES = 256 * 1024;

export function readEmbeddedEnvironmentFile(executablePath = process.execPath) {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(executablePath, "r");
    const size = fstatSync(descriptor).size;
    const footerLength = EMBEDDED_CONFIG_MARKER.length + 4;
    if (size < footerLength) return undefined;
    const footer = Buffer.alloc(footerLength);
    readSync(descriptor, footer, 0, footer.length, size - footerLength);
    if (!footer.subarray(4).equals(EMBEDDED_CONFIG_MARKER)) return undefined;
    const configLength = footer.readUInt32LE(0);
    if (configLength < 1 || configLength > MAX_EMBEDDED_CONFIG_BYTES || configLength > size - footerLength) {
      throw new Error("The embedded branch configuration has an invalid length");
    }
    const content = Buffer.alloc(configLength);
    readSync(descriptor, content, 0, content.length, size - footerLength - configLength);
    return content.toString("utf8");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
