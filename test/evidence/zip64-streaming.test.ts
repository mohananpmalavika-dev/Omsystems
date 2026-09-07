import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  packageEvidenceToZip64,
  isEvidenceFileAllowed,
  EVIDENCE_PACKAGE_ALLOW_LIST,
} from "../../src/recording/zip-archive.js";

describe("Streaming ZIP64 Evidence Archiving & Allow-List Enforcement (P0-01, P0-02, P0-03)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `kryptovision-zip64-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("packages registered evidence files and strictly excludes temporary worker files (P0-03)", async () => {
    // 1. Create valid evidence files
    mkdirSync(join(tempDir, "footage"), { recursive: true });
    mkdirSync(join(tempDir, "originals", "CAM-01"), { recursive: true });

    writeFileSync(join(tempDir, "manifest.json"), JSON.stringify({ packageId: "PKG-01" }));
    writeFileSync(join(tempDir, "manifest.sig"), "DUMMY_SIGNATURE_BYTES_BASE64");
    writeFileSync(join(tempDir, "metadata.json"), JSON.stringify({ test: true }));
    writeFileSync(join(tempDir, "audit.json"), JSON.stringify({ audited: true }));
    writeFileSync(join(tempDir, "recording-gaps.json"), JSON.stringify([]));
    writeFileSync(join(tempDir, "footage", "clip.mp4"), Buffer.alloc(1024 * 64, 0xaa));
    writeFileSync(join(tempDir, "originals", "CAM-01", "seg1.mp4"), Buffer.alloc(1024 * 64, 0xbb));

    // 2. Create worker temporary and internal files that MUST NOT leak (P0-03, P0-04)
    writeFileSync(join(tempDir, "concat_CAM-01.txt"), "file 'D:/recordings/internal/seg1.mp4'\n");
    writeFileSync(join(tempDir, "ffmpeg_debug.tmp"), "debug logs with /mnt/storage/internal/path");
    writeFileSync(join(tempDir, "worker-state.json"), JSON.stringify({ internalQueue: "job-123" }));

    // 3. Package directory using streaming ZIP64
    const zipPath = join(tempDir, "evidence-output.zip");
    const result = await packageEvidenceToZip64(tempDir, zipPath);

    expect(existsSync(zipPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

    // Verify exactly 7 allowed evidence items were included (manifest, sig, metadata, audit, gaps, clip, seg1)
    expect(result.entryCount).toBe(7);

    // Read ZIP bytes to verify that forbidden files and internal server paths are absent
    const zipBytes = readFileSync(zipPath);
    const zipString = zipBytes.toString("latin1");

    expect(zipString).not.toContain("concat_CAM-01.txt");
    expect(zipString).not.toContain("ffmpeg_debug.tmp");
    expect(zipString).not.toContain("worker-state.json");
    expect(zipString).not.toContain("D:/recordings/internal");
    expect(zipString).not.toContain("/mnt/storage/internal");
  });

  it("supports explicit allow-list filtering with isEvidenceFileAllowed", () => {
    expect(isEvidenceFileAllowed("manifest.json")).toBe(true);
    expect(isEvidenceFileAllowed("manifest.sig")).toBe(true);
    expect(isEvidenceFileAllowed("metadata.json")).toBe(true);
    expect(isEvidenceFileAllowed("audit.json")).toBe(true);
    expect(isEvidenceFileAllowed("recording-gaps.json")).toBe(true);
    expect(isEvidenceFileAllowed("footage/viewing.mp4")).toBe(true);
    expect(isEvidenceFileAllowed("originals/cam1/seg1.mp4")).toBe(true);
    expect(isEvidenceFileAllowed("snapshots/alert1.jpg")).toBe(true);

    // Strictly forbidden
    expect(isEvidenceFileAllowed("concat_cam1.txt")).toBe(false);
    expect(isEvidenceFileAllowed("concat_cam_front.txt")).toBe(false);
    expect(isEvidenceFileAllowed("temp.tmp")).toBe(false);
    expect(isEvidenceFileAllowed("debug.log")).toBe(false);
    expect(isEvidenceFileAllowed("worker-state.json")).toBe(false);
    expect(isEvidenceFileAllowed("unauthorized/secret.key")).toBe(false);
  });

  it("produces valid ZIP64 archive structure with bounded memory streaming (P0-01, P0-02)", async () => {
    mkdirSync(join(tempDir, "footage"), { recursive: true });

    // Create a 5 MB mock video chunk to test streaming pipeline
    const mediaChunk = Buffer.alloc(5 * 1024 * 1024, 0x42);
    writeFileSync(join(tempDir, "footage", "large_chunk.mp4"), mediaChunk);
    writeFileSync(join(tempDir, "manifest.json"), JSON.stringify({ version: "2.0" }));

    const zipPath = join(tempDir, "zip64-large.zip");

    const initialMem = process.memoryUsage().heapUsed;
    const result = await packageEvidenceToZip64(tempDir, zipPath);
    const postMem = process.memoryUsage().heapUsed;

    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.entryCount).toBe(2);

    // Heap memory should remain bounded (not grow by file size)
    const memGrowthMb = (postMem - initialMem) / (1024 * 1024);
    expect(memGrowthMb).toBeLessThan(50);

    // ZIP64 signature check (ZIP64 end of central directory locator: 0x07064b50)
    const zipBytes = readFileSync(zipPath);
    const hasZip64Locator = zipBytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    expect(hasZip64Locator).toBe(true);
  });
});
