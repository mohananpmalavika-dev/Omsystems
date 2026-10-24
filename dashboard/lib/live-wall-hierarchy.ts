import type { Camera } from "./types";
import { isLiveWallCameraOnline, matchesLiveWallSelection, type LiveWallBranch } from "./live-wall-filters";

export interface LiveWallHierarchyNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface HierarchyBranchInfo extends LiveWallBranch {
  branchName: string;
  zoneName: string;
  regionName: string;
  areaName: string;
  cameraCount: number;
  onlineCount: number;
}

export function parseLiveWallHierarchy(body: unknown): LiveWallHierarchyNode[] {
  const data = Array.isArray(body) ? body : body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) throw new Error("Organization hierarchy response is invalid");
  return data.filter((node): node is LiveWallHierarchyNode => Boolean(node && typeof node.id === "string" && typeof node.name === "string" && typeof node.type === "string"))
    .map(node => ({ id: node.id, name: node.name, type: node.type, parentId: node.parentId ?? null }));
}

function ancestors(node: LiveWallHierarchyNode, byId: Map<string, LiveWallHierarchyNode>) {
  const path: LiveWallHierarchyNode[] = [];
  const seen = new Set([node.id]);
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    path.push(parent);
    seen.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return path;
}

export function filterHierarchyByOrganization(
  nodes: LiveWallHierarchyNode[],
  organizationId?: string | null,
): LiveWallHierarchyNode[] {
  if (!organizationId) return nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (!byId.has(organizationId)) return nodes;

  return nodes.filter(node => {
    if (node.id === organizationId) return true;
    const path = ancestors(node, byId);
    return path.some(ancestor => ancestor.id === organizationId);
  });
}

export function buildLiveWallBranches(
  cameras: Camera[],
  nodes: LiveWallHierarchyNode[],
  organizationId?: string | null,
): HierarchyBranchInfo[] {
  const scopedNodes = filterHierarchyByOrganization(nodes, organizationId);
  const byId = new Map(scopedNodes.map(node => [node.id, node]));
  const scopedBranchIds = new Set(scopedNodes.filter(node => node.type === "branch").map(node => node.id));
  const branches = new Map<string, HierarchyBranchInfo>();
  const addBranch = (id: string, name: string) => {
    const node = byId.get(id);
    const path = node ? ancestors(node, byId) : [];
    const zone = path.find(parent => parent.type === "zone");
    const region = path.find(parent => parent.type === "region");
    const area = path.find(parent => parent.type === "area");
    const branch = {
      branchId: id,
      branchName: node?.name ?? name,
      zone: zone?.id ?? "",
      region: region?.id ?? "",
      area: area?.id ?? "",
      zoneName: zone?.name ?? "Unassigned zone",
      regionName: region?.name ?? "Unassigned region",
      areaName: area?.name ?? "Unassigned area",
      cameraCount: 0,
      onlineCount: 0,
    };
    branches.set(id, branch);
    return branch;
  };
  // Configured branches and zones remain selectable even before cameras are added.
  scopedNodes.filter(node => node.type === "branch").forEach(node => addBranch(node.id, node.name));
  for (const camera of cameras) {
    const id = camera.branchId || "default-branch";
    if (organizationId && scopedBranchIds.size > 0 && !scopedBranchIds.has(id)) {
      continue;
    }
    const branch = branches.get(id) ?? (organizationId && scopedBranchIds.size > 0 ? undefined : addBranch(id, camera.branchName || `Branch ${id}`));
    if (branch) {
      branch.cameraCount++;
      if (isLiveWallCameraOnline(camera)) branch.onlineCount++;
    }
  }
  return [...branches.values()].sort((a, b) => a.branchName.localeCompare(b.branchName));
}

export function liveWallHierarchyOptions(
  nodes: LiveWallHierarchyNode[],
  type: "zone" | "region" | "area",
  zones: string[] = [],
  regions: string[] = [],
  organizationId?: string | null,
) {
  const scopedNodes = filterHierarchyByOrganization(nodes, organizationId);
  const byId = new Map(scopedNodes.map(node => [node.id, node]));
  return scopedNodes.filter(node => {
    if (node.type !== type) return false;
    const path = ancestors(node, byId);
    return (type === "zone" || matchesLiveWallSelection(zones, path.find(parent => parent.type === "zone")?.id)) &&
      (type !== "area" || matchesLiveWallSelection(regions, path.find(parent => parent.type === "region")?.id));
  }).map(node => ({ value: node.id, label: node.name })).sort((a, b) => a.label.localeCompare(b.label));
}
