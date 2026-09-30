export type NetworkBranch = {
  branchId: string;
  name?: string;
  branchCode?: string;
  region?: string;
  operationalState?: string;
  cameras?: { total?: number; working?: number; healthy?: number };
  risk?: { level?: string };
};

export type OrganizationTreeNode = {
  id: string;
  name: string;
  type: string;
  children?: OrganizationTreeNode[];
};

export type BranchHierarchyNode = {
  id: string;
  name: string;
  type: "zone" | "region" | "area" | "branch";
  branch?: NetworkBranch;
  children: BranchHierarchyNode[];
  branchCount: number;
  cameraCount: number;
  workingCount: number;
  atRiskCount: number;
};

const hierarchyTypes = new Set(["zone", "region", "area"]);
const typeOrder = { zone: 0, region: 1, area: 2, branch: 3 };

function sortNodes(nodes: BranchHierarchyNode[]): BranchHierarchyNode[] {
  return nodes.sort((left, right) => typeOrder[left.type] - typeOrder[right.type] || left.name.localeCompare(right.name));
}

function branchNode(branch: NetworkBranch): BranchHierarchyNode {
  return {
    id: branch.branchId,
    name: branch.name || branch.branchCode || "Unnamed branch",
    type: "branch",
    branch,
    children: [],
    branchCount: 1,
    cameraCount: Math.max(0, Number(branch.cameras?.total ?? 0)),
    workingCount: Math.max(0, Number(branch.cameras?.working ?? branch.cameras?.healthy ?? 0)),
    atRiskCount: ["HIGH", "MEDIUM"].includes(branch.risk?.level ?? "") ? 1 : 0,
  };
}

export function buildBranchHierarchy(branches: NetworkBranch[], organizationTree: OrganizationTreeNode[]): BranchHierarchyNode[] {
  const byId = new Map(branches.map((branch) => [String(branch.branchId), branch]));
  const placed = new Set<string>();

  const visit = (node: OrganizationTreeNode): BranchHierarchyNode[] => {
    if (node.type === "branch") {
      const branch = byId.get(String(node.id));
      if (!branch || placed.has(branch.branchId)) return [];
      placed.add(branch.branchId);
      return [branchNode(branch)];
    }

    const children = sortNodes((node.children ?? []).flatMap(visit));
    if (!hierarchyTypes.has(node.type)) return children;
    if (!children.length) return [];
    return [{
      id: node.id,
      name: node.name,
      type: node.type as "zone" | "region" | "area",
      children,
      branchCount: children.reduce((sum, child) => sum + child.branchCount, 0),
      cameraCount: children.reduce((sum, child) => sum + child.cameraCount, 0),
      workingCount: children.reduce((sum, child) => sum + child.workingCount, 0),
      atRiskCount: children.reduce((sum, child) => sum + child.atRiskCount, 0),
    }];
  };

  const tree = organizationTree.flatMap(visit);
  const fallbackRegions = new Map<string, BranchHierarchyNode[]>();
  for (const branch of branches) {
    if (placed.has(branch.branchId)) continue;
    const node = branchNode(branch);
    const region = branch.region?.trim();
    if (region && region.toLowerCase() !== "unassigned") {
      fallbackRegions.set(region, [...(fallbackRegions.get(region) ?? []), node]);
    } else {
      tree.push(node);
    }
  }
  for (const [region, children] of fallbackRegions) {
    tree.push({
      id: `fallback-region:${region}`,
      name: region,
      type: "region",
      children: sortNodes(children),
      branchCount: children.length,
      cameraCount: children.reduce((sum, child) => sum + child.cameraCount, 0),
      workingCount: children.reduce((sum, child) => sum + child.workingCount, 0),
      atRiskCount: children.reduce((sum, child) => sum + child.atRiskCount, 0),
    });
  }
  return sortNodes(tree);
}
