import type {
  MapNodeEntity,
  FloorPlanEntity,
  HealthCause,
  BranchOperationalSummary,
  OperationalHealthStatus,
} from '../domain/operational-map.types.js';

export class OperationalMapService {
  private readonly nodes = new Map<string, MapNodeEntity>();
  private readonly floorPlans = new Map<string, FloorPlanEntity>(); // floorId -> floorPlan
  private readonly branchFloorMap = new Map<string, string[]>(); // branchId -> floorIds[]
  private readonly nodeCauses = new Map<string, HealthCause[]>(); // nodeId -> causes[]


  /**
   * 1. Get Country Root Node (India).
   */
  async getRootNode(): Promise<MapNodeEntity | null> {
    return Array.from(this.nodes.values()).find(
      (node) => node.level === 'COUNTRY' && !node.parentId,
    ) ?? null;
  }

  /**
   * 2. Get Child Nodes for Deterministic Drill-Down.
   */
  async getChildrenNodes(parentId: string): Promise<MapNodeEntity[]> {
    return Array.from(this.nodes.values()).filter((n) => n.parentId === parentId);
  }

  /**
   * 3. Get Node Details by ID.
   */
  async getNodeDetails(nodeId: string): Promise<MapNodeEntity | null> {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * 4. "Why Red?" Root-Cause Explanation Engine.
   */
  async getNodeCauses(nodeId: string): Promise<HealthCause[]> {
    return this.nodeCauses.get(nodeId) || [];
  }

  /**
   * 5. Get Comprehensive Branch Operational Summary.
   */
  async getBranchOperationalView(branchId: string): Promise<BranchOperationalSummary | null> {
    const node = this.nodes.get(branchId);
    if (!node || node.level !== 'BRANCH' || !node.parentId) return null;
    const region = this.nodes.get(node.parentId);
    if (!region?.parentId) return null;

    const floorIds = this.branchFloorMap.get(branchId) || [];
    const floorSummaries = floorIds.map((fId) => {
      const plan = this.floorPlans.get(fId)!;
      return {
        floorId: plan.floorId,
        name: plan.name,
        floorNumber: plan.floorNumber,
        cameraCount: plan.cameras.length,
      };
    });

    const causes = this.nodeCauses.get(branchId) || [];

    return {
      branchId: node.id,
      name: node.name,
      regionId: node.parentId,
      stateId: region.parentId,
      latitude: node.latitude,
      longitude: node.longitude,
      overallStatus: node.overallStatus,
      infrastructureStatus: node.infrastructureStatus,
      incidentStatus: node.incidentStatus,
      internetAvailable: node.metrics.internetOutagesCount === 0,
      gatewayHealthy: node.infrastructureStatus === 'HEALTHY',
      recorderHealthy: node.metrics.offlineRecordersCount === 0,
      camerasTotal: node.metrics.totalCameras,
      camerasOnline: node.metrics.totalCameras - node.metrics.offlineCamerasCount,
      recordingCompliantChannels: node.metrics.totalCameras - node.metrics.offlineCamerasCount - node.metrics.retentionViolationsCount,
      retentionViolations: node.metrics.retentionViolationsCount,
      activeIncidents: {
        p1: node.metrics.activeP1Incidents,
        p2: node.metrics.activeP2Incidents,
        p3: node.metrics.activeP3Incidents,
      },
      causes,
      floorPlans: floorSummaries,
    };
  }

  /**
   * 6. Get Floor Plan with Placed Cameras & FOV Cones.
   */
  async getFloorPlan(floorId: string): Promise<FloorPlanEntity | null> {
    // Lookup by direct floorId or by branchId (returns first floor)
    if (this.floorPlans.has(floorId)) {
      return this.floorPlans.get(floorId)!;
    }
    const branchFloors = this.branchFloorMap.get(floorId);
    if (branchFloors && branchFloors[0]) {
      return this.floorPlans.get(branchFloors[0]) || null;
    }
    return null;
  }

  /**
   * 7. List Floor Plans for Branch.
   */
  async listBranchFloors(branchId: string): Promise<FloorPlanEntity[]> {
    const floorIds = this.branchFloorMap.get(branchId) || [];
    return floorIds.map((id) => this.floorPlans.get(id)!).filter(Boolean);
  }

  /**
   * 8. Fleetwide Operational Overlay Summary.
   */
  async getOverlaySummary(): Promise<{
    totalBranches: number;
    healthyBranches: number;
    warningBranches: number;
    criticalBranches: number;
    internetOutages: number;
    p1Incidents: number;
    p2Incidents: number;
    cameraOutages: number;
    recorderOutages: number;
    retentionViolations: number;
    aiIncidentsLast24h: number;
    configDriftCount: number;
    clockDriftCount: number;
  }> {
    const branches = Array.from(this.nodes.values()).filter((node) => node.level === 'BRANCH');
    const sum = (selector: (node: MapNodeEntity) => number) =>
      branches.reduce((total, branch) => total + selector(branch), 0);
    return {
      totalBranches: branches.length,
      healthyBranches: branches.filter((branch) => branch.overallStatus === 'HEALTHY').length,
      warningBranches: branches.filter((branch) => branch.overallStatus === 'WARNING').length,
      criticalBranches: branches.filter((branch) => branch.overallStatus === 'CRITICAL').length,
      internetOutages: sum((branch) => branch.metrics.internetOutagesCount),
      p1Incidents: sum((branch) => branch.metrics.activeP1Incidents),
      p2Incidents: sum((branch) => branch.metrics.activeP2Incidents),
      cameraOutages: sum((branch) => branch.metrics.offlineCamerasCount),
      recorderOutages: sum((branch) => branch.metrics.offlineRecordersCount),
      retentionViolations: sum((branch) => branch.metrics.retentionViolationsCount),
      aiIncidentsLast24h: sum((branch) => branch.metrics.aiAlertsLast24h),
      configDriftCount: sum((branch) => branch.metrics.configDriftCount),
      clockDriftCount: sum((branch) => branch.metrics.clockDriftCount),
    };
  }

  /**
   * 9. Ingest live telemetry or incident update and re-aggregate node tree.
   */
  async updateAssetOperationalTelemetry(input: {
    branchId: string;
    cameraId?: string;
    status: 'ONLINE' | 'OFFLINE' | 'ALERTING' | 'DEGRADED';
    incidentPriority?: 'P1' | 'P2' | 'P3';
    alertMessage?: string;
  }): Promise<{ updated: boolean; branchStatus: OperationalHealthStatus }> {
    const branchNode = this.nodes.get(input.branchId);
    if (!branchNode) return { updated: false, branchStatus: 'UNKNOWN' };

    if (input.status === 'OFFLINE') {
      branchNode.metrics.offlineCamerasCount++;
      branchNode.infrastructureStatus = 'CRITICAL';
      branchNode.overallStatus = 'CRITICAL';
    } else if (input.status === 'ALERTING' && input.incidentPriority === 'P1') {
      branchNode.metrics.activeP1Incidents++;
      branchNode.incidentStatus = 'P1';
      branchNode.overallStatus = 'CRITICAL';
    }

    return {
      updated: true,
      branchStatus: branchNode.overallStatus,
    };
  }

  async searchNodes(query: string): Promise<MapNodeEntity[]> {
    const q = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      (n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    );
  }
}

export const operationalMapService = new OperationalMapService();
