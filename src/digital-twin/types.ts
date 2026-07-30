export type TwinObjectType =
  | "camera" | "dvr" | "nvr" | "door" | "access_reader" | "panic_button"
  | "fire_sensor" | "smoke_sensor" | "motion_sensor" | "temperature_sensor"
  | "humidity_sensor" | "ups" | "network_switch" | "router" | "server"
  | "atm" | "vault" | "safe" | "emergency_exit" | "entrance" | "window"
  | "desk" | "counter" | "zone_marker" | "custom";

export type TwinDeviceType = "camera" | "recorder" | "door" | "access_control" | "sensor" | "ups" | "network" | "disk" | "equipment";
export type TwinSeverity = "info" | "warning" | "critical";
export type TwinViewMode = "2d" | "2.5d" | "3d";
export type TwinHeatmapType = "people_security" | "operational" | "incidents" | "door_usage";

export interface TwinSite {
  id: string; tenantId: string; name: string; description: string | null; address: string | null;
  timezone: string; createdAt: string; updatedAt: string;
}
export interface TwinBuilding {
  id: string; siteId: string; branchId: string; name: string; description: string | null;
  buildingType: string; totalFloors: number; createdAt: string; updatedAt: string;
}
export interface TwinFloor {
  id: string; buildingId: string; floorNumber: number; name: string; description: string | null;
  floorHeightMeters: number | null; areaSquareMeters: number | null; createdAt: string; updatedAt: string;
}
export interface TwinFloorPlan {
  id: string; floorId: string; version: number; contentUrl: string; storageKey: string;
  fileType: "png" | "jpg" | "jpeg" | "svg" | "pdf"; contentType: string; fileSizeBytes: number;
  widthPixels: number | null; heightPixels: number | null; scaleMetersPerPixel: number | null;
  originX: number; originY: number; rotationDegrees: number; isActive: boolean;
  originalFilename: string; uploadedBy: string; uploadedAt: string;
}
export interface TwinBinding {
  id: string; twinObjectId: string; tenantId: string; branchId: string; deviceType: TwinDeviceType; deviceId: string;
  statusSource: string | null; alertSource: string | null; autoUpdate: boolean; metadata: Record<string, unknown>;
}
export interface TwinObject {
  id: string; floorId: string; objectType: TwinObjectType; name: string; description: string | null;
  positionX: number; positionY: number; positionZ: number; rotation: number; scale: number;
  iconName: string | null; color: string | null; fieldOfView: number | null; viewingDistance: number | null;
  cameraAngle: number | null; showStatus: boolean; showLabel: boolean; showFieldOfView: boolean;
  metadata: Record<string, unknown>; binding: TwinBinding | null; createdAt: string; updatedAt: string;
}
export interface TwinZone {
  id: string; floorId: string; name: string; description: string | null; zoneType: string;
  vertices: Array<{ x: number; y: number }>; fillColor: string; fillOpacity: number;
  strokeColor: string; strokeWidth: number; isRestricted: boolean; alertOnEntry: boolean;
  alertOnDwell: boolean; maxDwellSeconds: number | null; analyticsEnabled: boolean;
  analyticsConfig: Record<string, unknown>; createdAt: string; updatedAt: string;
}
export interface TwinAlertMarker {
  id: string; floorId: string; twinObjectId: string | null; alertType: string; severity: TwinSeverity;
  title: string; description: string | null; positionX: number | null; positionY: number | null;
  triggeredAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  pulseEffect: boolean; autoZoom: boolean; source: string; sourceAlertId: string | null;
  snapshotReference: string | null; clipReference: string | null; metadata: Record<string, unknown>;
}
export interface TwinEvent {
  id: string; tenantId: string; branchId: string; floorId: string; twinObjectId: string | null;
  deviceType: string | null; deviceId: string | null; eventType: string; state: string | null;
  previousState: string | null; severity: TwinSeverity; positionX: number | null; positionY: number | null;
  source: string; idempotencyKey: string; metadata: Record<string, unknown>; occurredAt: string; receivedAt: string;
}
export interface TwinObjectStatus {
  state: string; color: string; label: string; online: boolean | null; recording: boolean | null;
  analyticsActive: boolean; observedAt: string | null; source: string; details: Record<string, unknown>;
}
export interface TwinHeatmap {
  type: TwinHeatmapType; generatedAt: string; from: string; to: string;
  points: Array<{ x: number; y: number; intensity: number; count: number; label?: string }>;
  maxIntensity: number; totalEvents: number; source: string[];
}
export interface TwinFloorState {
  branch: { id: string; name: string }; building: TwinBuilding; floor: TwinFloor; floorPlan: TwinFloorPlan | null;
  objects: Array<TwinObject & { currentStatus: TwinObjectStatus }>;
  zones: TwinZone[]; alerts: TwinAlertMarker[]; heatmap: TwinHeatmap | null;
  summary: { totalObjects: number; online: number; warning: number; critical: number; unknown: number; activeAlerts: number };
  permissions: { canView: boolean; canEdit: boolean; canPlayback: boolean };
  generatedAt: string;
}
export interface TwinBranchSummary {
  branch: { id: string; name: string }; building: TwinBuilding | null; floors: TwinFloor[];
  configured: boolean; objectCount: number; activeAlerts: number; criticalObjects: number; updatedAt: string | null;
}
