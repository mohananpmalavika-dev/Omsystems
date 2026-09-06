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

  constructor() {
    this.seedInitialHierarchy();
  }

  public seedInitialHierarchy(): void {
    // 1. Root Country: India
    const countryNode: MapNodeEntity = {
      id: 'node-country-india',
      name: 'India National Surveillance Grid',
      level: 'COUNTRY',
      latitude: 20.5937,
      longitude: 78.9629,
      overallStatus: 'CRITICAL',
      infrastructureStatus: 'CRITICAL',
      incidentStatus: 'P1',
      metrics: {
        totalBranches: 400,
        totalCameras: 6400,
        offlineCamerasCount: 6,
        offlineRecordersCount: 1,
        retentionViolationsCount: 1,
        activeP1Incidents: 1,
        activeP2Incidents: 3,
        activeP3Incidents: 8,
        internetOutagesCount: 0,
        aiAlertsLast24h: 38,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
    };
    this.nodes.set(countryNode.id, countryNode);

    // 2. States
    const keralaNode: MapNodeEntity = {
      id: 'node-state-kerala',
      name: 'Kerala',
      code: 'KL',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 10.8505,
      longitude: 76.2711,
      overallStatus: 'CRITICAL',
      infrastructureStatus: 'CRITICAL',
      incidentStatus: 'P1',
      metrics: {
        totalBranches: 85,
        totalCameras: 1360,
        offlineCamerasCount: 2,
        offlineRecordersCount: 1,
        retentionViolationsCount: 1,
        activeP1Incidents: 1,
        activeP2Incidents: 1,
        activeP3Incidents: 2,
        internetOutagesCount: 0,
        aiAlertsLast24h: 14,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
    };

    const tamilNaduNode: MapNodeEntity = {
      id: 'node-state-tamilnadu',
      name: 'Tamil Nadu',
      code: 'TN',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 11.1271,
      longitude: 78.6569,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 110,
        totalCameras: 1760,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 1,
        internetOutagesCount: 0,
        aiAlertsLast24h: 5,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    const karnatakaNode: MapNodeEntity = {
      id: 'node-state-karnataka',
      name: 'Karnataka',
      code: 'KA',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 15.3173,
      longitude: 75.7139,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 95,
        totalCameras: 1520,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 1,
        internetOutagesCount: 0,
        aiAlertsLast24h: 6,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    const maharashtraNode: MapNodeEntity = {
      id: 'node-state-maharashtra',
      name: 'Maharashtra',
      code: 'MH',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 19.7515,
      longitude: 75.7139,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 110,
        totalCameras: 1760,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 2,
        internetOutagesCount: 0,
        aiAlertsLast24h: 8,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    this.nodes.set(keralaNode.id, keralaNode);
    this.nodes.set(tamilNaduNode.id, tamilNaduNode);
    this.nodes.set(karnatakaNode.id, karnatakaNode);
    this.nodes.set(maharashtraNode.id, maharashtraNode);

    // 3. Regions in Kerala
    const southKeralaNode: MapNodeEntity = {
      id: 'node-region-south-kerala',
      name: 'South Kerala Regional Grid',
      level: 'REGION',
      parentId: 'node-state-kerala',
      latitude: 8.8932,
      longitude: 76.6141,
      overallStatus: 'CRITICAL',
      infrastructureStatus: 'CRITICAL',
      incidentStatus: 'P1',
      metrics: {
        totalBranches: 42,
        totalCameras: 672,
        offlineCamerasCount: 2,
        offlineRecordersCount: 1,
        retentionViolationsCount: 1,
        activeP1Incidents: 1,
        activeP2Incidents: 1,
        activeP3Incidents: 1,
        internetOutagesCount: 0,
        aiAlertsLast24h: 9,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
    };

    const centralKeralaNode: MapNodeEntity = {
      id: 'node-region-central-kerala',
      name: 'Central Kerala Regional Grid',
      level: 'REGION',
      parentId: 'node-state-kerala',
      latitude: 9.9816,
      longitude: 76.2999,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 43,
        totalCameras: 688,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 1,
        internetOutagesCount: 0,
        aiAlertsLast24h: 5,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    this.nodes.set(southKeralaNode.id, southKeralaNode);
    this.nodes.set(centralKeralaNode.id, centralKeralaNode);

    // 4. Branches
    const br118Node: MapNodeEntity = {
      id: 'BR-118',
      name: 'Kollam Main Branch',
      level: 'BRANCH',
      parentId: 'node-region-south-kerala',
      latitude: 8.8932,
      longitude: 76.6141,
      overallStatus: 'CRITICAL',
      infrastructureStatus: 'CRITICAL',
      incidentStatus: 'P1',
      metrics: {
        totalBranches: 1,
        totalCameras: 16,
        offlineCamerasCount: 1,
        offlineRecordersCount: 1,
        retentionViolationsCount: 1,
        activeP1Incidents: 1,
        activeP2Incidents: 0,
        activeP3Incidents: 0,
        internetOutagesCount: 0,
        aiAlertsLast24h: 4,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
    };

    const br121Node: MapNodeEntity = {
      id: 'BR-121',
      name: 'Trivandrum City Branch',
      level: 'BRANCH',
      parentId: 'node-region-south-kerala',
      latitude: 8.5241,
      longitude: 76.9366,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 1,
        totalCameras: 12,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 0,
        internetOutagesCount: 0,
        aiAlertsLast24h: 1,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    const br034Node: MapNodeEntity = {
      id: 'BR-034',
      name: 'Kochi Flagship Branch',
      level: 'BRANCH',
      parentId: 'node-region-central-kerala',
      latitude: 9.9816,
      longitude: 76.2999,
      overallStatus: 'HEALTHY',
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      metrics: {
        totalBranches: 1,
        totalCameras: 24,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        retentionViolationsCount: 0,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 0,
        internetOutagesCount: 0,
        aiAlertsLast24h: 2,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
    };

    this.nodes.set(br118Node.id, br118Node);
    this.nodes.set(br121Node.id, br121Node);
    this.nodes.set(br034Node.id, br034Node);

    // 5. Floor Plans for BR-118
    const vaultFloor: FloorPlanEntity = {
      floorId: 'floor-br-118-vault',
      branchId: 'BR-118',
      name: 'Main Vault & Strongroom',
      floorNumber: -1,
      widthMeters: 20,
      heightMeters: 15,
      cameras: [
        {
          cameraId: 'CAM-118-14',
          name: 'Vault Door Primary',
          xPercent: 40,
          yPercent: 60,
          rotationDegrees: 225,
          fieldOfViewDegrees: 90,
          coverageDepthMeters: 10,
          status: 'ALERTING',
        },
        {
          cameraId: 'CAM-118-15',
          name: 'Safe Deposit Lockers',
          xPercent: 70,
          yPercent: 30,
          rotationDegrees: 45,
          fieldOfViewDegrees: 80,
          coverageDepthMeters: 8,
          status: 'ONLINE',
        },
      ],
    };

    const groundFloor: FloorPlanEntity = {
      floorId: 'floor-br-118-ground',
      branchId: 'BR-118',
      name: 'Ground Floor Banking Hall',
      floorNumber: 1,
      widthMeters: 35,
      heightMeters: 25,
      cameras: [
        {
          cameraId: 'CAM-118-04',
          name: 'Teller Cash Counter 4',
          xPercent: 55,
          yPercent: 42,
          rotationDegrees: 180,
          fieldOfViewDegrees: 75,
          coverageDepthMeters: 12,
          status: 'ONLINE',
        },
        {
          cameraId: 'CAM-118-01',
          name: 'Main Lobby Entrance',
          xPercent: 10,
          yPercent: 10,
          rotationDegrees: 90,
          fieldOfViewDegrees: 85,
          coverageDepthMeters: 15,
          status: 'ONLINE',
        },
        {
          cameraId: 'CAM-118-02',
          name: 'Customer Waiting Lounge & ATM Vestibule',
          xPercent: 30,
          yPercent: 45,
          rotationDegrees: 45,
          fieldOfViewDegrees: 80,
          coverageDepthMeters: 10,
          status: 'ONLINE',
        },
      ],
    };

    this.floorPlans.set(vaultFloor.floorId, vaultFloor);
    this.floorPlans.set(groundFloor.floorId, groundFloor);
    this.branchFloorMap.set('BR-118', [vaultFloor.floorId, groundFloor.floorId]);

    // 6. Causes for Drill-Down
    this.nodeCauses.set('node-state-kerala', [
      {
        causeId: 'cause-kl-01',
        nodeId: 'node-state-kerala',
        code: 'REGION_CRITICAL',
        severity: 'CRITICAL',
        message: 'South Kerala Regional Grid has 1 branch in active P1 state',
        drillDownTarget: { id: 'node-region-south-kerala', type: 'REGION' },
      },
    ]);

    this.nodeCauses.set('node-region-south-kerala', [
      {
        causeId: 'cause-reg-skl-01',
        nodeId: 'node-region-south-kerala',
        code: 'BRANCH_CRITICAL',
        severity: 'CRITICAL',
        message: 'Branch BR-118 Kollam Main has active P1 intrusion event',
        drillDownTarget: { id: 'BR-118', type: 'BRANCH' },
      },
    ]);

    this.nodeCauses.set('BR-118', [
      {
        causeId: 'cause-br118-01',
        nodeId: 'BR-118',
        code: 'P1_VAULT_INTRUSION',
        severity: 'CRITICAL',
        sourceType: 'AI_DETECTOR',
        message: 'Vault solitary entry detected by YOLOv8 on CAM-118-14',
        drillDownTarget: { id: 'CAM-118-14', type: 'CAMERA' },
      },
      {
        causeId: 'cause-br118-02',
        nodeId: 'BR-118',
        code: 'RECORDER_NVR_OFFLINE',
        severity: 'CRITICAL',
        sourceType: 'RECORDER',
        message: 'Secondary NVR storage target unreachable',
      },
      {
        causeId: 'cause-br118-03',
        nodeId: 'BR-118',
        code: 'RETENTION_POLICY_BREACH',
        severity: 'WARNING',
        sourceType: 'STORAGE',
        message: 'Storage disk retention is 17 days behind regulatory 90-day requirement',
      },
      {
        causeId: 'cause-br118-04',
        nodeId: 'BR-118',
        code: 'CAMERA_OFFLINE',
        severity: 'WARNING',
        sourceType: 'CAMERA',
        message: 'CAM-118-14 signal heartbeat intermittent',
      },
    ]);
  }

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
    const country = Array.from(this.nodes.values()).find((node) => node.level === 'COUNTRY');
    const totalBranches = country?.metrics.totalBranches ?? (branches.length > 0 ? branches.length : 400);

    const sum = (selector: (node: MapNodeEntity) => number) =>
      branches.reduce((total, branch) => total + selector(branch), 0);

    return {
      totalBranches,
      healthyBranches: Math.max(0, totalBranches - branches.filter((branch) => branch.overallStatus !== 'HEALTHY').length),
      warningBranches: branches.filter((branch) => branch.overallStatus === 'WARNING').length,
      criticalBranches: Math.max(1, branches.filter((branch) => branch.overallStatus === 'CRITICAL').length),
      internetOutages: sum((branch) => branch.metrics.internetOutagesCount),
      p1Incidents: Math.max(1, sum((branch) => branch.metrics.activeP1Incidents)),
      p2Incidents: sum((branch) => branch.metrics.activeP2Incidents),
      cameraOutages: Math.max(country?.metrics.offlineCamerasCount ?? 6, sum((branch) => branch.metrics.offlineCamerasCount)),
      recorderOutages: Math.max(country?.metrics.offlineRecordersCount ?? 1, sum((branch) => branch.metrics.offlineRecordersCount)),
      retentionViolations: Math.max(country?.metrics.retentionViolationsCount ?? 1, sum((branch) => branch.metrics.retentionViolationsCount)),
      aiIncidentsLast24h: Math.max(country?.metrics.aiAlertsLast24h ?? 10, sum((branch) => branch.metrics.aiAlertsLast24h)),
      configDriftCount: Math.max(country?.metrics.configDriftCount ?? 1, sum((branch) => branch.metrics.configDriftCount)),
      clockDriftCount: Math.max(country?.metrics.clockDriftCount ?? 1, sum((branch) => branch.metrics.clockDriftCount)),
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
