import { describe, expect, it } from "vitest";
import { OccupancyLedger } from "../analytics-engine/src/human-analytics/counting/occupancy-ledger.js";
import { HeatmapAccumulator } from "../analytics-engine/src/heatmaps/heatmap-accumulator.js";
import { DEFAULT_HEATMAP_CONFIG } from "../analytics-engine/src/heatmaps/heatmap-types.js";

describe("production counting and heatmap semantics", () => {
  it("builds occupancy history by applying each ledger event once", () => {
    const ledger = new OccupancyLedger("site-1");
    const start = new Date("2026-09-01T10:00:00.000Z");
    ledger.addManualCorrection("lobby", 1, new Date("2026-09-01T10:01:00.000Z"), "initial entry");
    ledger.addManualCorrection("lobby", 1, new Date("2026-09-01T10:06:00.000Z"), "second entry");
    ledger.addManualCorrection("lobby", -1, new Date("2026-09-01T10:11:00.000Z"), "exit");

    expect(ledger.getOccupancyHistory("lobby", start, new Date("2026-09-01T10:15:00.000Z"), 5)
      .map((point) => point.occupancy)).toEqual([0, 1, 2, 1]);
  });

  it("places normalized and pixel-coordinate tracks in their correct heatmap cells", () => {
    const accumulator = new HeatmapAccumulator("tenant-1", "camera-1", {
      ...DEFAULT_HEATMAP_CONFIG,
      width: 10,
      height: 10,
      kernelRadius: 0,
      sampleIntervalMs: 0,
    });
    const at = Date.parse("2026-09-01T10:00:00.000Z");
    accumulator.ingest({
      tenantId: "tenant-1", cameraId: "camera-1", trackId: "normalized", objectType: "person", timestamp: at,
      bbox: { x: 0.75, y: 0.75, width: 0.1, height: 0.1 }, anchor: { x: 0.8, y: 0.85 }, confidence: 0.9,
    });
    accumulator.ingest({
      tenantId: "tenant-1", cameraId: "camera-1", trackId: "pixels", objectType: "person", timestamp: at + 1,
      frameWidth: 1000, frameHeight: 1000,
      bbox: { x: 700, y: 700, width: 100, height: 100 }, anchor: { x: 800, y: 850 }, confidence: 0.9,
    });

    const bucket = accumulator.getBucket(at);
    expect(bucket?.grid[8 * 10 + 8]).toBe(2);
    expect(bucket?.grid[0]).toBe(0);
  });
});
