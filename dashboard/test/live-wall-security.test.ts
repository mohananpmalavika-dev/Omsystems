import { describe, expect, it } from "vitest";
import { buildSecurityHeatmap, buildReplayWindow, createWallPreset } from "../lib/live-wall-security";

describe("live wall security features", () => {
  it("computes a risk heatmap from branch alerts and camera coverage", () => {
    const heatmap = buildSecurityHeatmap(
      [
        { id: "cam-1", name: "Entrance", branchName: "Kochi", branchId: "branch-1", status: "online" },
        { id: "cam-2", name: "Vault", branchName: "Kochi", branchId: "branch-1", status: "online" },
        { id: "cam-3", name: "Perimeter", branchName: "Trivandrum", branchId: "branch-2", status: "online" },
      ],
      [
        { id: "a1", cameraId: "cam-1", severity: "P1", status: "new", confidence: 0.92, createdAt: "2026-09-16T10:00:00.000Z" },
        { id: "a2", cameraId: "cam-2", severity: "P2", status: "investigating", confidence: 0.74, createdAt: "2026-09-16T10:08:00.000Z" },
      ],
      [],
    );

    expect(heatmap[0].branchId).toBe("branch-1");
    expect(heatmap[0].risk).toBeGreaterThan(0.7);
    expect(heatmap[1].risk).toBeLessThan(heatmap[0].risk);
  });

  it("creates a replay window centered on the most recent security event", () => {
    const replay = buildReplayWindow(
      [
        { id: "a1", cameraId: "cam-1", severity: "P1", status: "new", confidence: 0.95, createdAt: "2026-09-16T10:00:00.000Z" },
        { id: "a2", cameraId: "cam-1", severity: "P2", status: "investigating", confidence: 0.72, createdAt: "2026-09-16T10:12:00.000Z" },
      ],
      "cam-1",
      300,
    );

    expect(replay.cameraId).toBe("cam-1");
    expect(replay.windowSeconds).toBe(300);
    expect(replay.from).toBeLessThan(replay.to);
  });

  it("creates a saveable wall preset with a security-friendly canonical title", () => {
    const preset = createWallPreset({
      name: "branch vault response",
      branchId: "branch-1",
      cameraIds: ["cam-1", "cam-2"],
      view: "security-overview",
    });

    expect(preset.name).toContain("Branch");
    expect(preset.cameraIds).toEqual(["cam-1", "cam-2"]);
  });
});
