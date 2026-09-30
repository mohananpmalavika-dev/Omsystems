import { describe, expect, it } from "vitest";
import { loadCameraInventory, loadCameraBatches } from "../lib/fleet-loading";
import { fleetCameraPage, fleetTileOptions, operationalStageAlerts } from "../components/live-stage-model";
import { RetentionSummary } from "../components/branch-command-center/retention-summary";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Camera, AnalyticsAlert } from "../lib/types";
import type { BranchOperationalState } from "../components/branch-command-center/types";

describe("full fleet requirements", () => {
  it("accepts the empty final page when an uncounted inventory is exactly 1000 cameras", async () => {
    const cameras = Array.from({ length: 1000 }, (_, index) => ({ id: `camera-${index}` }));
    expect(await loadCameraInventory(async (offset, limit) => ({ cameras: cameras.slice(offset, offset + limit) }))).toEqual(cameras);
  });
  it("loads inventory beyond the first 500 cameras and rejects incomplete pages", async () => {
    const cameras = Array.from({ length: 1201 }, (_, index) => ({ id: `camera-${index}` }));
    expect(await loadCameraInventory(async (offset, limit) => ({ total: cameras.length, cameras: cameras.slice(offset, offset + limit) }))).toEqual(cameras);
    await expect(loadCameraInventory(async offset => ({ total: 1201, cameras: offset ? [] : cameras.slice(0, 500) }))).rejects.toThrow("incomplete");
  });
  it("covers all AI cameras in bounded batches and propagates batch failures", async () => {
    const ids = Array.from({ length: 1201 }, (_, index) => `camera-${index}`);
    let active = 0, maximum = 0;
    const result = await loadCameraBatches(ids, async batch => { active++; maximum = Math.max(maximum, active); expect(batch.length).toBeLessThanOrEqual(144); await Promise.resolve(); active--; return batch; });
    expect(result.flat()).toEqual(ids);
    expect(maximum).toBeLessThanOrEqual(3);
    await expect(loadCameraBatches(ids, async () => { throw new Error("unavailable"); })).rejects.toThrow("unavailable");
  });
  it("makes every fleet and branch camera reachable through pages", () => {
    const cameras = Array.from({ length: 600 }, (_, index) => ({ id: `camera-${index}`, branchId: index % 2 ? "b" : "a" })) as Camera[];
    const pages = Array.from({ length: Math.ceil(cameras.length / 16) }, (_, page) => fleetCameraPage(cameras, "all", 16, page).cameras).flat();
    expect(pages).toEqual(cameras);
    const branch = fleetCameraPage(cameras, "b", 144, 2);
    expect(branch.total).toBe(300);
    expect(branch.cameras).toHaveLength(12);
    expect(branch.cameras.every(camera => camera.branchId === "b")).toBe(true);
  });
  it("offers every tile count up to the cameras in scope without padding the last page", () => {
    expect(fleetTileOptions(1)).toEqual([1]);
    expect(fleetTileOptions(2)).toEqual([1, 2]);
    expect(fleetTileOptions(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const cameras = Array.from({ length: 17 }, (_, index) => ({ id: `camera-${index}`, branchId: "a" })) as Camera[];
    expect(fleetTileOptions(cameras.length)).toHaveLength(17);
    expect(fleetCameraPage(cameras, "a", 17, 0).cameras).toHaveLength(17);
    expect(fleetCameraPage(cameras, "a", 8, 2).cameras).toHaveLength(1);
    expect(fleetTileOptions(200)).toHaveLength(144);
  });
  it("keeps P4/P5 out of the attention and event presentation", () => {
    const alerts = ["P1", "P2", "P3", "P4", "P5"].map(severity => ({ severity, cameraId: "camera-1" })) as AnalyticsAlert[];
    expect(operationalStageAlerts(alerts, new Set(["camera-1"])).map(alert => alert.severity)).toEqual(["P1", "P2", "P3"]);
  });
  it("never labels missing retention evidence compliant or invents archive dates", () => {
    const state = { retention: { status: "UNKNOWN", requiredDays: 90 } } as BranchOperationalState;
    const html = renderToStaticMarkup(createElement(RetentionSummary, { state }));
    expect(html).toContain("EVIDENCE UNAVAILABLE");
    expect(html).not.toContain("COMPLIANT");
    expect(html).not.toContain("61");
    expect(html).toContain("Not reported");
  });
});
