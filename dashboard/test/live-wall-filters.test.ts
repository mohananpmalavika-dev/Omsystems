import { describe, expect, it } from "vitest";
import type { Camera } from "../lib/types.js";
import { selectLiveWallCameras, type LiveWallScope } from "../lib/live-wall-filters.js";

const scope: LiveWallScope = { zone: "ALL", region: "ALL", area: "ALL", branchId: "ALL", query: "", status: "ALL", hideUnavailable: true };
const branches = [
  { branchId: "north", zone: "North", region: "Delhi", area: "Central" },
  { branchId: "south", zone: "South", region: "Kerala", area: "Kochi" },
];
const cameras = [
  { id: "a", name: "South-facing entrance", branchId: "north", status: "online", channel: 0 },
  { id: "b", name: "Lobby", branchId: "north", status: "offline" },
  { id: "c", name: "Loading bay", branchId: "south", status: "online" },
  { id: "d", name: "Unknown channel", branchId: "north", status: "unknown" },
] as Camera[];
const select = (overrides: Partial<LiveWallScope> = {}) => selectLiveWallCameras(cameras, branches, ["b", "missing"], { ...scope, ...overrides });

describe("Live Wall filtering", () => {
  it("keeps all cameras in the selected branch hierarchy regardless of their names", () => {
    const result = select({ zone: "North", hideUnavailable: false });
    expect(result.cameras.map((camera) => camera.id)).toEqual(["a", "b", "d"]);
    expect(result.counts).toEqual({ total: 3, online: 1, offline: 1, alerts: 1 });
    expect(result.branchCount).toBe(1);
  });
  it("shows explicitly requested offline feeds even while unavailable channels are hidden", () => {
    expect(select({ status: "OFFLINE" }).cameras.map((camera) => camera.id)).toEqual(["b"]);
  });
  it("retains offline alert cameras and counts only alerts on accessible cameras", () => {
    const result = select({ status: "ALERT" });
    expect(result.cameras.map((camera) => camera.id)).toEqual(["b"]);
    expect(result.counts.alerts).toBe(1);
  });
  it("does not count unknown cameras as online or show them when unavailable channels are hidden", () => {
    expect(select().cameras.map((camera) => camera.id)).toEqual(["a", "c"]);
    expect(select({ status: "ONLINE", hideUnavailable: false }).cameras.map((camera) => camera.id)).toEqual(["a", "c"]);
    expect(select().counts.online).toBe(2);
  });
  it("limits status counts to the selected branch and search", () => {
    expect(select({ branchId: "north", query: "lobby" }).counts).toEqual({ total: 1, online: 0, offline: 1, alerts: 1 });
    expect(select({ branchId: "south" }).branchCount).toBe(1);
  });
  it("filters strictly to the requested branchId (case-insensitive) on live wall", () => {
    const resultSouth = select({ branchId: "SOUTH" });
    expect(resultSouth.cameras.map((c) => c.id)).toEqual(["c"]);
    expect(resultSouth.counts.total).toBe(1);

    const resultNorth = select({ branchId: "North", hideUnavailable: false });
    expect(resultNorth.cameras.map((c) => c.id)).toEqual(["a", "b", "d"]);
    expect(resultNorth.counts.total).toBe(3);
  });
  it("supports zero-indexed channel searches and reports no branches for empty results", () => {
    expect(select({ query: "0" }).cameras.map((camera) => camera.id)).toEqual(["a"]);
    expect(select({ query: "missing" }).branchCount).toBe(0);
  });
});
