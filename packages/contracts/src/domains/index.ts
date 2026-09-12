/**
 * Canonical Domain Event Contracts & Runtime Envelopes
 * 
 * Domains:
 * - Alerts
 * - Incidents
 * - Recording
 * - Evidence
 * - Media
 * - Devices
 * - Edge
 * - AI
 * - Notifications
 * - Identity
 * 
 * Invariant: Every message/event MUST contain:
 * - schemaVersion
 * - eventId
 * - timestamp
 * - tenantId
 * - correlationId
 */

export interface EventEnvelope<T = unknown> {
  schemaVersion: string;
  eventId: string;
  eventType: string;
  tenantId: string;
  timestamp: string;
  correlationId: string;
  causationId?: string;
  payload: T;
}

export function validateEventEnvelope<T>(data: unknown): EventEnvelope<T> {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid event envelope: payload must be a non-null object");
  }

  const env = data as Record<string, unknown>;

  if (typeof env.schemaVersion !== "string" || !env.schemaVersion) {
    throw new Error("Invalid event envelope: missing or invalid schemaVersion");
  }
  if (typeof env.eventId !== "string" || !env.eventId) {
    throw new Error("Invalid event envelope: missing or invalid eventId");
  }
  if (typeof env.eventType !== "string" || !env.eventType) {
    throw new Error("Invalid event envelope: missing or invalid eventType");
  }
  if (typeof env.tenantId !== "string" || !env.tenantId) {
    throw new Error("Invalid event envelope: missing or invalid tenantId");
  }
  if (typeof env.timestamp !== "string" || !env.timestamp) {
    throw new Error("Invalid event envelope: missing or invalid timestamp");
  }
  if (typeof env.correlationId !== "string" || !env.correlationId) {
    throw new Error("Invalid event envelope: missing or invalid correlationId");
  }
  if (env.payload === undefined) {
    throw new Error("Invalid event envelope: missing payload");
  }

  return env as unknown as EventEnvelope<T>;
}

// 1. Alert Contracts
export interface AlertCreatedPayload {
  alertId: string;
  cameraId: string;
  branchId: string;
  ruleType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  occurredAt: string;
  snapshotUri?: string;
  metadata?: Record<string, unknown>;
}
export type AlertCreatedEvent = EventEnvelope<AlertCreatedPayload>;

// 2. Incident Contracts
export interface IncidentCreatedPayload {
  incidentId: string;
  title: string;
  severity: "P1" | "P2" | "P3" | "P4";
  playbookId: string;
  branchId: string;
  triggerAlertId?: string;
  deadlineAt: string;
}
export type IncidentCreatedEvent = EventEnvelope<IncidentCreatedPayload>;

// 3. Recording Contracts
export interface RecordingSegmentClosedPayload {
  segmentId: string;
  cameraId: string;
  streamId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  byteSize: number;
  sha256Hash: string;
  storageUri: string;
  status: "SEALED" | "RECOVERED";
}
export type RecordingSegmentClosedEvent = EventEnvelope<RecordingSegmentClosedPayload>;

// 4. Evidence Contracts
export interface EvidenceCompletedPayload {
  evidenceJobId: string;
  incidentId?: string;
  alertId: string;
  cameraId: string;
  manifestSha256: string;
  signature: string;
  packageUri: string;
}
export type EvidenceCompletedEvent = EventEnvelope<EvidenceCompletedPayload>;

// 5. Media Contracts
export interface MediaGatewayTakeoverPayload {
  gatewayId: string;
  cameraId: string;
  epoch: number;
  previousOwnerId?: string;
  migratedAt: string;
}
export type MediaGatewayTakeoverEvent = EventEnvelope<MediaGatewayTakeoverPayload>;

// 6. Device Contracts
export interface DeviceHeartbeatPayload {
  deviceId: string;
  deviceType: "NVR" | "DVR" | "CAMERA";
  ipAddress: string;
  status: "ONLINE" | "OFFLINE" | "DEGRADED";
  channelsActive: number;
  clockOffsetMs: number;
}
export type DeviceHeartbeatEvent = EventEnvelope<DeviceHeartbeatPayload>;

// 7. Edge Contracts
export interface EdgeConfigAppliedPayload {
  edgeId: string;
  branchId: string;
  desiredVersion: number;
  appliedVersion: number;
  payloadHash: string;
  driftStatus: "IN_SYNC" | "DRIFTED";
}
export type EdgeConfigAppliedEvent = EventEnvelope<EdgeConfigAppliedPayload>;

// 8. AI Contracts
export interface AiInferenceEventPayload {
  detectorType: string;
  cameraId: string;
  modelVersion: string;
  confidence: number;
  boundingBox?: [number, number, number, number];
  roiPolygon?: Array<[number, number]>;
}
export type AiInferenceEvent = EventEnvelope<AiInferenceEventPayload>;

// 9. Notification Contracts
export interface NotificationDispatchedPayload {
  jobId: string;
  channel: "sms" | "email" | "push" | "voice";
  destination: string;
  provider: string;
  providerMessageId: string;
  delivered: boolean;
}
export type NotificationDispatchedEvent = EventEnvelope<NotificationDispatchedPayload>;

// 10. Identity Contracts
export interface UserSessionAuthenticatedPayload {
  userId: string;
  role: string;
  branchScope?: string[];
  clientIp: string;
  authMethod: "OIDC" | "SAML" | "LOCAL";
}
export type UserSessionAuthenticatedEvent = EventEnvelope<UserSessionAuthenticatedPayload>;
