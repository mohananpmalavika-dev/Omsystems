/**
 * Detection != Event != Alert Domain Contracts
 */

export interface NormalizedDetection {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;

  detectorId: string;
  detectorVersion?: string | undefined;

  detectionType: string;
  detectedAt: Date;

  confidence?: number | undefined;

  /**
   * Track ID assigned by computer vision tracker (e.g. person-1843, vehicle-927)
   */
  trackId?: string | undefined;

  objectClass?: string | undefined;

  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | undefined;

  zoneId?: string | undefined;

  metadata?: Record<string, unknown> | undefined;
}

export interface DetectionEvent {
  eventId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;

  eventType: string;
  trackId?: string | undefined;
  zoneId?: string | undefined;

  firstDetectedAt: Date;
  lastDetectedAt: Date;

  detectionCount: number;

  maxConfidence?: number | undefined;
  averageConfidence?: number | undefined;

  deduplicationKey: string;
  state: "ACTIVE" | "RESOLVED" | "COOLDOWN";
}

export type DeduplicationStrategy =
  | "TRACKED_OBJECT"
  | "CAMERA_ZONE"
  | "CAMERA_EVENT"
  | "IDENTITY"
  | "LICENSE_PLATE"
  | "DEVICE_HEALTH";

export interface DeduplicationPolicy {
  alertType: string;
  windowSeconds: number;
  strategy: DeduplicationStrategy;
  cooldownSeconds: number;
  hysteresisFailureThreshold?: number | undefined;
  hysteresisRecoveryThreshold?: number | undefined;
}

export interface DeduplicationResult {
  action: "CREATED" | "MERGED" | "SUPPRESSED" | "REOPENED";
  eventId: string;
  alertId?: string | undefined;
  occurrenceCount: number;
  durationSeconds: number;
  deduplicationKey: string;
  reason?: string | undefined;
}

export interface DeduplicationMetrics {
  detectionsReceivedTotal: number;
  eventsCreatedTotal: number;
  detectionsDeduplicatedTotal: number;
  eventsCorrelatedTotal: number;
  alertsCreatedTotal: number;
  suppressionRatioPercent: number;
}
