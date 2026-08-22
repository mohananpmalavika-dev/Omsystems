/**
 * Canonical Surveillance Alert Domain Contracts
 * 
 * Formal domain models representing the single normalized surveillance alert envelope
 * consumed by all AI detectors, control room UI, notification matrices, and SLA reporting.
 */

export type CanonicalAlertType =
  | "INTRUSION"
  | "FIRE"
  | "SMOKE"
  | "CAMERA_TAMPER"
  | "VAULT_ACCESS"
  | "LOITERING"
  | "CROWD_GATHERING"
  | "BLACKLIST_PERSON"
  | "VEHICLE_ANPR"
  | "VIOLENCE"
  | "CAMERA_OBSTRUCTION"
  | "ATM_VANDALISM"
  | "WEAPON_DETECTED"
  | "CASH_VAN_MONITORING"
  | "QUEUE_ANOMALY"
  | "CAMERA_HEALTH_FAULT";

export type SurveillanceZone =
  | "VAULT"
  | "ATM_LOBBY"
  | "CASH_COUNTER"
  | "STRONG_ROOM"
  | "ENTRANCE"
  | "PERIMETER"
  | "SERVER_ROOM"
  | "CUSTOMER_LOUNGE"
  | "PARKING"
  | "GENERAL";

import type { AlertSeverity } from "./operational-alert.types.js";

export type { AlertSeverity };

export type AlertLifecycleState =
  | "NEW"
  | "QUEUED"
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED";

export type DetectorLifecycle =
  | "START"
  | "UPDATE"
  | "END"
  | "INSTANT";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface DetectionEvidenceRef {
  snapshotUrl?: string | undefined;
  clipUrl?: string | undefined;
}

export interface AlertPresentationTokens {
  badgeColor: string;
  badgeLabel: string;
  icon: string;
  soundUrgency: "P1_CRITICAL" | "P2_WARNING" | "P3_ATTENTION" | "SILENT";
  actions: Array<"VIEW_LIVE" | "VIEW_CLIP" | "ACKNOWLEDGE" | "ESCALATE" | "DISMISS">;
}

export interface SurveillanceAlert {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  zone: SurveillanceZone;

  cameraId: string;
  cameraName: string;
  recorderId?: string | undefined;

  alertType: CanonicalAlertType;
  vendorEventType: string;
  vendorSource: string;

  severity: AlertSeverity;
  detectedAt: Date;
  occurredAt: Date;

  title: string;
  description: string;

  confidence: number;
  detectorLifecycle: DetectorLifecycle;

  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;

  snapshotReference?: string | undefined;
  clipReference?: string | undefined;

  status: AlertLifecycleState;
  assignedOperatorId?: string | undefined;
  acknowledgedAt?: Date | undefined;
  acknowledgedBy?: string | undefined;

  correlationId?: string | undefined;
  incidentId?: string | undefined;
  isSuppressed?: boolean | undefined;
  suppressionStatus?: string | undefined;

  attributes: Record<string, unknown>;
  presentation: AlertPresentationTokens;
  schemaVersion: number;
}

export type NormalizedSurveillanceAlert = SurveillanceAlert;
