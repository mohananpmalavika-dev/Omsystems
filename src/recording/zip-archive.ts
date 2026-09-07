import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
  mtime?: Date;
}

export interface ZipArchiveResult {
  outputPath: string;
  sizeBytes: number;
  sha256: string;
  entryCount: number;
}

/**
 * Creates a standard PKZip (ZIP format 2.0) buffer from in-memory entries.
 * Fully compliant with standard unzip utilities (unzip, 7-zip, WinRAR, Python zipfile, PowerShell).
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  // Deterministic sorting of entries by path
  const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sortedEntries) {
    const normalizedName = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const filenameBuf = Buffer.from(normalizedName, "utf8");
    const data = entry.data;
    const crc = crc32(data);

    // Deflate compression
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;

    // Date/time handling (MS-DOS format)
    const d = entry.mtime ?? new Date();
    const dosTime =
      ((d.getHours() & 0x1f) << 11) |
      ((d.getMinutes() & 0x3f) << 5) |
      ((Math.floor(d.getSeconds() / 2) & 0x1f));
    const dosDate =
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      (((d.getMonth() + 1) & 0x0f) << 5) |
      (d.getDate() & 0x1f);

    // Local file header (30 bytes + filename)
    const lh = Buffer.alloc(30 + filenameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Local header signature
    lh.writeUInt16LE(20, 4); // Minimum version (2.0)
    lh.writeUInt16LE(0x0800, 6); // General purpose flag: bit 11 = UTF-8 filename
    lh.writeUInt16LE(method, 8); // Compression method (0 = store, 8 = deflate)
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); // CRC-32
    lh.writeUInt32LE(body.length, 18); // Compressed size
    lh.writeUInt32LE(data.length, 22); // Uncompressed size
    lh.writeUInt16LE(filenameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // Extra field length
    filenameBuf.copy(lh, 30);

    localHeaders.push(lh, body);

    // Central directory header (46 bytes + filename)
    const cd = Buffer.alloc(46 + filenameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cd.writeUInt16LE(20, 4); // Version made by (2.0)
    cd.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    cd.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(filenameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // Extra field length
    cd.writeUInt16LE(0, 32); // File comment length
    cd.writeUInt16LE(0, 34); // Disk number start
    cd.writeUInt16LE(0, 36); // Internal file attributes
    cd.writeUInt32LE(0, 38); // External file attributes
    cd.writeUInt32LE(offset, 42); // Relative offset of local header
    filenameBuf.copy(cd, 46);

    centralHeaders.push(cd);
    offset += lh.length + body.length;
  }

  const cdBuf = Buffer.concat(centralHeaders);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(sortedEntries.length, 8); // Number of records on this disk
  eocd.writeUInt16LE(sortedEntries.length, 10); // Total number of records
  eocd.writeUInt32LE(cdBuf.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

/**
 * Scans a directory recursively and builds a standard .zip package.
 * Excludes any output file already in progress.
 */
export async function packageDirectoryToZip(
  sourceDir: string,
  targetZipPath: string,
): Promise<ZipArchiveResult> {
  const entries: ZipEntry[] = [];
  const targetName = basename(targetZipPath);

  function walk(currentDir: string): void {
    if (!existsSync(currentDir)) return;
    const items = readdirSync(currentDir);
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        if (basename(fullPath) === targetName) continue;
        const relPath = relative(sourceDir, fullPath).replace(/\\/g, "/");
        const data = readFileSync(fullPath);
        entries.push({
          name: relPath,
          data,
          mtime: stat.mtime,
        });
      }
    }
  }

  walk(sourceDir);

  const zipBuffer = createZipArchive(entries);
  writeFileSync(targetZipPath, zipBuffer);

  const sha256 = createHash("sha256").update(zipBuffer).digest("hex");
  const sizeBytes = zipBuffer.length;

  return {
    outputPath: targetZipPath,
    sizeBytes,
    sha256,
    entryCount: entries.length,
  };
}
