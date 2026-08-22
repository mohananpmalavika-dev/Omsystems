/**
 * Raw AI Detection Event Contracts
 * 
 * Defines the inbound payload shape produced by diverse AI models and vendor cameras
 * before passing through the normalizer registry.
 */

import type { CanonicalAlertType, SurveillanceZone } from "./surveillance-alert.types.js";

export interface RawAiDetectionEvent {
  eventId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  recorderId?: string | undefined;

  vendorSource:
    | "DAHUA_CGI"
    | "HIKVISION_ISAPI"
    | "YOLO_V8"
    | "FRIGATE"
    | "ONVIF_ANALYTICS"
    | "ANPR_ENGINE"
    | "FIRE_SMOKE_AI"
    | "CAMERA_HEALTH_AI"
    | "CUSTOM_PY";

  rawEventType: string;
  timestamp: string | Date;

  confidence?: number | undefined;
  boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; label: string }> | undefined;

  snapshotRef?: string | undefined;
  clipRef?: string | undefined;

  attributes?: Record<string, unknown> | undefined;
  schemaVersion?: number | undefined;
}

export interface NormalizedAlertCandidate {
  rawEventId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  recorderId?: string | undefined;

  alertType: CanonicalAlertType;
  vendorEventType: string;
  vendorSource: string;

  suggestedZone?: SurveillanceZone | undefined;
  occurredAt: Date;
  title: string;
  description: string;
  confidence: number;

  attributes: Record<string, unknown>;
  snapshotReference?: string | undefined;
  clipReference?: string | undefined;
}
