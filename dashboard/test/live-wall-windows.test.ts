import { describe, expect, it } from "vitest";
import { liveWallWindowUrl, readLiveWallWindowScope, type LiveWallWindowScope } from "../lib/live-wall-windows";

const scope: LiveWallWindowScope = {
  zones: ["north", "south"], regions: ["region-1", "region-2"], areas: ["area-1", "area-2"], branches: ["branch-1", "branch-2"],
  query: "Entrance & Gate + 1", status: "ALERT", hideUnavailable: false, showAiOverlays: false, prioritizeAiAlerts: true,
};

describe("independent live wall windows", () => {
  it("preserves all selected locations and display filters in one window URL", () => {
    const url = new URL(liveWallWindowUrl(scope), "https://example.test");
    expect(url.pathname).toBe("/control-room");
    expect(url.searchParams.get("wallWindow")).toBe("true");
    expect(readLiveWallWindowScope(url.searchParams)).toEqual(scope);
  });
  it("keeps each opening as a separate snapshot of the selection", () => {
    const first = liveWallWindowUrl(scope);
    const second = liveWallWindowUrl({ ...scope, branches: ["branch-3"], zones: [] });
    expect(readLiveWallWindowScope(new URL(first, "https://example.test").searchParams).branches).toEqual(["branch-1", "branch-2"]);
    expect(readLiveWallWindowScope(new URL(second, "https://example.test").searchParams).branches).toEqual(["branch-3"]);
    expect(scope.branches).toEqual(["branch-1", "branch-2"]);
  });
  it("supports all locations, existing branch links, and default display settings", () => {
    expect(readLiveWallWindowScope(null)).toEqual({ zones: [], regions: [], areas: [], branches: [], query: "", status: "ALL", hideUnavailable: true, showAiOverlays: true, prioritizeAiAlerts: false });
    expect(readLiveWallWindowScope(new URLSearchParams("branch=Legacy+Branch")).branches).toEqual(["Legacy Branch"]);
    expect(readLiveWallWindowScope(new URLSearchParams("branchId=id&branch=Legacy")).branches).toEqual(["id"]);
    expect(readLiveWallWindowScope(new URLSearchParams("branchId=ALL&status=invalid")).status).toBe("ALL");
  });
  it("deduplicates IDs and safely encodes reserved characters", () => {
    const url = new URL(liveWallWindowUrl({ ...scope, branches: ["id&branchId=foreign", "id&branchId=foreign"] }), "https://example.test");
    expect(url.searchParams.getAll("branchId")).toEqual(["id&branchId=foreign"]);
    expect(readLiveWallWindowScope(new URLSearchParams("zoneId=north&zoneId=north&zoneId=&zoneId=ALL")).zones).toEqual(["north"]);
  });
});
