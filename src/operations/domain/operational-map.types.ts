/**
 * Multi-Tier Operational Map Domain Types (Milestone Smart Map Parity)
 * Backed by Digital Twin, Topology, Health State, and Incident Management.
 */

export type MapTierLevel =
  | 'COUNTRY'
  | 'STATE'
  | 'REGION'
  | 'BRANCH'
  | 'FLOOR'
  | 'CAMERA';

export type OperationalHealthStatus =
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'OFFLINE'
  | 'UNKNOWN';

export type SecurityIncidentStatus = 'NONE' | 'P3' | 'P2' | 'P1';

export interface HealthCause {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  sourceType: 'INCIDENT' | 'RECORDER' | 'CAMERA' | 'NETWORK' | 'RETENTION' | 'CLOCK' | 'CONFIG';
  sourceId: string;
  message: string;
  observedAt: Date;
  drillDownTarget?: {
    level: MapTierLevel;
    id: string;
  };
}

export interface MapNodeMetrics {
  totalBranches?: number;
  totalCameras: number;
  activeP1Incidents: number;
  activeP2Incidents: number;
  activeP3Incidents: number;
  offlineCamerasCount: number;
  offlineRecordersCount: number;
  internetOutagesCount: number;
  retentionViolationsCount: number;
  aiAlertsLast24h: number;
  configDriftCount: number;
  clockDriftCount: number;
}

export interface MapNodeEntity {
  id: string;
  name: string;
  code?: string;
  level: MapTierLevel;
  parentId?: string;
  latitude: number;
  longitude: number;
  infrastructureStatus: OperationalHealthStatus;
  incidentStatus: SecurityIncidentStatus;
  overallStatus: OperationalHealthStatus;
  metrics: MapNodeMetrics;
  childrenCount: number;
  digitalTwinNodeId?: string;
}

export interface FloorCameraPlacement {
  cameraId: string;
  cameraName: string;
  channel: number;
  xPercent: number; // 0-100% on floor plan
  yPercent: number; // 0-100% on floor plan
  rotationDegrees: number; // 0-360 degrees orientation
  fieldOfViewDegrees: number; // e.g. 75, 90, 110 degrees FOV cone
  coverageDepthMeters: number; // e.g. 15m
  status: 'ONLINE' | 'OFFLINE' | 'TAMPERED' | 'ALERTING' | 'DEGRADED';
  activeIncidentId?: string;
  activeIncidentPriority?: 'P1' | 'P2' | 'P3';
  lastAlert?: string;
  recorderId?: string;
  clockOffsetSeconds?: number;
  bitrateKbps?: number;
}

export interface FloorPlanEntity {
  floorId: string;
  branchId: string;
  floorNumber: number;
  name: string;
  planImageUrl: string;
  widthMeters: number;
  heightMeters: number;
  cameras: FloorCameraPlacement[];
}

export interface BranchOperationalSummary {
  branchId: string;
  name: string;
  regionId: string;
  stateId: string;
  latitude: number;
  longitude: number;
  overallStatus: OperationalHealthStatus;
  infrastructureStatus: OperationalHealthStatus;
  incidentStatus: SecurityIncidentStatus;
  internetAvailable: boolean;
  gatewayHealthy: boolean;
  recorderHealthy: boolean;
  camerasTotal: number;
  camerasOnline: number;
  recordingCompliantChannels: number;
  retentionViolations: number;
  activeIncidents: { p1: number; p2: number; p3: number };
  causes: HealthCause[];
  floorPlans: Array<{ floorId: string; name: string; floorNumber: number; cameraCount: number }>;
}

export interface MapOverlayFilter {
  overlayType?:
    | 'OVERALL_HEALTH'
    | 'INTERNET_OUTAGES'
    | 'P1_P2_INCIDENTS'
    | 'CAMERA_OUTAGES'
    | 'RECORDER_OUTAGES'
    | 'RETENTION_VIOLATIONS'
    | 'AI_INCIDENTS'
    | 'CONFIG_DRIFT'
    | 'CLOCK_DRIFT';
  minSeverity?: 'WARNING' | 'CRITICAL';
}
