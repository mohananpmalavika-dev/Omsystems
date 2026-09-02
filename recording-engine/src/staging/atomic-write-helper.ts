/**
 * Crash-Safe Atomic Write and Filesystem Synchronization Utilities
 */

import { randomUUID } from "node:crypto";
import { open, rename, unlink, stat, readdir, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SegmentChecksum } from "../segments/segment-checksum.js";
import { StorageChecksumMismatchError } from "../../../packages/contracts/src/storage/storage-errors.js";

export interface AtomicWriteOptions {
  mode?: number;
  expectedSha256?: string;
  expectedSizeBytes?: number;
}

export interface RecoveredPartialFile {
  originalPath: string;
  sizeBytes: number;
  sha256: string;
  status: "RECOVERED" | "FINALIZED" | "QUARANTINED" | "UNRECOVERABLE";
  quarantinePath?: string;
}

/**
 * Performs a crash-safe atomic write to disk:
 * 1. Write to temporary `.tmp` file
 * 2. fsync file handle to flush disk buffers
 * 3. Verify size and computed SHA-256 checksum
 * 4. Atomic rename to target destination
 * 5. fsync parent directory
 */
export async function writeAtomic(
  finalPath: string,
  content: Buffer | Uint8Array,
  options?: AtomicWriteOptions,
): Promise<{ sizeBytes: number; sha256: string }> {
  const parentDir = dirname(finalPath);
  await mkdir(parentDir, { recursive: true });

  const tempPath = `${finalPath}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
  const fileHandle = await open(tempPath, "w", options?.mode ?? 0o644);

  try {
    await fileHandle.writeFile(content);
    await fileHandle.sync(); // fsync(file)
  } finally {
    await fileHandle.close();
  }

  // Verify written file size & checksum
  const writtenStats = await stat(tempPath);
  if (options?.expectedSizeBytes !== undefined && writtenStats.size !== options.expectedSizeBytes) {
    await unlink(tempPath).catch(() => undefined);
    throw new Error(
      `Atomic write size mismatch: expected ${options.expectedSizeBytes} bytes, but wrote ${writtenStats.size} bytes`,
    );
  }

  const computedSha256 = await SegmentChecksum.computeSha256(tempPath);
  if (options?.expectedSha256 && computedSha256.toLowerCase() !== options.expectedSha256.toLowerCase()) {
    await unlink(tempPath).catch(() => undefined);
    throw new StorageChecksumMismatchError(options.expectedSha256, computedSha256, tempPath);
  }

  // Atomic rename
  await rename(tempPath, finalPath);

  // fsync parent directory
  await fsyncDirectory(parentDir).catch(() => undefined);

  return {
    sizeBytes: writtenStats.size,
    sha256: computedSha256,
  };
}

/**
 * Flushes directory metadata changes to durable storage
 */
export async function fsyncDirectory(dirPath: string): Promise<void> {
  // Directory fsync is meaningful on POSIX; on Windows open() on directory may be unsupported
  if (process.platform === "win32") return;
  try {
    const dirHandle = await open(dirPath, "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    // Ignore directory sync error if unsupported by underlying fs
  }
}

/**
 * Scans a staging directory for orphaned `.partial` and `.tmp` files.
 * Quarantines or recovers them safely.
 */
export async function recoverPartialFiles(
  stagingDir: string,
  quarantineDir?: string,
): Promise<RecoveredPartialFile[]> {
  const recovered: RecoveredPartialFile[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(stagingDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.endsWith(".partial") || entry.includes(".tmp.")) {
      const fullPath = join(stagingDir, entry);
      try {
        const stats = await stat(fullPath);
        if (stats.size === 0) {
          // Empty zero-byte abandoned file -> quarantine or remove
          await unlink(fullPath).catch(() => undefined);
          recovered.push({
            originalPath: fullPath,
            sizeBytes: 0,
            sha256: "",
            status: "UNRECOVERABLE",
          });
          continue;
        }

        const sha256 = await SegmentChecksum.computeSha256(fullPath);

        if (stats.size > 1024) {
          // Potentially valid partial media
          if (quarantineDir) {
            await mkdir(quarantineDir, { recursive: true });
            const qPath = join(quarantineDir, `quarantined-${entry}`);
            await rename(fullPath, qPath);
            recovered.push({
              originalPath: fullPath,
              sizeBytes: stats.size,
              sha256,
              status: "QUARANTINED",
              quarantinePath: qPath,
            });
          } else {
            recovered.push({
              originalPath: fullPath,
              sizeBytes: stats.size,
              sha256,
              status: "RECOVERED",
            });
          }
        } else {
          // Truncated tiny fragment -> quarantine
          recovered.push({
            originalPath: fullPath,
            sizeBytes: stats.size,
            sha256,
            status: "QUARANTINED",
          });
        }
      } catch {
        recovered.push({
          originalPath: fullPath,
          sizeBytes: 0,
          sha256: "",
          status: "UNRECOVERABLE",
        });
      }
    }
  }

  return recovered;
}
