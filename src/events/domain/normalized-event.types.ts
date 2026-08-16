/**
 * Normalized Surveillance Event Domain Contracts
 * 
 * Defines immutable, canonical event envelopes for analytics, camera health,
 * recorder status, network outages, storage failures, and security telemetry.
 */

export interface NormalizedEvent {
  eventId: string;
  tenantId: string;
  branchId: string;

  source: {
    type: "CAMERA" | "RECORDER" | "ANALYTICS" | "NETWORK" | "STORAGE" | "SECURITY";
    sourceId: string;
  };

  eventType: string;
  severity: "P1" | "P2" | "P3" | "P4";

  occurredAt: string;
  receivedAt: string;
  persistedAt?: string | undefined;

  cameraId?: string | undefined;
  recorderId?: string | undefined;

  title: string;
  description?: string | undefined;

  attributes: Record<string, unknown>;

  evidence?: {
    snapshotId?: string | undefined;
    clipId?: string | undefined;
    recordingReference?: string | undefined;
  } | undefined;

  correlationId?: string | undefined;
  schemaVersion: number;
}

export interface EventOutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "PUBLISHED" | "FAILED";
  attempts: number;
  availableAt: Date;
  publishedAt?: Date | undefined;
  lastError?: string | undefined;
  createdAt: Date;
}

export interface EventInboxRecord {
  consumerName: string;
  messageId: string;
  receivedAt: Date;
  processedAt?: Date | undefined;
}
