import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceExportService } from "../../src/media/services/evidence-export.service.js";

const audit = {
  logAccess: async () => undefined,
} as any;

let temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories = [];
});

describe("on-demand evidence export integrity", () => {
  it("rejects an export when no real recording file is available", async () => {
    const service = new EvidenceExportService(audit);

    await expect(service.createExport({
      tenantId: "tenant-1",
      branchId: "branch-1",
      cameraId: "camera-1",
      from: new Date("2026-09-10T10:00:00Z"),
      to: new Date("2026-09-10T10:05:00Z"),
      userId: "user-1",
      reason: "Incident investigation",
      sourceFilePath: "C:/does-not-exist/recording.mp4",
    })).rejects.toThrow("recording_not_found");
  });

  it("hashes the real media bytes and only then creates the export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "evidence-export-"));
    temporaryDirectories.push(directory);
    const media = Buffer.from("REAL_RECORDING_BYTES");
    const mediaPath = join(directory, "recording.mp4");
    await writeFile(mediaPath, media);
    const service = new EvidenceExportService(audit);

    const result = await service.createExport({
      tenantId: "tenant-1",
      branchId: "branch-1",
      cameraId: "camera-1",
      from: new Date("2026-09-10T10:00:00Z"),
      to: new Date("2026-09-10T10:05:00Z"),
      userId: "user-1",
      reason: "Incident investigation",
      sourceFilePath: mediaPath,
    });

    expect(result.sha256).toBe(createHash("sha256").update(media).digest("hex"));
    expect(result.sizeBytes).toBe(media.length);
  });
});
