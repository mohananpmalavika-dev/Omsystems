import type {
  TwinNode,
  TwinNodeType,
  TwinRelationship,
  TwinRelationshipType,
} from "../domain/twin-health.types.js";

export class DigitalTwinTopologyService {
  private readonly nodes = new Map<string, TwinNode>();
  private readonly relationships: TwinRelationship[] = [];

  constructor() {
    this.seedDefaultTopology();
  }

  addNode(node: TwinNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(nodeId: string): TwinNode | undefined {
    return this.nodes.get(nodeId);
  }

  listNodes(branchId?: string): TwinNode[] {
    const all = Array.from(this.nodes.values());
    return branchId ? all.filter((n) => n.branchId === branchId) : all;
  }

  addRelationship(rel: TwinRelationship): void {
    this.relationships.push(rel);
  }

  getRelationships(branchId?: string): TwinRelationship[] {
    return [...this.relationships];
  }

  /**
   * Traverse upstream dependencies (e.g. Camera -> Switch -> Router)
   */
  getUpstreamNodes(nodeId: string): TwinNode[] {
    const upstream: TwinNode[] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string) => {
      // Find relationships where currentId depends on / connects to parent
      const parentRels = this.relationships.filter(
        (r) =>
          r.fromNodeId === currentId &&
          (r.type === "CONNECTS_TO" || r.type === "DEPENDS_ON" || r.type === "USES_NETWORK" || r.type === "ROUTES_THROUGH"),
      );

      for (const rel of parentRels) {
        if (!visited.has(rel.toNodeId)) {
          visited.add(rel.toNodeId);
          const parent = this.nodes.get(rel.toNodeId);
          if (parent) {
            upstream.push(parent);
            traverse(rel.toNodeId);
          }
        }
      }
    };

    traverse(nodeId);
    return upstream;
  }

  /**
   * Traverse downstream dependents (e.g. Switch -> Recorder -> Cameras -> Services)
   */
  getDownstreamNodes(nodeId: string): TwinNode[] {
    const downstream: TwinNode[] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string) => {
      const childRels = this.relationships.filter(
        (r) =>
          r.toNodeId === currentId &&
          (r.type === "CONNECTS_TO" || r.type === "DEPENDS_ON" || r.type === "RECORDS" || r.type === "USES_NETWORK"),
      );

      for (const rel of childRels) {
        if (!visited.has(rel.fromNodeId)) {
          visited.add(rel.fromNodeId);
          const child = this.nodes.get(rel.fromNodeId);
          if (child) {
            downstream.push(child);
            traverse(rel.fromNodeId);
          }
        }
      }
    };

    traverse(nodeId);
    return downstream;
  }

  private seedDefaultTopology() {
    const now = new Date();
    const branchId = "branch-118";
    const tenantId = "tenant-bank-01";

    // 1. Branch Root Node
    this.addNode({
      id: "branch-118",
      tenantId,
      branchId,
      type: "BRANCH",
      name: "Thrissur Main 118",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { region: "Kerala South", address: "Round South, Thrissur" },
    });

    // 2. Router
    this.addNode({
      id: "router-118-01",
      tenantId,
      branchId,
      type: "ROUTER",
      name: "Gateway Router 01",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { ip: "10.118.1.1", model: "Cisco ISR 4321" },
    });
    this.addRelationship({
      id: "rel-br-rt",
      fromNodeId: "router-118-01",
      toNodeId: "branch-118",
      type: "CONTAINS",
      criticality: "CRITICAL",
    });

    // 3. Switch-02 (CCTV PoE Switch)
    this.addNode({
      id: "switch-118-02",
      tenantId,
      branchId,
      type: "SWITCH",
      name: "Switch-02",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { ip: "10.118.1.12", ports: 24, model: "Cisco Catalyst 2960" },
    });
    this.addRelationship({
      id: "rel-rt-sw",
      fromNodeId: "switch-118-02",
      toNodeId: "router-118-01",
      type: "CONNECTS_TO",
      criticality: "CRITICAL",
    });

    // 4. DVR-01 (CP PLUS NVR)
    this.addNode({
      id: "dvr-118-01",
      tenantId,
      branchId,
      type: "RECORDER",
      name: "DVR-01",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { ip: "10.118.1.20", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2" },
    });
    this.addRelationship({
      id: "rel-sw-dvr",
      fromNodeId: "dvr-118-01",
      toNodeId: "switch-118-02",
      type: "CONNECTS_TO",
      criticality: "CRITICAL",
    });

    // 5. HDD-01
    this.addNode({
      id: "hdd-118-01",
      tenantId,
      branchId,
      type: "STORAGE",
      name: "WD Purple 8TB (HDD-01)",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { capacityTb: 8, serialNumber: "WD-WCC4N123456" },
    });
    this.addRelationship({
      id: "rel-dvr-hdd",
      fromNodeId: "hdd-118-01",
      toNodeId: "dvr-118-01",
      type: "STORES_ON",
      criticality: "CRITICAL",
    });

    // 6. Cameras 1 to 8 (recorded by DVR-01 and connected to Switch-02)
    for (let i = 1; i <= 8; i++) {
      const camId = `cam-118-0${i}`;
      const isVault = i === 1 || i === 4;
      const isAtm = i === 2 || i === 5;
      const name = isVault ? `Vault CAM 0${i}` : isAtm ? `ATM CAM 0${i}` : `Branch CAM 0${i}`;

      this.addNode({
        id: camId,
        tenantId,
        branchId,
        type: "CAMERA",
        name,
        health: "HEALTHY",
        healthOrigin: "OBSERVED",
        lastObservedAt: now,
        metadata: { ip: `10.118.20.3${i}`, channel: i, zone: isVault ? "VAULT" : isAtm ? "ATM_LOBBY" : "GENERAL" },
      });

      // Switch connection
      this.addRelationship({
        id: `rel-sw-${camId}`,
        fromNodeId: camId,
        toNodeId: "switch-118-02",
        type: "CONNECTS_TO",
        criticality: isVault ? "CRITICAL" : "HIGH",
      });

      // Recorder recording
      this.addRelationship({
        id: `rel-dvr-${camId}`,
        fromNodeId: camId,
        toNodeId: "dvr-118-01",
        type: "RECORDS",
        criticality: "HIGH",
      });
    }

    // 7. Business Services
    this.addNode({
      id: "srv-vault-recording",
      tenantId,
      branchId,
      type: "SERVICE",
      name: "Vault Recording",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { criticality: "P1_COMPLIANCE" },
    });
    this.addRelationship({
      id: "rel-srv-vault",
      fromNodeId: "srv-vault-recording",
      toNodeId: "cam-118-04",
      type: "DEPENDS_ON",
      criticality: "CRITICAL",
    });

    this.addNode({
      id: "srv-atm-recording",
      tenantId,
      branchId,
      type: "SERVICE",
      name: "ATM Camera Recording",
      health: "HEALTHY",
      healthOrigin: "OBSERVED",
      lastObservedAt: now,
      metadata: { criticality: "P1_COMPLIANCE" },
    });
    this.addRelationship({
      id: "rel-srv-atm",
      fromNodeId: "srv-atm-recording",
      toNodeId: "cam-118-02",
      type: "DEPENDS_ON",
      criticality: "CRITICAL",
    });
  }
}

export const digitalTwinTopologyService = new DigitalTwinTopologyService();
