import { describe, expect, it } from "vitest";
import type { Camera } from "../lib/types";
import { buildLiveWallBranches, liveWallHierarchyOptions, parseLiveWallHierarchy, type LiveWallHierarchyNode } from "../lib/live-wall-hierarchy";

const nodes: LiveWallHierarchyNode[] = [
  ...["north", "south", "east", "west"].map(id => ({ id, name: `${id} zone`, type: "zone", parentId: null })),
  { id: "region-n", name: "Shared region name", type: "region", parentId: "north" },
  { id: "region-s", name: "Shared region name", type: "region", parentId: "south" },
  { id: "area", name: "Area", type: "area", parentId: "region-n" },
  { id: "branch-n", name: "South-facing branch", type: "branch", parentId: "area" },
  { id: "branch-s", name: "South branch", type: "branch", parentId: "south" },
  { id: "branch-e", name: "Empty branch", type: "branch", parentId: "east" },
];
const cameras = [
  { id: "a", name: "West entrance", branchId: "branch-n", status: "online" },
  { id: "b", name: "Camera", branchId: "branch-s", status: "offline" },
  { id: "c", name: "Camera", branchId: "orphan", branchName: "Unassigned branch", status: "degraded" },
] as Camera[];

describe("configured live wall hierarchy", () => {
  it("shows all four configured zones, including zones without camera feeds", () => {
    expect(liveWallHierarchyOptions(nodes, "zone").map(option => option.value).sort()).toEqual(["east", "north", "south", "west"]);
    expect(buildLiveWallBranches(cameras, nodes).find(branch => branch.branchId === "branch-e")?.cameraCount).toBe(0);
  });
  it("follows actual ancestors regardless of names and supports skipped levels", () => {
    const branches = buildLiveWallBranches(cameras, nodes);
    expect(branches.find(branch => branch.branchId === "branch-n")).toMatchObject({ zone: "north", region: "region-n", area: "area", cameraCount: 1, onlineCount: 1 });
    expect(branches.find(branch => branch.branchId === "branch-s")).toMatchObject({ zone: "south", region: "", area: "", onlineCount: 0 });
    expect(branches.find(branch => branch.branchId === "orphan")).toMatchObject({ zone: "", region: "", area: "", onlineCount: 1 });
  });
  it("cascades options across multiple parents using IDs even with duplicate names", () => {
    expect(liveWallHierarchyOptions(nodes, "region", ["north", "south"])).toHaveLength(2);
    expect(liveWallHierarchyOptions(nodes, "region", ["south"]).map(option => option.value)).toEqual(["region-s"]);
    expect(liveWallHierarchyOptions(nodes, "area", ["north", "south"], ["region-s"])).toEqual([]);
    expect(liveWallHierarchyOptions(nodes, "area", ["north", "south"], ["region-n", "region-s"])).toHaveLength(1);
  });
  it("keeps camera branches visible without inventing geography when hierarchy is unavailable", () => {
    expect(buildLiveWallBranches(cameras, []).map(branch => branch.branchId).sort()).toEqual(["branch-n", "branch-s", "orphan"]);
    expect(buildLiveWallBranches(cameras, []).every(branch => !branch.zone)).toBe(true);
    expect(() => parseLiveWallHierarchy({ error: "failed" })).toThrow();
    expect(parseLiveWallHierarchy({ data: nodes })).toEqual(nodes);
  });
  it("terminates safely on a malformed parent cycle", () => {
    expect(buildLiveWallBranches([], [{ id: "b", type: "branch", name: "B", parentId: "z" }, { id: "z", type: "zone", name: "Z", parentId: "b" }])[0].zone).toBe("z");
  });
});
