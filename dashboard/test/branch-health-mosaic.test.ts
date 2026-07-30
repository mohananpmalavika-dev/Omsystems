import { describe, expect, it, vi } from "vitest";
import {
  BRANCH_GRID_LAYOUTS,
  BRANCH_PAGE_SIZE,
  MAX_BRANCH_TILES_PER_VIEW,
  getBranchGridMetrics,
  getBranchGridViewportHeight,
  loadAllBranchHealth,
  sequenceBranchHealth,
} from "../components/operational-health/branch-mosaic-model.js";
import type { BranchHealth } from "../lib/types/operational-health.js";

describe("centralized branch mosaic model", () => {
  it("provides detailed layouts plus a 20x20 status wall for 400 simultaneous tiles", () => {
    expect(BRANCH_GRID_LAYOUTS).toEqual(["4x4", "6x6", "8x8", "20x20"]);
    expect(MAX_BRANCH_TILES_PER_VIEW).toBe(400);
    expect(getBranchGridMetrics("4x4", 1200)).toMatchObject({ columns: 4, compact: false, tilesPerView: 16 });
    expect(getBranchGridMetrics("6x6", 1200)).toMatchObject({ columns: 6, compact: true, tilesPerView: 36 });
    expect(getBranchGridMetrics("8x8", 1200)).toMatchObject({ columns: 8, ultraCompact: true, tilesPerView: 64 });
    expect(getBranchGridMetrics("20x20", 1200)).toMatchObject({
      columns: 20, rowHeight: 26, gap: 3, compact: true, ultraCompact: true,
      statusOnly: true, tilesPerView: 400,
    });
    expect(getBranchGridMetrics("8x8", 600).columns).toBe(2);
    expect(getBranchGridViewportHeight("4x4")).toBe(584);
    expect(getBranchGridViewportHeight("6x6")).toBe(608);
    expect(getBranchGridViewportHeight("8x8")).toBe(616);
    expect(getBranchGridViewportHeight("20x20")).toBe(593);
  });

  it("automatically sequences offline, critical-alert and unhealthy branches first", () => {
    const healthy = branch(1);
    const alerting = { ...branch(2), criticalAlerts: 2 };
    const offline = { ...branch(3), internetStatus: "offline" as const };
    const warning = { ...branch(4), healthStatus: "warning" as const };

    expect(sequenceBranchHealth([healthy, warning, alerting, offline], "priority").map((item) => item.id))
      .toEqual([offline.id, alerting.id, warning.id, healthy.id]);
  });

  it("can group a large branch estate by region while retaining critical-first order within a region", () => {
    const branches = Array.from({ length: 400 }, (_, index) => ({
      ...branch(index),
      region: index % 2 ? "West" : "North",
      healthStatus: index === 20 ? "critical" as const : "healthy" as const,
    }));
    const sequenced = sequenceBranchHealth(branches, "region");

    expect(sequenced).toHaveLength(400);
    expect(sequenced[0]).toMatchObject({ region: "North", id: "branch-20" });
    expect(sequenced.findIndex((item) => item.region === "West")).toBe(200);
  });

  it("sequences a large branch estate efficiently before virtual scrolling", () => {
    const branches = Array.from({ length: 400 }, (_, index) => ({
      ...branch(index),
      healthStatus: index % 23 === 0 ? "critical" as const : index % 7 === 0 ? "warning" as const : "healthy" as const,
      criticalAlerts: index % 31 === 0 ? 1 : 0,
    }));
    const startedAt = performance.now();
    const sequenced = sequenceBranchHealth(branches, "priority");
    const elapsedMs = performance.now() - startedAt;

    expect(sequenced).toHaveLength(400);
    expect(sequenced[0]?.healthStatus).toBe("critical");
    expect(elapsedMs).toBeLessThan(250);
  });

  it("loads every server page instead of imposing a 500-branch UI ceiling", async () => {
    const all = Array.from({ length: 1_205 }, (_, index) => branch(index));
    const fetchPage = vi.fn(async (offset: number, limit: number) => ({
      branches: all.slice(offset, offset + limit),
      total: all.length,
      limit,
      offset,
    }));

    const loaded = await loadAllBranchHealth(fetchPage);

    expect(loaded).toHaveLength(1_205);
    expect(fetchPage.mock.calls).toEqual([
      [0, BRANCH_PAGE_SIZE],
      [500, BRANCH_PAGE_SIZE],
      [1000, BRANCH_PAGE_SIZE],
    ]);
  });
});

function branch(index: number): BranchHealth {
  return {
    id: `branch-${index}`,
    name: `Branch ${index}`,
    code: String(index),
    region: "South",
    healthStatus: "healthy",
    healthScore: 100,
    lastHealthCheck: "2026-07-28T00:00:00.000Z",
    totalCameras: 8,
    onlineCameras: 8,
    recordingCameras: 8,
    totalRecorders: 1,
    onlineRecorders: 1,
    recorderStatus: "online",
    criticalAlerts: 0,
    edgeAgentStatus: "online",
    edgeAgentHeartbeat: "2026-07-28T00:00:00.000Z",
  };
}
