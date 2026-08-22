import type { CameraRecordingResult } from "../recording-index/recording-index.types.js";
import type { DbInvestigationEvent } from "../domain/models.js";

export type InvestigationObjectType = "PERSON" | "VEHICLE" | "FACE" | "PLATE" | "PACKAGE" | "ANIMAL";

export interface InvestigationSearchRequest {
  tenantId: string;
  branchIds?: string[];
  cameraIds?: string[];
  zones?: string[];
  from: Date;
  to: Date;
  eventTypes?: string[];
  objectTypes?: InvestigationObjectType[];
  minConfidence?: number;
  alertSeverity?: Array<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL">;
  incidentIds?: string[];
  bookmarkTags?: string[];
  includeRelatedAssets?: boolean;
  resolutionSeconds?: number;
}

export interface TimelineBucket {
  start: string;
  end: string;
  recorded: boolean;
  motionCount: number;
  personCount: number;
  vehicleCount: number;
  doorCount: number;
  alertCount: number;
  incidentCount: number;
  bookmarkCount: number;
  totalEvents: number;
}

export interface InvestigationSearchResult {
  from: Date;
  to: Date;
  videoCoverage: CameraRecordingResult[];
  events: DbInvestigationEvent[];
  eventSummary: Record<string, number>;
  timelineBuckets?: TimelineBucket[];
}

export interface CreateInvestigationEventInput {
  id?: string;
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  deviceId?: string;
  zoneId?: string;
  eventType: string;
  eventSubtype?: string;
  severity?: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  startTime: Date;
  endTime?: Date;
  source?: string;
  objectType?: InvestigationObjectType;
  objectId?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  incidentId?: string;
  alertId?: string;
}
