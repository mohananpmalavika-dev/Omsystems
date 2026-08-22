/**
 * Digital Twin Dependency Topology Graph
 * 
 * Models physical and logical dependency semantics between branches, routers, switches,
 * NVRs/DVRs, cameras, SATA storage, and AI analytics pipelines.
 */

export type TwinNodeType =
  | "BRANCH"
  | "ROUTER"
  | "SWITCH"
  | "VPN"
  | "EDGE_GATEWAY"
  | "RECORDER"
  | "CAMERA"
  | "STORAGE"
  | "AI_SERVICE";

export type DependencyType =
  | "NETWORK_PATH"
  | "POWER_DEPENDENCY"
  | "RECORDER_DEPENDENCY"
  | "RECORDING_DEPENDENCY"
  | "STREAM_DEPENDENCY"
  | "AI_DEPENDENCY"
  | "STORAGE_DEPENDENCY";

export interface TwinDependencyNode {
  id: string;
  tenantId: string;
  branchId: string;
  type: TwinNodeType;
  name: string;
  status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
  failedAt?: Date | undefined;
}

export interface TwinDependencyEdge {
  parentNodeId: string;
  childNodeId: string;
  type: DependencyType;
  critical: boolean;
}

export class DigitalTwinDependencyGraph {
  private nodes: Map<string, TwinDependencyNode> = new Map();
  private edges: TwinDependencyEdge[] = [];

  constructor() {
    // Topology is populated from the persisted branch/device inventory.
  }

  addNode(node: TwinDependencyNode) {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: TwinDependencyEdge) {
    this.edges.push(edge);
  }

  setNodeStatus(nodeId: string, status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN", failedAt = new Date()) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
      node.failedAt = status === "FAILED" || status === "DEGRADED" ? failedAt : undefined;
    }
  }

  getNode(nodeId: string): TwinDependencyNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Traverse upstream dependencies to find active failed ancestors
   */
  getActiveFailedAncestors(nodeId: string): TwinDependencyNode[] {
    const ancestors: TwinDependencyNode[] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string) => {
      const parentEdges = this.edges.filter((e) => e.childNodeId === currentId);
      for (const edge of parentEdges) {
        if (!visited.has(edge.parentNodeId)) {
          visited.add(edge.parentNodeId);
          const parentNode = this.nodes.get(edge.parentNodeId);
          if (parentNode) {
            if (parentNode.status === "FAILED" || parentNode.status === "DEGRADED") {
              ancestors.push(parentNode);
            }
            traverse(edge.parentNodeId);
          }
        }
      }
    };

    traverse(nodeId);
    return ancestors;
  }

  /**
   * Traverse downstream dependents to calculate blast radius
   */
  getDependentsRecursively(nodeId: string): TwinDependencyNode[] {
    const dependents: TwinDependencyNode[] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string) => {
      const childEdges = this.edges.filter((e) => e.parentNodeId === currentId);
      for (const edge of childEdges) {
        if (!visited.has(edge.childNodeId)) {
          visited.add(edge.childNodeId);
          const childNode = this.nodes.get(edge.childNodeId);
          if (childNode) {
            dependents.push(childNode);
            traverse(edge.childNodeId);
          }
        }
      }
    };

    traverse(nodeId);
    return dependents;
  }

  calculateBlastRadius(rootNodeId: string) {
    const dependents = this.getDependentsRecursively(rootNodeId);
    return {
      directRecorders: dependents.filter((d) => d.type === "RECORDER").length,
      dependentCameras: dependents.filter((d) => d.type === "CAMERA").length,
      dependentRecordingStreams: dependents.filter((d) => d.type === "CAMERA" || d.type === "STORAGE").length,
      dependentAiPipelines: dependents.filter((d) => d.type === "AI_SERVICE").length,
    };
  }

  private seedBranchTopology(branchId: string) {
    const routerId = `router-${branchId}`;
    const nvrId = `rec-${branchId}-01`;
    const edgeGwId = `edge-gw-${branchId.replace("branch-", "")}`;

    this.addNode({ id: routerId, tenantId: "bank-corp", branchId, type: "ROUTER", name: "Primary WAN Router", status: "HEALTHY" });
    this.addNode({ id: edgeGwId, tenantId: "bank-corp", branchId, type: "EDGE_GATEWAY", name: "Branch Edge Gateway", status: "HEALTHY" });
    this.addNode({ id: nvrId, tenantId: "bank-corp", branchId, type: "RECORDER", name: "CP PLUS 16-CH NVR", status: "HEALTHY" });

    this.addEdge({ parentNodeId: routerId, childNodeId: edgeGwId, type: "NETWORK_PATH", critical: true });
    this.addEdge({ parentNodeId: routerId, childNodeId: nvrId, type: "NETWORK_PATH", critical: true });

    // 16 Cameras attached to NVR
    for (let i = 1; i <= 16; i++) {
      const camId = `cam-${branchId.replace("branch-", "")}-${i.toString().padStart(2, "0")}`;
      const aiId = `ai-${camId}`;
      this.addNode({ id: camId, tenantId: "bank-corp", branchId, type: "CAMERA", name: `CAM-${i.toString().padStart(2, "0")}`, status: "HEALTHY" });
      this.addNode({ id: aiId, tenantId: "bank-corp", branchId, type: "AI_SERVICE", name: `AI Analytics ${camId}`, status: "HEALTHY" });

      this.addEdge({ parentNodeId: nvrId, childNodeId: camId, type: "RECORDER_DEPENDENCY", critical: true });
      this.addEdge({ parentNodeId: camId, childNodeId: aiId, type: "STREAM_DEPENDENCY", critical: false });
    }
  }

  clear() {
    this.nodes.clear();
    this.edges = [];
  }
}

export const digitalTwinDependencyGraph = new DigitalTwinDependencyGraph();
