/**
 * Canonical Device Event Domain Types
 * 
 * Standardized, vendor-neutral event definitions for all surveillance hardware:
 * cameras, NVRs/DVRs, edge agents, access controllers, and relay sensors.
 */

export type DeviceEventType =
  | "MOTION"
  | "VIDEO_LOSS"
  | "TAMPER"
  | "STORAGE_FAULT"
  | "CAMERA_OFFLINE"
  | "RECORDING_FAILURE"
  | "ANALYTICS"
  | "RELAY"
  | "DOOR_ACCESS";

export type DeviceEventSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type VendorOrigin =
  | "CP_PLUS"
  | "DAHUA"
  | "HIKVISION"
  | "AXIS"
  | "ONVIF"
  | "EDGE_AGENT"
  | "GENERIC";

export interface AnalyticsDetails {
  analyticsType:
    | "INTRUSION"
    | "LINE_CROSSING"
    | "LOITERING"
    | "FACE_DETECTED"
    | "PLATE_RECOGNIZED"
    | "CROWD_GATHERING"
    | "OBJECT_LEFT"
    | "OBJECT_REMOVED"
    | "SMOKE_FIRE"
    | "OTHER";
  confidence?: number;
  zoneName?: string;
  targetBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  matchedIdentity?: string;
  licensePlate?: string;
  targetType?: "HUMAN" | "VEHICLE" | "UNKNOWN";
}

export interface TamperDetails {
  tamperType:
    | "MASKING_BLIND"
    | "DEFOCUS"
    | "SCENE_CHANGE"
    | "SPRAY_PAINT"
    | "ORIENTATION_CHANGE"
    | "FROZEN_VIDEO"
    | "BLACK_FRAME";
  confidence?: number;
}

export interface StorageFaultDetails {
  storageFaultType:
    | "DISK_FULL"
    | "DISK_ERROR"
    | "SMART_FAILURE"
    | "RAID_DEGRADED"
    | "NO_DISK"
    | "WRITE_ABORT";
  diskIndex?: number;
  diskPath?: string;
  reallocatedSectors?: number;
}

export interface RecordingFailureDetails {
  failureReason:
    | "WRITE_TIMEOUT"
    | "ENCODER_STALL"
    | "STORAGE_UNAVAILABLE"
    | "STREAM_DISCONNECT"
    | "CORRUPT_INDEX";
  expectedSegmentSeconds?: number;
  actualDurationSeconds?: number;
}

export interface RelayDetails {
  relayIndex: number;
  relayState: "TRIGGERED" | "OPEN" | "CLOSED" | "NORMAL";
  relayName?: string;
  inputOrOutput: "INPUT" | "OUTPUT";
}

export interface DoorAccessDetails {
  accessType:
    | "ACCESS_GRANTED"
    | "ACCESS_DENIED"
    | "DOOR_FORCED_OPEN"
    | "DOOR_HELD_OPEN"
    | "DURESS"
    | "LOCKDOWN"
    | "TAMPER_SWITCH";
  doorId?: string;
  doorName?: string;
  credentialType?: "BADGE_RFID" | "PIN" | "BIOMETRIC_FACE" | "FINGERPRINT";
  userId?: string;
  userName?: string;
  cardId?: string;
  readerId?: string;
}

export interface MotionDetails {
  motionRegion?: string;
  motionLevel?: number; // 0.0 to 1.0
  activePixelsPercent?: number;
}

export interface DeviceEventDetails {
  motion?: MotionDetails;
  tamper?: TamperDetails;
  storage?: StorageFaultDetails;
  recording?: RecordingFailureDetails;
  analytics?: AnalyticsDetails;
  relay?: RelayDetails;
  access?: DoorAccessDetails;
}

export interface DeviceEvent {
  id: string; // UUID
  tenantId: string;
  branchId: string;
  deviceId: string; // Recorder / Gateway / Controller ID
  cameraId?: string;
  channel?: number;
  type: DeviceEventType;
  sourceTimestamp: string; // ISO-8601 (from device hardware clock)
  receivedTimestamp: string; // ISO-8601 (when received by Sentinel)
  severity: DeviceEventSeverity;
  
  // Normalized payload details
  details?: DeviceEventDetails;

  // Evidentiary and telemetry metadata
  observedClockOffsetMs: number; // receivedTimestamp - sourceTimestamp
  vendorOrigin: VendorOrigin;
  rawEventCode?: string;
  rawPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface NormalizationContext {
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  cameraId?: string;
  channel?: number;
  zoneName?: string;
  isHighSecurityZone?: boolean; // Vault, Strongroom, Cash Counter
}
