/**
 * Abandoned & Unattended Object Detection Domain Types
 * 
 * Type definitions for stationary foreground blob tracking, sensitive zone enforcement,
 * owner proximity correlation, incident audits, and hardware calibration.
 */

export type ZoneType =
  | 'sterile_zone'
  | 'atm_vestibule'
  | 'cash_counter'
  | 'vault_perimeter'
  | 'emergency_exit'
  | 'customer_lobby'
  | 'hallway'
  | 'baggage_area';

export type ZoneSensitivity = 'low' | 'medium' | 'high' | 'critical';

export type AbandonedObjectType =
  | 'backpack'
  | 'suitcase'
  | 'box'
  | 'parcel'
  | 'handbag'
  | 'generic_blob'
  | 'duffel_bag';

export type AbandonedEventType =
  | 'unattended_object'
  | 'abandoned_object'
  | 'removed_object'
  | 'suspicious_package';

export type AbandonedSeverity = 'P1' | 'P2' | 'P3' | 'P4';

export type AbandonedStatus =
  | 'detected'
  | 'investigating'
  | 'cleared'
  | 'false_positive'
  | 'escalated';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface AbandonedObjectZoneRecord {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id?: string | null;
  zone_name: string;
  zone_type: ZoneType;
  polygon: PolygonPoint[];
  sensitivity: ZoneSensitivity;
  unattended_threshold_seconds: number;
  abandoned_threshold_seconds: number;
  min_blob_area_pixels: number;
  max_blob_area_pixels: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface AbandonedObjectEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  zone_id?: string | null;
  branch_id?: string | null;
  event_type: AbandonedEventType;
  object_type: AbandonedObjectType;
  severity: AbandonedSeverity;
  confidence: number;
  bounding_box: BoundingBox;
  dwell_time_seconds: number;
  owner_track_id?: string | null;
  owner_distance_pixels?: number | null;
  status: AbandonedStatus;
  snapshot_url?: string | null;
  thermal_score?: number | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  first_seen_at: Date;
  detected_at: Date;
  created_at: Date;
}

export interface AbandonedObjectConfigRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  stationary_pixel_threshold: number;
  default_unattended_threshold_sec: number;
  default_abandoned_threshold_sec: number;
  owner_proximity_threshold_px: number;
  debounce_frames: number;
  alert_on_sterile_zone_entry: boolean;
  alert_on_exit_corridor_obstruction: boolean;
  thermal_verification_enabled: boolean;
  updated_at: Date;
}

export interface ListAbandonedEventsFilter {
  tenantId: string;
  cameraId?: string;
  branchId?: string;
  zoneId?: string;
  eventType?: AbandonedEventType;
  severity?: AbandonedSeverity;
  status?: AbandonedStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ListAbandonedZonesFilter {
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  zoneType?: ZoneType;
  enabledOnly?: boolean;
}

export interface AbandonedStats {
  totalActive: number;
  criticalP1Count: number;
  highP2Count: number;
  avgDwellTimeSeconds: number;
  totalCleared: number;
  totalEscalated: number;
  zonesMonitored: number;
  lastEventAt?: string | null;
}

export interface DetectedPersonObservation {
  trackId: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface TrackedBlob {
  blobId: string;
  firstSeen: Date;
  lastSeen: Date;
  stationarySince: Date;
  positions: Array<{ bbox: BoundingBox; timestamp: Date }>;
  currentBbox: BoundingBox;
  centroid: { x: number; y: number };
  area: number;
  isStationary: boolean;
  stationaryDurationSec: number;
  consecutiveStationaryFrames: number;
  assignedZone?: AbandonedObjectZoneRecord | null;
  associatedOwnerId?: string | null;
  ownerDistancePx?: number | null;
  ownerLastSeen?: Date | null;
  classification: AbandonedObjectType;
  status: AbandonedStatus;
  alerted: boolean;
  alertSeverity?: AbandonedSeverity;
  alertType?: AbandonedEventType;
}

export interface FrameAnalysisResult {
  isUnattendedOrAbandoned: boolean;
  blobs: Array<{
    blobId: string;
    objectType: AbandonedObjectType;
    eventType: AbandonedEventType;
    severity: AbandonedSeverity;
    confidence: number;
    boundingBox: BoundingBox;
    dwellTimeSeconds: number;
    zoneName?: string;
    zoneType?: ZoneType;
    ownerTrackId?: string | null;
    ownerDistancePixels?: number | null;
    requiresAlert: boolean;
  }>;
  summary: {
    totalStaticBlobs: number;
    activeAlerts: number;
    highestSeverity?: AbandonedSeverity | null;
  };
}
