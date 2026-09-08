import { describe, expect, it, vi } from "vitest";
import { AIVideoSearchService } from "../src/services/ai-video-search.js";
import { VideoSearchIntegrationPipeline } from "../src/services/video-search-integration.js";

function createPool(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as any;
}

describe("AI video search service", () => {
  it("scores complete requested attributes as an exact match", () => {
    const service = new AIVideoSearchService(createPool());

    const score = (service as any).calculateAttributeSimilarity(
      { upperClothingColor: "red", hasBag: true },
      { upperClothingColor: "RED", hasBag: true },
    );

    expect(score).toBe(1);
  });

  it("searches for recordings that overlap the requested time window", async () => {
    const pool = createPool();
    const service = new AIVideoSearchService(pool);

    await service.searchVideos("11111111-1111-4111-8111-111111111111", {
      from: "2026-01-02T00:00:00.000Z",
      to: "2026-01-03T00:00:00.000Z",
    });

    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain("vm.end_time >= $2::timestamptz");
    expect(sql).toContain("vm.start_time <= $3::timestamptz");
  });

  it("rejects malformed visual embeddings before querying the database", async () => {
    const pool = createPool();
    const service = new AIVideoSearchService(pool);

    await expect(service.searchBySimilarity("tenant", [1, Number.NaN])).rejects.toThrow(
      "invalid_reference_embedding",
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("indexes structured detections when the optional embedding service is unavailable", async () => {
    const pipeline = new VideoSearchIntegrationPipeline(createPool());
    const indexVideoMetadata = vi.fn().mockResolvedValue({});
    (pipeline as any).aiVideoSearch = {
      generateEmbedding: vi.fn().mockRejectedValue(new Error("embedding service unavailable")),
      generateAttributeEmbedding: vi.fn().mockRejectedValue(new Error("fallback unavailable")),
      indexVideoMetadata,
    };

    const result = await pipeline.indexVideoSegment({
      tenantId: "tenant",
      cameraId: "camera",
      segmentId: "segment",
      videoPath: "/recordings/segment.mp4",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:01:00.000Z",
      generateEmbeddings: true,
      objects: [{
        objectId: "object",
        objectType: "person",
        firstSeen: "2026-01-01T00:00:01.000Z",
        lastSeen: "2026-01-01T00:00:02.000Z",
        durationSeconds: 1,
        boundingBoxes: [{ timestamp: "2026-01-01T00:00:01.000Z", x: 0, y: 0, width: 1, height: 1, confidence: 0.9 }],
        attributes: { upperClothingColor: "red" },
        confidence: 0.9,
      }],
    });

    expect(result).toMatchObject({ success: true, objectsIndexed: 1, embeddingsGenerated: 0 });
    expect(indexVideoMetadata).toHaveBeenCalledOnce();
  });
});
