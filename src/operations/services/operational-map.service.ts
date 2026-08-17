import type {
  MapNodeEntity,
  FloorPlanEntity,
  MapTierLevel,
} from "../domain/operational-map.types.js";

export class OperationalMapService {
  private readonly nodes = new Map<string, MapNodeEntity>();
  private readonly floorPlans = new Map<string, FloorPlanEntity>(); // branchId -> floorPlan

  constructor() {
    this.seedHierarchy();
  }

  private seedHierarchy(): void {
    // 1. Level: Country (India)
    const india: MapNodeEntity = {
      id: "node-india",
      name: "India National SOC",
      level: "COUNTRY",
      latitude: 20.5937,
      longitude: 78.9629,
      healthStatus: "WARNING",
      metrics: {
        totalBranches: 400,
        totalCameras: 8000,
        activeP1Incidents: 2,
        activeP2Incidents: 5,
        offlineCamerasCount: 14,
        offlineRecordersCount: 1,
        internetOutagesCount: 2,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 88,
      },
      childrenCount: 2,
    };
    this.nodes.set(india.id, india);

    // 2. Level: States
    const kerala: MapNodeEntity = {
      id: "node-state-kerala",
      name: "Kerala State Zone",
      level: "STATE",
      parentId: "node-india",
      latitude: 10.8505,
      longitude: 76.2711,
      healthStatus: "CRITICAL",
      metrics: {
        totalBranches: 120,
        totalCameras: 2400,
        activeP1Incidents: 1,
        activeP2Incidents: 2,
        offlineCamerasCount: 6,
        offlineRecordersCount: 1,
        internetOutagesCount: 1,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 34,
      },
      childrenCount: 1,
    };

    const maharashtra: MapNodeEntity = {
      id: "node-state-maharashtra",
      name: "Maharashtra State Zone",
      level: "STATE",
      parentId: "node-india",
      latitude: 19.7515,
      longitude: 75.7139,
      healthStatus: "HEALTHY",
      metrics: {
        totalBranches: 150,
        totalCameras: 3000,
        activeP1Incidents: 0,
        activeP2Incidents: 1,
        offlineCamerasCount: 2,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 22,
      },
      childrenCount: 1,
    };

    this.nodes.set(kerala.id, kerala);
    this.nodes.set(maharashtra.id, maharashtra);

    // 3. Level: Region
    const kochiRegion: MapNodeEntity = {
      id: "node-region-kochi",
      name: "Kochi Central Region",
      level: "REGION",
      parentId: "node-state-kerala",
      latitude: 9.9312,
      longitude: 76.2673,
      healthStatus: "CRITICAL",
      metrics: {
        totalBranches: 35,
        totalCameras: 700,
        activeP1Incidents: 1,
        activeP2Incidents: 1,
        offlineCamerasCount: 3,
        offlineRecordersCount: 1,
        internetOutagesCount: 1,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 18,
      },
      childrenCount: 1,
    };
    this.nodes.set(kochiRegion.id, kochiRegion);

    // 4. Level: Branch
    const branch034: MapNodeEntity = {
      id: "BR-034",
      name: "Branch 034 (MG Road, Kochi Main)",
      level: "BRANCH",
      parentId: "node-region-kochi",
      latitude: 9.9723,
      longitude: 76.2783,
      healthStatus: "CRITICAL",
      metrics: {
        totalCameras: 20,
        activeP1Incidents: 1,
        activeP2Incidents: 0,
        offlineCamerasCount: 1,
        offlineRecordersCount: 0,
        internetOutagesCount: 0,
        retentionViolationsCount: 0,
        aiAlertsLast24h: 6,
      },
      childrenCount: 1,
    };
    this.nodes.set(branch034.id, branch034);

    // 5. Floor Plan & Camera Layout for Branch 034
    const floorPlan034: FloorPlanEntity = {
      floorId: "floor-br-034-ground",
      branchId: "BR-034",
      floorNumber: 0,
      name: "Ground Floor Banking Hall & Vault",
      planImageUrl: "/assets/floorplans/bank_branch_standard.svg",
      widthMeters: 30,
      heightMeters: 20,
      cameras: [
        {
          cameraId: "cam-301-17",
          cameraName: "Vault Door Primary",
          xPercent: 82,
          yPercent: 25,
          fieldOfViewDegrees: 90,
          rotationDegrees: 180,
          status: "ALERTING",
          lastAlert: "P1 Vault Intrusion Alarm",
        },
        {
          cameraId: "cam-301-02",
          cameraName: "Cash Counter Teller 1",
          xPercent: 45,
          yPercent: 40,
          fieldOfViewDegrees: 75,
          rotationDegrees: 90,
          status: "ONLINE",
        },
        {
          cameraId: "cam-301-08",
          cameraName: "ATM Lobby Entry",
          xPercent: 15,
          yPercent: 75,
          fieldOfViewDegrees: 110,
          rotationDegrees: 0,
          status: "ONLINE",
        },
        {
          cameraId: "cam-301-09",
          cameraName: "Back Grille Gate",
          xPercent: 88,
          yPercent: 80,
          fieldOfViewDegrees: 80,
          rotationDegrees: 270,
          status: "OFFLINE",
        },
      ],
    };
    this.floorPlans.set(floorPlan034.branchId, floorPlan034);
  }

  async getChildrenNodes(parentId?: string): Promise<MapNodeEntity[]> {
    return Array.from(this.nodes.values()).filter((n) => n.parentId === parentId);
  }

  async getNodeDetails(id: string): Promise<MapNodeEntity | null> {
    return this.nodes.get(id) || null;
  }

  async getFloorPlan(branchId: string): Promise<FloorPlanEntity | null> {
    return this.floorPlans.get(branchId) || null;
  }

  async searchNodes(query: string): Promise<MapNodeEntity[]> {
    const q = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      (n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
    );
  }
}
