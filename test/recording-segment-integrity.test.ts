import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordingRepository } from "../src/database/recording-repository.js";

describe("recording segment integrity verification", () => {
  it("hashes the stored bytes and detects tampering instead of trusting the stored checksum", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-integrity-"));
    const path = join(directory, "segment.mp4");
    const original = Buffer.from("forensic recording bytes");
    const expectedHash = createHash("sha256").update(original).digest("hex");
    await writeFile(path, original);

    const repository = new RecordingRepository({
      query: async () => ({ rows: [{ checksum_sha256: expectedHash, storage_path: path }] }),
    } as any);

    await expect(repository.verifyRecordingSegment("segment-1")).resolves.toEqual({ status: "verified", hash: expectedHash });

    await writeFile(path, Buffer.from("tampered recording bytes"));
    await expect(repository.verifyRecordingSegment("segment-1")).resolves.toMatchObject({ status: "mismatch" });

    await rm(directory, { recursive: true, force: true });
  });

  it("does not claim verification when the recording bytes are unavailable", async () => {
    const repository = new RecordingRepository({
      query: async () => ({ rows: [{ checksum_sha256: "a".repeat(64), storage_path: "C:/missing/segment.mp4" }] }),
    } as any);

    await expect(repository.verifyRecordingSegment("segment-1")).resolves.toEqual({ status: "missing" });
  });
});
