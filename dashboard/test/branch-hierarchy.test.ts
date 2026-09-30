import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandNetworkCanvas } from "../components/operations/command-network-canvas";
import { buildBranchHierarchy, type NetworkBranch, type OrganizationTreeNode } from "../lib/branch-hierarchy";

const branches: NetworkBranch[] = [
  { branchId: "full", name: "Full hierarchy", cameras: { total: 8, working: 7 } },
  { branchId: "direct", name: "Direct under zone", cameras: { total: 2, working: 2 } },
  { branchId: "under-region", name: "Direct under region", cameras: { total: 1, working: 0 } },
  { branchId: "orphan", name: "Unassigned branch" },
];

const tree: OrganizationTreeNode[] = [{
  id: "company", name: "Company", type: "company", children: [{
    id: "zone", name: "South zone", type: "zone", children: [
      { id: "region", name: "Kerala region", type: "region", children: [
        { id: "area", name: "Kochi area", type: "area", children: [{ id: "full", name: "Full hierarchy", type: "branch" }] },
        { id: "under-region", name: "Direct under region", type: "branch" },
      ] },
      { id: "direct", name: "Direct under zone", type: "branch" },
    ],
  }],
}];

describe("branch hierarchy", () => {
  it("follows configured levels and skips missing levels", () => {
    const roots = buildBranchHierarchy(branches, tree);
    const zone = roots.find((node) => node.id === "zone")!;
    const region = zone.children.find((node) => node.id === "region")!;
    const area = region.children.find((node) => node.id === "area")!;

    expect(zone.branchCount).toBe(3);
    expect(zone.cameraCount).toBe(11);
    expect(zone.workingCount).toBe(9);
    expect(zone.children.some((node) => node.id === "direct" && node.type === "branch")).toBe(true);
    expect(region.children.some((node) => node.id === "under-region" && node.type === "branch")).toBe(true);
    expect(area.children.map((node) => node.id)).toEqual(["full"]);
    expect(roots.some((node) => node.id === "orphan" && node.type === "branch")).toBe(true);
  });

  it("shows every accessible branch when organization data is unavailable", () => {
    expect(buildBranchHierarchy(branches, []).map((node) => node.id).sort())
      .toEqual(branches.map((branch) => branch.branchId).sort());
  });

  it("uses the legacy region name when no organization path is available", () => {
    const roots = buildBranchHierarchy([{ branchId: "a", region: "Kerala", name: "A" }, { branchId: "b", region: "Kerala", name: "B" }], []);
    expect(roots).toHaveLength(1);
    expect(roots[0].type).toBe("region");
    expect(roots[0].children.map((node) => node.id)).toEqual(["a", "b"]);
  });

  it("does not show an empty organization node or an inaccessible branch", () => {
    const roots = buildBranchHierarchy(branches.slice(0, 1), tree);
    expect(roots.map((node) => node.id)).toEqual(["zone"]);
    expect(roots[0].children[0].children[0].children.map((node) => node.id)).toEqual(["full"]);
  });

  it("shows all branches and links each one to its own workspace", () => {
    const manyBranches = Array.from({ length: 8 }, (_, index) => ({ branchId: `branch-${index + 1}`, name: `Branch ${index + 1}` }));
    const markup = renderToStaticMarkup(createElement(CommandNetworkCanvas, { branches: manyBranches, organizationTree: [], confirmed: true }));
    expect(markup.match(/class="atlas-hierarchy-card"/g)).toHaveLength(8);
    expect(markup).toContain('href="/operations/branches/branch-8"');
  });
});
