import type { ControlPlaneStore } from '../control-plane-store.js';
import type { ReportHierarchyNode } from '../../packages/contracts/src/report-hierarchy.js';

/** Batch-load parent chains, including estates whose node paths are incomplete. */
export async function loadReportHierarchyNodes(store: ControlPlaneStore, branches: Array<{id:string;parentId?:string | null;path?:string[]}>) {
  const nodes = new Map<string, ReportHierarchyNode>();
  const requested = new Set<string>();
  let pending = [...new Set(branches.flatMap(branch => [branch.id, ...(branch.path ?? []), ...(branch.parentId ? [branch.parentId] : [])]))];
  while (pending.length) {
    pending.forEach(id => requested.add(id));
    const batch = await store.listNodesByIds(pending);
    batch.forEach(node => nodes.set(node.id, node));
    pending = [...new Set(batch.flatMap(node => node.parentId && !requested.has(node.parentId) ? [node.parentId] : []))];
  }
  return nodes;
}
