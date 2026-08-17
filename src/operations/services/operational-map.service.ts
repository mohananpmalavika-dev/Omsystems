import type {
  MapNodeEntity,
  FloorPlanEntity,
  FloorCameraPlacement,
  HealthCause,
  BranchOperationalSummary,
  OperationalHealthStatus,
  SecurityIncidentStatus,
} from '../domain/operational-map.types.js';

export class OperationalMapService {
  private readonly nodes = new Map<string, MapNodeEntity>();
  private readonly floorPlans = new Map<string, FloorPlanEntity>(); // floorId -> floorPlan
  private readonly branchFloorMap = new Map<string, string[]>(); // branchId -> floorIds[]
  private readonly nodeCauses = new Map<string, HealthCause[]>(); // nodeId -> causes[]

  constructor() {
    this.seedHierarchy();
  }

  private seedHierarchy(): void {
    // =========================================================================
    // 1. Tier: Country (India)
    // =========================================================================
    const india: MapNodeEntity = {
      id: 'node-country-india',
      name: 'India National Surveillance Grid',
      code: 'IN',
      level: 'COUNTRY',
      latitude: 20.5937,
      longitude: 78.9629,
      infrastructureStatus: 'WARNING',
      incidentStatus: 'P1',
      overallStatus: 'CRITICAL',
      metrics: {
        totalBranches: 400,
        totalCameras: 8000,
        activeP1Incidents: 2,
        activeP2Incidents: 4,
        activeP3Incidents: 8,
        offlineCamerasCount: 14,
        offlineRecordersCount: 2,
        internetOutagesCount: 1,
        retentionViolationsCount: 3,
        aiAlertsLast24h: 94,
        configDriftCount: 11,
        clockDriftCount: 5,
      },
      childrenCount: 4,
      digitalTwinNodeId: 'dt-country-in',
    };
    this.nodes.set(india.id, india);

    // =========================================================================
    // 2. Tier: States
    // =========================================================================
    const kerala: MapNodeEntity = {
      id: 'node-state-kerala',
      name: 'Kerala State Operations',
      code: 'KL',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 10.8505,
      longitude: 76.2711,
      infrastructureStatus: 'WARNING',
      incidentStatus: 'P1',
      overallStatus: 'CRITICAL',
      metrics: {
        totalBranches: 120,
        totalCameras: 2400,
        activeP1Incidents: 1,
        activeP2Incidents: 2,
        activeP3Incidents: 4,
        offlineCamerasCount: 6,
        offlineRecordersCount: 1,
        internetOutagesCount: 0,
        retentionViolationsCount: 2,
        aiAlertsLast24h: 38,
        configDriftCount: 4,
        clockDriftCount: 2,
      },
      childrenCount: 3,
      digitalTwinNodeId: 'dt-state-kl',
    };

    const tamilNadu: MapNodeEntity = {
      id: 'node-state-tamilnadu',
      name: 'Tamil Nadu State Operations',
      code: 'TN',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 11.1271,
      longitude: 78.6569,
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      overallStatus: 'HEALTHY',
      metrics: {
        totalBranches: 110,
        totalCameras: 2200,
        activeP1Incidents: 0,
        activeP2Incidents: 1,
        activeP3Incidents: 2,
        offlineCamerasCount: 2,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 18,
        configDriftCount: 2,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-state-tn',
    };

    const maharashtra: MapNodeEntity = {
      id: 'node-state-maharashtra',
      name: 'Maharashtra State Operations',
      code: 'MH',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 19.7515,
      longitude: 75.7139,
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'P2',
      overallStatus: 'WARNING',
      metrics: {
        totalBranches: 100,
        totalCameras: 2000,
        activeP1Incidents: 0,
        activeP2Incidents: 1,
        activeP3Incidents: 1,
        offlineCamerasCount: 4,
        offlineRecordersCount: 1,
        internetOutagesCount: 1,
        retentionViolationsCount: 1,
        aiAlertsLast24h: 24,
        configDriftCount: 3,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-state-mh',
    };

    const karnataka: MapNodeEntity = {
      id: 'node-state-karnataka',
      name: 'Karnataka State Operations',
      code: 'KA',
      level: 'STATE',
      parentId: 'node-country-india',
      latitude: 15.3173,
      longitude: 75.7139,
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      overallStatus: 'HEALTHY',
      metrics: {
        totalBranches: 70,
        totalCameras: 1400,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 1,
        offlineCamerasCount: 2,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 14,
        configDriftCount: 2,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-state-ka',
    };

    this.nodes.set(kerala.id, kerala);
    this.nodes.set(tamilNadu.id, tamilNadu);
    this.nodes.set(maharashtra.id, maharashtra);
    this.nodes.set(karnataka.id, karnataka);

    // =========================================================================
    // 3. Tier: Regions (Inside Kerala)
    // =========================================================================
    const southKeralaRegion: MapNodeEntity = {
      id: 'node-region-south-kerala',
      name: 'South Kerala Region (Kollam & TVM)',
      code: 'REG-S-KL',
      level: 'REGION',
      parentId: 'node-state-kerala',
      latitude: 8.8932,
      longitude: 76.6141,
      infrastructureStatus: 'WARNING',
      incidentStatus: 'P1',
      overallStatus: 'CRITICAL',
      metrics: {
        totalBranches: 42,
        totalCameras: 840,
        activeP1Incidents: 1,
        activeP2Incidents: 1,
        activeP3Incidents: 2,
        offlineCamerasCount: 3,
        offlineRecordersCount: 1,
        internetOutagesCount: 0,
        retentionViolationsCount: 1,
        aiAlertsLast24h: 16,
        configDriftCount: 2,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-region-south-kl',
    };

    const centralKeralaRegion: MapNodeEntity = {
      id: 'node-region-central-kerala',
      name: 'Central Kerala Region (Kochi & Thrissur)',
      code: 'REG-C-KL',
      level: 'REGION',
      parentId: 'node-state-kerala',
      latitude: 9.9312,
      longitude: 76.2673,
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      overallStatus: 'HEALTHY',
      metrics: {
        totalBranches: 48,
        totalCameras: 960,
        activeP1Incidents: 0,
        activeP2Incidents: 1,
        activeP3Incidents: 1,
        offlineCamerasCount: 2,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 1,
        aiAlertsLast24h: 12,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-region-central-kl',
    };

    this.nodes.set(southKeralaRegion.id, southKeralaRegion);
    this.nodes.set(centralKeralaRegion.id, centralKeralaRegion);

    // =========================================================================
    // 4. Tier: Branches (Inside South Kerala)
    // =========================================================================
    const br118: MapNodeEntity = {
      id: 'BR-118',
      name: 'Branch 118 (Kollam Main Branch)',
      code: 'BR-118',
      level: 'BRANCH',
      parentId: 'node-region-south-kerala',
      latitude: 8.8932,
      longitude: 76.6141,
      infrastructureStatus: 'WARNING',
      incidentStatus: 'P1',
      overallStatus: 'CRITICAL',
      metrics: {
        totalCameras: 16,
        activeP1Incidents: 1,
        activeP2Incidents: 0,
        activeP3Incidents: 0,
        offlineCamerasCount: 2,
        offlineRecordersCount: 1,
        internetOutagesCount: 0,
        retentionViolationsCount: 1,
        aiAlertsLast24h: 6,
        configDriftCount: 1,
        clockDriftCount: 1,
      },
      childrenCount: 2,
      digitalTwinNodeId: 'dt-branch-118',
    };

    const br121: MapNodeEntity = {
      id: 'BR-121',
      name: 'Branch 121 (Trivandrum City)',
      code: 'BR-121',
      level: 'BRANCH',
      parentId: 'node-region-south-kerala',
      latitude: 8.5241,
      longitude: 76.9366,
      infrastructureStatus: 'HEALTHY',
      incidentStatus: 'NONE',
      overallStatus: 'HEALTHY',
      metrics: {
        totalCameras: 16,
        activeP1Incidents: 0,
        activeP2Incidents: 0,
        activeP3Incidents: 0,
        offlineCamerasCount: 0,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 2,
        configDriftCount: 0,
        clockDriftCount: 0,
      },
      childrenCount: 1,
      digitalTwinNodeId: 'dt-branch-121',
    };

    this.nodes.set(br118.id, br118);
    this.nodes.set(br121.id, br121);

    // =========================================================================
    // 5. Tier: Floors & Cameras for BR-118
    // =========================================================================
    const br118GroundFloor: FloorPlanEntity = {
      floorId: 'floor-br-118-ground',
      branchId: 'BR-118',
      floorNumber: 0,
      name: 'Ground Floor Banking Hall & Cash Counter',
      planImageUrl: '/assets/floorplans/branch_ground_floor.svg',
      widthMeters: 35,
      heightMeters: 25,
      cameras: [
        {
          cameraId: 'CAM-118-01',
          cameraName: 'Main Entrance & ATM Foyer',
          channel: 1,
          xPercent: 18,
          yPercent: 82,
          rotationDegrees: 45,
          fieldOfViewDegrees: 90,
          coverageDepthMeters: 18,
          status: 'ONLINE',
          recorderId: 'NVR-01',
          clockOffsetSeconds: 1.2,
          bitrateKbps: 2048,
        },
        {
          cameraId: 'CAM-118-04',
          cameraName: 'Cash Counter Teller 4',
          channel: 4,
          xPercent: 55,
          yPercent: 42,
          rotationDegrees: 180,
          fieldOfViewDegrees: 75,
          coverageDepthMeters: 12,
          status: 'ONLINE',
          recorderId: 'NVR-01',
          clockOffsetSeconds: 1.4,
          bitrateKbps: 4096,
        },
        {
          cameraId: 'CAM-118-08',
          cameraName: 'Customer Lounge & Helpdesk',
          channel: 8,
          xPercent: 40,
          yPercent: 65,
          rotationDegrees: 90,
          fieldOfViewDegrees: 80,
          coverageDepthMeters: 15,
          status: 'OFFLINE',
          lastAlert: 'Camera Signal Loss Telemetry',
          recorderId: 'NVR-01',
        },
      ],
    };

    const br118VaultFloor: FloorPlanEntity = {
      floorId: 'floor-br-118-vault',
      branchId: 'BR-118',
      floorNumber: -1,
      name: 'Basement Vault & Strongroom',
      planImageUrl: '/assets/floorplans/branch_vault_strongroom.svg',
      widthMeters: 25,
      heightMeters: 20,
      cameras: [
        {
          cameraId: 'CAM-118-14',
          cameraName: 'Vault Strongroom Grille Door',
          channel: 14,
          xPercent: 78,
          yPercent: 28,
          rotationDegrees: 225,
          fieldOfViewDegrees: 90,
          coverageDepthMeters: 15,
          status: 'ALERTING',
          activeIncidentId: 'INC-2026-009821',
          activeIncidentPriority: 'P1',
          lastAlert: 'P1 Vault Intrusion Detected',
          recorderId: 'NVR-01',
          clockOffsetSeconds: 1.8,
          bitrateKbps: 4096,
        },
        {
          cameraId: 'CAM-118-16',
          cameraName: 'Locker Room Inner Corridor',
          channel: 16,
          xPercent: 30,
          yPercent: 35,
          rotationDegrees: 0,
          fieldOfViewDegrees: 80,
          coverageDepthMeters: 12,
          status: 'DEGRADED',
          lastAlert: 'NVR Frame Drop Warning',
          recorderId: 'NVR-01',
        },
      ],
    };

    this.floorPlans.set(br118GroundFloor.floorId, br118GroundFloor);
    this.floorPlans.set(br118VaultFloor.floorId, br118VaultFloor);
    this.branchFloorMap.set('BR-118', [br118GroundFloor.floorId, br118VaultFloor.floorId]);

    // =========================================================================
    // 6. Pre-seed "Why Red?" Root-Causes
    // =========================================================================
    const br118Causes: HealthCause[] = [
      {
        code: 'P1_VAULT_INTRUSION',
        severity: 'CRITICAL',
        sourceType: 'INCIDENT',
        sourceId: 'INC-2026-009821',
        message: 'Active P1 Vault Intrusion Alarm in Strongroom',
        observedAt: new Date(Date.now() - 300000), // 5 min ago
        drillDownTarget: { level: 'CAMERA', id: 'CAM-118-14' },
      },
      {
        code: 'RECORDER_NVR_OFFLINE',
        severity: 'CRITICAL',
        sourceType: 'RECORDER',
        sourceId: 'NVR-01',
        message: 'Primary CP PLUS NVR recorder unreachable on management network',
        observedAt: new Date(Date.now() - 600000),
        drillDownTarget: { level: 'BRANCH', id: 'BR-118' },
      },
      {
        code: 'CAMERA_OFFLINE',
        severity: 'WARNING',
        sourceType: 'CAMERA',
        sourceId: 'CAM-118-08',
        message: 'Camera CAM-118-08 Customer Lounge offline for > 15m',
        observedAt: new Date(Date.now() - 900000),
        drillDownTarget: { level: 'CAMERA', id: 'CAM-118-08' },
      },
      {
        code: 'RETENTION_POLICY_BREACH',
        severity: 'CRITICAL',
        sourceType: 'RETENTION',
        sourceId: 'RET-01',
        message: 'CAM-118-16 retained footage (17 days) below bank policy minimum (90 days)',
        observedAt: new Date(Date.now() - 1200000),
        drillDownTarget: { level: 'CAMERA', id: 'CAM-118-16' },
      },
    ];

    this.nodeCauses.set('BR-118', br118Causes);

    // Propagate causes to Region & State
    this.nodeCauses.set('node-region-south-kerala', [
      {
        code: 'CHILD_BRANCH_CRITICAL',
        severity: 'CRITICAL',
        sourceType: 'INCIDENT',
        sourceId: 'BR-118',
        message: 'Branch 118 (Kollam Main) has active P1 incident and recorder outage',
        observedAt: new Date(),
        drillDownTarget: { level: 'BRANCH', id: 'BR-118' },
      },
    ]);

    this.nodeCauses.set('node-state-kerala', [
      {
        code: 'REGIONAL_P1_ACTIVE',
        severity: 'CRITICAL',
        sourceType: 'INCIDENT',
        sourceId: 'node-region-south-kerala',
        message: 'South Kerala Region has active P1 incident at BR-118 Kollam Main',
        observedAt: new Date(),
        drillDownTarget: { level: 'REGION', id: 'node-region-south-kerala' },
      },
    ]);
  }

  /**
   * 1. Get Country Root Node (India).
   */
  async getRootNode(): Promise<MapNodeEntity> {
    return this.nodes.get('node-country-india')!;
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
    if (!node) return null;

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
      regionId: node.parentId || 'unknown-region',
      stateId: 'node-state-kerala',
      latitude: node.latitude,
      longitude: node.longitude,
      overallStatus: node.overallStatus,
      infrastructureStatus: node.infrastructureStatus,
      incidentStatus: node.incidentStatus,
      internetAvailable: node.metrics.internetOutagesCount === 0,
      gatewayHealthy: true,
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
    const root = await this.getRootNode();
    return {
      totalBranches: root.metrics.totalBranches || 400,
      healthyBranches: 372,
      warningBranches: 18,
      criticalBranches: 10,
      internetOutages: root.metrics.internetOutagesCount,
      p1Incidents: root.metrics.activeP1Incidents,
      p2Incidents: root.metrics.activeP2Incidents,
      cameraOutages: root.metrics.offlineCamerasCount,
      recorderOutages: root.metrics.offlineRecordersCount,
      retentionViolations: root.metrics.retentionViolationsCount,
      aiIncidentsLast24h: root.metrics.aiAlertsLast24h,
      configDriftCount: root.metrics.configDriftCount,
      clockDriftCount: root.metrics.clockDriftCount,
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
