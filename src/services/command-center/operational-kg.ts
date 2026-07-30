import type { ControlPlaneStore } from "../../control-plane-store.js";

export async function buildOperationalGraph(store: ControlPlaneStore, user: any, branchId: string) {
  const branch = { id: branchId };
  const cameras = await store.listCamerasByBranch(user, branchId, "live:view").catch(() => []);
  const edgeAgents = await store.listEdgeAgentsByBranch?.(branchId).catch(() => []);

  // Group cameras by recorder if recorderId present
  const byRecorder: Record<string, any[]> = {};
  for (const cam of cameras || []) {
    const rid = (cam as any).recorderId ?? "__no_recorder__";
    byRecorder[rid] = byRecorder[rid] ?? [];
    byRecorder[rid].push(cam);
  }

  return {
    branch,
    cameras,
    edgeAgents,
    byRecorder,
  };
}

export type OperationalGraph = Awaited<ReturnType<typeof buildOperationalGraph>>;
