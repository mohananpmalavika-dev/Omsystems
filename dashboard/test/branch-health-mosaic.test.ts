import { describe, expect, it, vi } from "vitest";
import {
  BRANCH_GRID_LAYOUTS,
  BRANCH_PAGE_SIZE,
  getBranchGridMetrics,
  loadAllBranchHealth,
} from "../components/operational-health/branch-mosaic-model.js";
import type { BranchHealth } from "../lib/types/operational-health.js";

describe("centralized branch mosaic model", () => {
  it("provides the required 4x4, 6x6 and 8x8 operator layouts", () => {
    expect(BRANCH_GRID_LAYOUTS).toEqual(["4x4", "6x6", "8x8"]);
    expect(getBranchGridMetrics("4x4", 1200)).toMatchObject({ columns: 4, compact: false });
    expect(getBranchGridMetrics("6x6", 1200)).toMatchObject({ columns: 6, compact: true });
    expect(getBranchGridMetrics("8x8", 1200)).toMatchObject({ columns: 8, ultraCompact: true });
    expect(getBranchGridMetrics("8x8", 600).columns).toBe(2);
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
