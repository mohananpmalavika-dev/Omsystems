import { describe, expect, it, vi } from "vitest";
import { loadBatchedRetentionInputs } from "../src/operational-health/retention-batch.js";
import { MemoryStore } from "../src/store.js";

describe("fleet retention batch loading", () => {
  it("uses two bounded store calls rather than one segment query per camera", async () => {
    const store = new MemoryStore();
    const now = Date.parse("2026-07-30T12:00:00.000Z");
    await store.createRecordingSegment({
      cameraId: "scale-cam-1", jobId: "job-1",
      startedAt: new Date(now - 60_000).toISOString(), endedAt: new Date(now).toISOString(),
      storagePath: "scale/one", sizeBytes: 1, storageNodeExternalId: "node",
      storageTier: "hot", status: "ready",
    });
    const requirements = Array.from({ length: 2_000 }, (_, index) => ({
      cameraId: `scale-cam-${index + 1}`,
      policyRetentionDays: index === 0 ? 180 : 90,
      maxRecordingGapSeconds: 120,
    }));
    const jobs = vi.spyOn(store, "listRecordingJobs");
    const batch = vi.spyOn(store, "listRecordingSegmentsForCameras");
    const legacy = vi.spyOn(store, "listRecordingSegments");

    const inputs = await loadBatchedRetentionInputs(store, requirements, now);

    expect(inputs.size).toBe(2_000);
    expect(inputs.get("scale-cam-1")?.segments).toHaveLength(1);
    expect(jobs).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(2_000);
    expect(Date.parse(batch.mock.calls[0]?.[1] ?? "")).toBe(now - 180 * 86_400_000 - 120_000);
    expect(legacy).not.toHaveBeenCalled();
  });

  it("does not query storage for an empty authorized fleet", async () => {
    const store = new MemoryStore();
    const jobs = vi.spyOn(store, "listRecordingJobs");
    const segments = vi.spyOn(store, "listRecordingSegmentsForCameras");
    expect(await loadBatchedRetentionInputs(store, [])).toEqual(new Map());
    expect(jobs).not.toHaveBeenCalled();
    expect(segments).not.toHaveBeenCalled();
  });
});
