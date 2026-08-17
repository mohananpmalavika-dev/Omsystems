/**
 * Multi-Tier Operational Map Domain Types (Milestone Smart Map Parity)
 */

export type MapTierLevel =
  | "COUNTRY"
  | "STATE"
  | "REGION"
  | "BRANCH"
  | "FLOOR"
  | "CAMERA";

export interface MapNodeEntity {
  id: string;
  name: string;
  level: MapTierLevel;
  parentId?: string;
  latitude: number;
  longitude: number;
  healthStatus: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  metrics: {
    totalBranches?: number;
    totalCameras: number;
    activeP1Incidents: number;
    activeP2Incidents: number;
    offlineCamerasCount: number;
    offlineRecordersCount: number;
    internetOutagesCount: number;
    retentionViolationsCount: number;
    aiAlertsLast24h: number;
  };
  childrenCount: number;
}

export interface FloorPlanEntity {
  floorId: string;
  branchId: string;
  floorNumber: number;
  name: string;
  planImageUrl: string;
  widthMeters: number;
  heightMeters: number;
  cameras: Array<{
    cameraId: string;
    cameraName: string;
    xPercent: number;
    yPercent: number;
    fieldOfViewDegrees: number;
    rotationDegrees: number;
    status: "ONLINE" | "OFFLINE" | "TAMPERED" | "ALERTING";
    lastAlert?: string;
  }>;
}

export interface MapOverlayFilter {
  showInternetOutages: boolean;
  showP1Incidents: boolean;
  showP2Incidents: boolean;
  showCameraOutages: boolean;
  showRecorderOutages: boolean;
  showRetentionViolations: boolean;
  showAiIncidents: boolean;
}
