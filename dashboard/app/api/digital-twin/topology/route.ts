import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ApiBranch = { id: string };
type GraphNode = {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  healthScore: number | null;
  status: string;
  observedAt: string | null;
  evidenceQuality: string;
};
type GraphEdge = { sourceId: string; targetId: string; relation: string };
type BranchGraph = { branchId: string; nodes: GraphNode[]; edges: GraphEdge[] };

/**
 * Supplies the topology visualizer with all infrastructure graphs that the
 * current employee is permitted to view. The control plane exposes graphs per
 * branch, so this BFF route combines them without exposing any control-plane
 * address or session token to the client.
 */
export async function GET(request: NextRequest) {
  const headers = forwardedHeaders(request);
  const bff = (path: string) => new URL(`/api/control${path}`, request.nextUrl.origin);

  try {
    const branchesResponse = await fetch(bff("/v1/branches"), {
      headers,
      cache: "no-store",
    });
    if (!branchesResponse.ok) return forwardFailure(branchesResponse);

    const branches = asBranches(await branchesResponse.json());
    const rootId = request.nextUrl.searchParams.get("rootId");
    const selectedBranches = rootId
      ? branches.filter((branch) => branch.id === rootId)
      : branches;

    if (rootId && selectedBranches.length === 0) {
      return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
    }

    const graphResults = await Promise.allSettled(selectedBranches.map(async (branch) => {
      const response = await fetch(bff(`/v1/infrastructure/graph/${encodeURIComponent(branch.id)}`), {
        headers,
        cache: "no-store",
      });
      if (!response.ok) throw new UpstreamError(response.status, await response.text());
      return asGraph(await response.json());
    }));

    const graphs = graphResults
      .filter((result): result is PromiseFulfilledResult<BranchGraph> => result.status === "fulfilled")
      .map((result) => result.value);

    if (selectedBranches.length > 0 && graphs.length === 0) {
      const failed = graphResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
      const status = failed?.reason instanceof UpstreamError ? failed.reason.status : 502;
      return NextResponse.json(
        { error: "topology_unavailable", message: "Unable to load an accessible infrastructure graph" },
        { status },
      );
    }

    return NextResponse.json(toTopologyData(graphs), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Digital-twin topology API error:", error);
    return NextResponse.json(
      { error: "topology_unavailable", message: "Unable to load topology data" },
      { status: 502 },
    );
  }
}

function forwardedHeaders(request: NextRequest) {
  return {
    cookie: request.headers.get("cookie") ?? "",
    "x-tenant-id": request.headers.get("x-tenant-id") ?? "",
    "x-user-id": request.headers.get("x-user-id") ?? "system",
  };
}

async function forwardFailure(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return NextResponse.json(await response.json(), { status: response.status });
  }
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": contentType || "text/plain; charset=utf-8" },
  });
}

function asBranches(value: unknown): ApiBranch[] {
  const rows = asDataArray(value);
  return rows.flatMap((row) => (
    isRecord(row) && typeof row.id === "string" ? [{ id: row.id }] : []
  ));
}

function asGraph(value: unknown): BranchGraph {
  const data = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(data) || typeof data.branchId !== "string") throw new Error("invalid_topology_graph");
  return {
    branchId: data.branchId,
    nodes: Array.isArray(data.nodes) ? data.nodes.flatMap(toGraphNode) : [],
    edges: Array.isArray(data.edges) ? data.edges.flatMap(toGraphEdge) : [],
  };
}

function toGraphNode(value: unknown): GraphNode[] {
  if (!isRecord(value) || typeof value.deviceId !== "string") return [];
  return [{
    deviceId: value.deviceId,
    deviceType: typeof value.deviceType === "string" ? value.deviceType : "device",
    deviceName: typeof value.deviceName === "string" ? value.deviceName : value.deviceId,
    healthScore: typeof value.healthScore === "number" ? value.healthScore : null,
    status: typeof value.status === "string" ? value.status : "unknown",
    observedAt: typeof value.observedAt === "string" ? value.observedAt : null,
    evidenceQuality: typeof value.evidenceQuality === "string" ? value.evidenceQuality : "unknown",
  }];
}

function toGraphEdge(value: unknown): GraphEdge[] {
  if (!isRecord(value) || typeof value.sourceId !== "string" || typeof value.targetId !== "string") return [];
  return [{
    sourceId: value.sourceId,
    targetId: value.targetId,
    relation: typeof value.relation === "string" ? value.relation : "connected_to",
  }];
}

function toTopologyData(graphs: BranchGraph[]) {
  const nodes = graphs.flatMap((graph) => graph.nodes.map((node) => ({
    id: nodeKey(graph.branchId, node.deviceId),
    type: node.deviceType,
    label: node.deviceName,
    status: node.status,
    healthScore: node.healthScore ?? 0,
    securityScore: 0,
    metadata: {
      branchId: graph.branchId,
      observedAt: node.observedAt,
      evidenceQuality: node.evidenceQuality,
    },
  })));
  const statusByKey = new Map(nodes.map((node) => [node.id, node.status]));
  const edges = graphs.flatMap((graph) => graph.edges.map((edge) => {
    const source = nodeKey(graph.branchId, edge.sourceId);
    const target = nodeKey(graph.branchId, edge.targetId);
    return {
      id: `${source}:${edge.relation}:${target}`,
      source,
      target,
      type: edge.relation,
      criticality: edgeCriticality(statusByKey.get(source), statusByKey.get(target)),
    };
  }));
  const healthySummary = { healthy: 0, warning: 0, critical: 0, offline: 0, unknown: 0 };
  for (const node of nodes) {
    if (node.status === "healthy") healthySummary.healthy += 1;
    else if (node.status === "warning") healthySummary.warning += 1;
    else if (node.status === "critical") healthySummary.critical += 1;
    else if (node.status === "offline") healthySummary.offline += 1;
    else healthySummary.unknown += 1;
  }
  return { nodes, edges, totalAssets: nodes.length, healthySummary };
}

function nodeKey(branchId: string, deviceId: string) {
  return `${branchId}:${deviceId}`;
}

function edgeCriticality(sourceStatus: string | undefined, targetStatus: string | undefined) {
  if (sourceStatus === "critical" || targetStatus === "critical") return "critical";
  if (sourceStatus === "warning" || targetStatus === "warning") return "medium";
  return "low";
}

function asDataArray(value: unknown): unknown[] {
  return isRecord(value) && Array.isArray(value.data) ? value.data : Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class UpstreamError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
