import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { Transform, PassThrough } from "node:stream";
import * as archiverNamespace from "archiver";
type ArchiverFactory = (format: string, options?: archiverNamespace.ArchiverOptions) => archiverNamespace.Archiver;
const archiver = ((archiverNamespace as any).default || archiverNamespace) as unknown as ArchiverFactory;

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

export interface EvidencePackagingOptions {
  explicitFiles?: string[];
  allowedPrefixes?: string[];
  disallowedPatterns?: RegExp[];
}

/**
 * Standard allow-list of files permitted inside customer forensic evidence packages (P0-03).
 * Any worker temporary files (concat_*.txt, *.tmp, debug logs, worker state) are strictly forbidden.
 */
export const EVIDENCE_PACKAGE_ALLOW_LIST = [
  "manifest.json",
  "manifest.sig",
  "metadata.json",
  "audit.json",
  "recording-gaps.json",
  "footage/",
  "originals/",
  "snapshots/",
];

export const EVIDENCE_PACKAGE_DISALLOW_PATTERNS = [
  /^concat_.*\.txt$/i,
  /\.tmp$/i,
  /\.log$/i,
  /\.debug$/i,
  /worker[-_]state/i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
];

/**
 * Checks if a relative entry path is permitted by the forensic evidence package allow-list.
 */
export function isEvidenceFileAllowed(
  relPath: string,
  options?: EvidencePackagingOptions,
): boolean {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");

  // Check explicit disallowed patterns first
  const disallowList = options?.disallowedPatterns || EVIDENCE_PACKAGE_DISALLOW_PATTERNS;
  const fileName = basename(normalized);
  for (const pattern of disallowList) {
    if (pattern.test(fileName) || pattern.test(normalized)) {
      return false;
    }
  }

  // If explicit files are provided, only allow exact matches
  if (options?.explicitFiles && options.explicitFiles.length > 0) {
    const explicitSet = new Set(
      options.explicitFiles.map((f) => f.replace(/\\/g, "/").replace(/^\/+/, "")),
    );
    return explicitSet.has(normalized);
  }

  // Otherwise check against allowed prefixes
  const allowList = options?.allowedPrefixes || EVIDENCE_PACKAGE_ALLOW_LIST;
  return allowList.some((allowed) => {
    if (allowed.endsWith("/")) {
      return normalized.startsWith(allowed);
    }
    return normalized === allowed;
  });
}

/**
 * Streams files into an immutable ZIP64 archive with SHA-256 integrity hashing and fsync.
 * - Enforces ZIP64 format (files > 4GB, archives > 4GB, 64-bit offsets) - P0-02
 * - Streaming writes with full backpressure to keep RAM consumption strictly bounded - P0-01
 * - Packages exclusively from registered evidence artifacts via allow-list - P0-03
 */
export async function packageEvidenceToZip64(
  sourceDir: string,
  targetZipPath: string,
  options?: EvidencePackagingOptions,
): Promise<ZipArchiveResult> {
  const targetName = basename(targetZipPath);
  const candidateFiles: string[] = [];

  if (options?.explicitFiles && options.explicitFiles.length > 0) {
    for (const rel of options.explicitFiles) {
      const fullPath = join(sourceDir, rel);
      if (existsSync(fullPath) && isEvidenceFileAllowed(rel, options)) {
        candidateFiles.push(rel.replace(/\\/g, "/"));
      }
    }
  } else {
    // Scan source directory recursively
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
          if (isEvidenceFileAllowed(relPath, options)) {
            candidateFiles.push(relPath);
          }
        }
      }
    }
    walk(sourceDir);
  }

  // Deterministic sorting of archive entries
  candidateFiles.sort((a, b) => a.localeCompare(b));

  return new Promise((resolvePromise, rejectPromise) => {
    const outputWriteStream = createWriteStream(targetZipPath);
    const hashStream = createHash("sha256");

    // SHA-256 transform stream that calculates digest on-the-fly without holding whole archive in RAM
    const hashTransform = new Transform({
      transform(chunk, _encoding, callback) {
        hashStream.update(chunk);
        callback(null, chunk);
      },
    });

    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceZip64: true, // Mandatory ZIP64 support (P0-02)
    });

    archive.on("error", (err: any) => {
      rejectPromise(err);
    });

    outputWriteStream.on("error", (err) => {
      rejectPromise(err);
    });

    outputWriteStream.on("close", () => {
      try {
        try {
          const fd = openSync(targetZipPath, "r+");
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        } catch {
          // fsync may be restricted on some virtualized or Windows filesystem volumes
        }

        const stats = statSync(targetZipPath);
        const finalSha256 = hashStream.digest("hex");

        resolvePromise({
          outputPath: targetZipPath,
          sizeBytes: stats.size,
          sha256: finalSha256,
          entryCount: candidateFiles.length,
        });
      } catch (finalizeErr) {
        rejectPromise(finalizeErr);
      }
    });

    // Pipe archive -> SHA-256 transform -> output write stream
    archive.pipe(hashTransform).pipe(outputWriteStream);

    // Stream each file directly from disk into archive (O(1) memory per file)
    for (const relPath of candidateFiles) {
      const fullPath = join(sourceDir, relPath);
      const stat = statSync(fullPath);
      archive.append(createReadStream(fullPath), {
        name: relPath,
        date: stat.mtime,
      });
    }

    archive.finalize().catch(rejectPromise);
  });
}

/**
 * Compatibility wrapper for existing callers: delegates to packageEvidenceToZip64
 */
export async function packageDirectoryToZip(
  sourceDir: string,
  targetZipPath: string,
  options?: EvidencePackagingOptions,
): Promise<ZipArchiveResult> {
  return packageEvidenceToZip64(sourceDir, targetZipPath, options);
}

/**
 * In-memory buffer-to-ZIP helper for unit tests. Uses ZIP64 archiver stream.
 */
export async function createZipArchiveAsync(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceZip64: true,
    });

    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    passThrough.on("end", () => {
      resolvePromise(Buffer.concat(chunks));
    });

    archive.on("error", rejectPromise);
    archive.pipe(passThrough);

    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      archive.append(entry.data, {
        name: entry.name.replace(/\\/g, "/").replace(/^\/+/, ""),
        date: entry.mtime ?? new Date(),
      });
    }

    archive.finalize().catch(rejectPromise);
  });
}

/**
 * Synchronous in-memory fallback for legacy unit tests.
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  // Simple synchronous PKZip 2.0 / ZIP64 builder for quick test payloads
  const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of sortedEntries) {
    const normalizedName = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const filenameBuf = Buffer.from(normalizedName, "utf8");
    const data = entry.data;

    // CRC-32 and deflate
    const { crc32, deflateRawSync } = require("node:zlib");
    const crc = crc32(data);
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;

    const d = entry.mtime ?? new Date();
    const dosTime =
      ((d.getHours() & 0x1f) << 11) |
      ((d.getMinutes() & 0x3f) << 5) |
      ((Math.floor(d.getSeconds() / 2) & 0x1f));
    const dosDate =
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      (((d.getMonth() + 1) & 0x0f) << 5) |
      (d.getDate() & 0x1f);

    const lh = Buffer.alloc(30 + filenameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(45, 4); // Version 4.5 for ZIP64
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(filenameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    filenameBuf.copy(lh, 30);

    localHeaders.push(lh, body);

    const cd = Buffer.alloc(46 + filenameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(45, 4);
    cd.writeUInt16LE(45, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(filenameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    filenameBuf.copy(cd, 46);

    centralHeaders.push(cd);
    offset += lh.length + body.length;
  }

  const cdBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sortedEntries.length, 8);
  eocd.writeUInt16LE(sortedEntries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}
