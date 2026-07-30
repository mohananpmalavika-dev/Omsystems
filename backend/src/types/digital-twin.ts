/**
 * Digital Twin Type Definitions
 * 
 * Supports 2D/3D branch visualization with device positioning,
 * live status overlays, AI alerts, and heat maps
 */

export interface DigitalTwinSite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface DigitalTwinBuilding {
  id: string;
  siteId: string;
  branchId?: string;
  name: string;
  description?: string;
  buildingType?: 'branch' | 'datacenter' | 'warehouse' | 'office';
  totalFloors: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigitalTwinFloor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  description?: string;
  floorHeightMeters?: number;
  areaSquareMeters?: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type FloorPlanFileType = 'png' | 'jpg' | 'svg' | 'pdf' | 'dxf' | 'ifc' | 'dwg';

export interface DigitalTwinFloorPlan {
  id: string;
  floorId: string;
  version: number;
  fileUrl: string;
  fileType: FloorPlanFileType;
  fileSizeBytes?: number;
  widthPixels?: number;
  heightPixels?: number;
  scaleMetersPerPixel?: number;
  originX: number;
  originY: number;
  rotationDegrees: number;
  isActive: boolean;
  metadata: Record<string, any>;
  uploadedBy?: string;
  uploadedAt: Date;
}

export type TwinObjectType =
  | 'camera'
  | 'dvr'
  | 'nvr'
  | 'door'
  | 'access_reader'
  | 'panic_button'
  | 'fire_sensor'
  | 'smoke_sensor'
  | 'motion_sensor'
  | 'temperature_sensor'
  | 'humidity_sensor'
  | 'ups'
  | 'network_switch'
  | 'router'
  | 'server'
  | 'atm'
  | 'vault'
  | 'safe'
  | 'emergency_exit'
  | 'entrance'
  | 'window'
  | 'desk'
  | 'counter'
  | 'zone_marker'
  | 'custom';

export interface DigitalTwinObject {
  id: string;
  floorId: string;
  objectType: TwinObjectType;
  name: string;
  description?: string;
  
  // Normalized position (0.0 to 1.0)
  positionX: number;
  positionY: number;
  positionZ?: number; // Height in meters
  
  // Rotation in degrees (0-360)
  rotation: number;
  
  // Scale factor
  scale: number;
  
  // Visual properties
  iconName?: string;
  color?: string;
  sizeOverride?: number;
  
  // Camera-specific
  fieldOfView?: number;
  viewingDistance?: number;
  cameraAngle?: number;
  
  // Display config
  showStatus: boolean;
  showLabel: boolean;
  showFieldOfView: boolean;
  
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type DeviceType = 'camera' | 'recorder' | 'access_control' | 'sensor';

export interface DigitalTwinDeviceBinding {
  id: string;
  twinObjectId: string;
  deviceType: DeviceType;
  deviceId: string;
  deviceTable: string;
  statusSource?: string;
  alertSource?: string;
  statusMapping: Record<string, any>;
  autoUpdate: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NormalizedPosition {
  x: number;
  y: number;
}

export interface DigitalTwinZone {
  id: string;
  floorId: string;
  name: string;
  description?: string;
  zoneType?: string;
  vertices: NormalizedPosition[];
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  isRestricted: boolean;
  alertOnEntry: boolean;
  alertOnDwell: boolean;
  maxDwellSeconds?: number;
  analyticsEnabled: boolean;
  analyticsConfig: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface DigitalTwinCameraView {
  id: string;
  twinObjectId: string;
  floorId: string;
  coveragePolygon: NormalizedPosition[];
  blindSpots: NormalizedPosition[][];
  coveragePercentage?: number;
  overlappingCameras: string[];
  detectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  identificationQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  lastCalculated: Date;
  metadata: Record<string, any>;
}

export type HeatmapType = 'people_movement' | 'dwell_time' | 'incidents' | 'device_failures' | 'queue_density' | 'intrusions';

export interface DigitalTwinHeatmap {
  id: string;
  floorId: string;
  heatmapType: HeatmapType;
  timePeriodStart: Date;
  timePeriodEnd: Date;
  gridResolution: number;
  gridData: number[][]; // 2D array of intensity values
  maxIntensity: number;
  avgIntensity: number;
  totalEvents: number;
  sourceCameras: string[];
  sourceZones: string[];
  metadata: Record<string, any>;
  generatedAt: Date;
}

export type AlertType = 'intrusion' | 'fire' | 'panic' | 'door_forced' | 'camera_offline' | 'sensor_triggered' | 'unauthorized_access';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DigitalTwinAlertMarker {
  id: string;
  floorId: string;
  twinObjectId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;
  incidentId?: string;
  pulseEffect: boolean;
  autoZoom: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface DigitalTwinSceneVersion {
  id: string;
  floorId: string;
  snapshotTime: Date;
  objectStates: ObjectState[];
  activeAlerts: AlertMarker[];
  doorStates: Record<string, DoorState>;
  sensorStates: Record<string, SensorState>;
  cameraStates: Record<string, CameraState>;
  eventSummary?: string;
  relatedIncidentId?: string;
  compressionApplied: boolean;
  createdAt: Date;
}

export interface ObjectState {
  objectId: string;
  position: NormalizedPosition;
  rotation: number;
  status: string;
  statusColor: string;
  metadata?: Record<string, any>;
}

export interface AlertMarker {
  objectId?: string;
  position: NormalizedPosition;
  alertType: string;
  severity: string;
  title: string;
  triggeredAt: Date;
}

export interface DoorState {
  status: 'open' | 'closed' | 'forced' | 'held_open' | 'offline';
  lastChanged: Date;
  authorizedUser?: string;
}

export interface SensorState {
  status: 'normal' | 'triggered' | 'tampered' | 'offline' | 'battery_low';
  lastTriggered?: Date;
  batteryLevel?: number;
}

export interface CameraState {
  status: 'online' | 'offline' | 'recording' | 'not_recording' | 'degraded';
  isRecording: boolean;
  analyticsEnabled: boolean;
  activeAlerts: string[];
  streamUrl?: string;
}

export type ViewMode = '2d' | '2.5d' | '3d';

export interface DigitalTwinUserPreferences {
  id: string;
  userId: string;
  defaultViewMode: ViewMode;
  showDeviceLabels: boolean;
  showFieldOfView: boolean;
  showZones: boolean;
  showHeatmaps: boolean;
  favoriteFloors: string[];
  savedViews: SavedView[];
  autoZoomOnAlert: boolean;
  alertNotificationSound: boolean;
  maxSimultaneousStreams: number;
  enable3dAcceleration: boolean;
  preferences: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedView {
  id: string;
  name: string;
  floorId: string;
  zoom: number;
  centerX: number;
  centerY: number;
  viewMode: ViewMode;
  visibleLayers: string[];
}

export interface DigitalTwinPermissions {
  id: string;
  roleId?: string;
  userId?: string;
  canViewFloors: boolean;
  canEditFloors: boolean;
  canPlaceDevices: boolean;
  canEditZones: boolean;
  canView3d: boolean;
  canExportPlans: boolean;
  canPlaybackTimeline: boolean;
  siteId?: string;
  buildingId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface DigitalTwinAuditLog {
  id: string;
  userId?: string;
  action: 'create' | 'update' | 'delete' | 'move' | 'bind';
  entityType: string;
  entityId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  changeSummary?: string;
  floorId?: string;
  buildingId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Request/Response DTOs

export interface CreateSiteRequest {
  organizationId: string;
  name: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  metadata?: Record<string, any>;
}

export interface CreateBuildingRequest {
  siteId: string;
  branchId?: string;
  name: string;
  description?: string;
  buildingType?: string;
  totalFloors: number;
  metadata?: Record<string, any>;
}

export interface CreateFloorRequest {
  buildingId: string;
  floorNumber: number;
  name: string;
  description?: string;
  floorHeightMeters?: number;
  areaSquareMeters?: number;
  metadata?: Record<string, any>;
}

export interface UploadFloorPlanRequest {
  floorId: string;
  fileType: FloorPlanFileType;
  scaleMetersPerPixel?: number;
  originX?: number;
  originY?: number;
  rotationDegrees?: number;
  metadata?: Record<string, any>;
}

export interface CreateObjectRequest {
  floorId: string;
  objectType: TwinObjectType;
  name: string;
  description?: string;
  positionX: number;
  positionY: number;
  positionZ?: number;
  rotation?: number;
  scale?: number;
  iconName?: string;
  color?: string;
  fieldOfView?: number;
  viewingDistance?: number;
  cameraAngle?: number;
  showStatus?: boolean;
  showLabel?: boolean;
  showFieldOfView?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateObjectPositionRequest {
  positionX: number;
  positionY: number;
  rotation?: number;
}

export interface CreateDeviceBindingRequest {
  twinObjectId: string;
  deviceType: DeviceType;
  deviceId: string;
  deviceTable: string;
  statusSource?: string;
  alertSource?: string;
  statusMapping?: Record<string, any>;
  autoUpdate?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateZoneRequest {
  floorId: string;
  name: string;
  description?: string;
  zoneType?: string;
  vertices: NormalizedPosition[];
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  isRestricted?: boolean;
  alertOnEntry?: boolean;
  alertOnDwell?: boolean;
  maxDwellSeconds?: number;
  analyticsEnabled?: boolean;
  analyticsConfig?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface FloorStateResponse {
  floorId: string;
  objects: (DigitalTwinObject & {
    deviceBinding?: DigitalTwinDeviceBinding;
    currentStatus?: any;
  })[];
  zones: DigitalTwinZone[];
  alerts: DigitalTwinAlertMarker[];
  cameraViews: DigitalTwinCameraView[];
  heatmap?: DigitalTwinHeatmap;
  timestamp: Date;
}

export interface CreateAlertMarkerRequest {
  floorId: string;
  twinObjectId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  incidentId?: string;
  pulseEffect?: boolean;
  autoZoom?: boolean;
  metadata?: Record<string, any>;
}

export interface GenerateHeatmapRequest {
  floorId: string;
  heatmapType: HeatmapType;
  timePeriodStart: Date;
  timePeriodEnd: Date;
  gridResolution?: number;
  sourceCameras?: string[];
  sourceZones?: string[];
}

export interface CalculateCoverageRequest {
  floorId: string;
  cameraObjectIds?: string[];
}

export interface CoverageAnalysisResponse {
  floorId: string;
  totalAreaCovered: number;
  totalAreaUncovered: number;
  coveragePercentage: number;
  cameraViews: DigitalTwinCameraView[];
  blindSpots: {
    polygon: NormalizedPosition[];
    areaSquareMeters: number;
  }[];
  recommendations: string[];
}

export interface TimelinePlaybackRequest {
  floorId: string;
  startTime: Date;
  endTime: Date;
  speed?: number; // 1.0 = real-time, 2.0 = 2x speed
  includeEvents?: string[]; // Event types to include
}

export interface TimelineFrame {
  timestamp: Date;
  objectStates: ObjectState[];
  alerts: AlertMarker[];
  doorStates: Record<string, DoorState>;
  sensorStates: Record<string, SensorState>;
  cameraStates: Record<string, CameraState>;
  events: TimelineEvent[];
}

export interface TimelineEvent {
  timestamp: Date;
  eventType: string;
  objectId?: string;
  description: string;
  severity?: string;
  metadata?: Record<string, any>;
}

// WebSocket event types for real-time updates

export interface DigitalTwinRealtimeEvent {
  type: 'object_status_change' | 'alert_triggered' | 'alert_resolved' | 'door_state_change' | 'sensor_triggered' | 'camera_offline';
  floorId: string;
  objectId?: string;
  data: any;
  timestamp: Date;
}

export interface ObjectStatusChangeEvent {
  objectId: string;
  floorId: string;
  previousStatus: string;
  newStatus: string;
  statusColor: string;
  deviceInfo?: any;
  timestamp: Date;
}

export interface AlertTriggeredEvent {
  alertId: string;
  floorId: string;
  objectId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description?: string;
  position?: NormalizedPosition;
  autoZoom: boolean;
  streamUrl?: string;
  nearbyCamera?: string[];
  timestamp: Date;
}

export interface DoorStateChangeEvent {
  doorObjectId: string;
  floorId: string;
  previousState: string;
  newState: string;
  authorizedUser?: string;
  timestamp: Date;
}
