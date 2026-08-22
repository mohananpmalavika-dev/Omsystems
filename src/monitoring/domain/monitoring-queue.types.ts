/**
 * Monitoring Queue & Durable Alert Domain Contracts
 * 
 * Formal domain types for Redis priority work queue items,
 * durable PostgreSQL alert lifecycle records, and distributed audit logging.
 */

export type DurableAlertStatus =
  | "NEW"
  | "QUEUED"
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "RESOLVED"
  | "CLOSED";

export interface DurableAlert {
  id: string;
  eventId: string;
  tenantId: string;
  branchId: string;

  cameraId?: string | undefined;
  recorderId?: string | undefined;

  alertType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  status: DurableAlertStatus;

  title: string;
  description?: string | undefined;

  detectedAt: Date;
  assignedOperatorId?: string | undefined;

  acknowledgedAt?: Date | undefined;
  acknowledgedBy?: string | undefined;

  resolvedAt?: Date | undefined;
  resolvedBy?: string | undefined;

  escalationLevel: number;
  slaDueAt?: Date | undefined;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueuedAlert {
  alertId: string;
  tenantId: string;
  branchId: string;
  priority: number;
  createdAt: string;
  attempts?: number | undefined;
}

export interface QueueDelivery {
  messageId: string;
  payload: QueuedAlert;
  deliveryAttempt: number;
  receivedAt: Date;
  acknowledge(): Promise<void>;
  retry(delaySeconds?: number): Promise<void>;
  deadLetter(reason: string): Promise<void>;
}

export interface DeadLetterEvent {
  messageId: string;
  alertId: string;
  consumer: string;
  attempts: number;
  lastError: string;
  failedAt: Date;
  payload: unknown;
}

export interface AlertActionRecord {
  id: string;
  alertId: string;
  action: "CREATED" | "QUEUED" | "CLAIMED" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED" | "RECONCILED";
  actorType: "SYSTEM" | "OPERATOR" | "WORKER";
  actorId?: string | undefined;
  previousStatus?: DurableAlertStatus | undefined;
  newStatus?: DurableAlertStatus | undefined;
  reason?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
}

export interface PipelineMetrics {
  eventsReceivedPerMin: number;
  eventsPersistedPerMin: number;
  activeAlerts: number;
  p1Queued: number;
  p2Queued: number;
  p3Queued: number;
  oldestP1QueueAgeSec: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  activeWorkers: number;
  retries: number;
  deadLetters: number;
  redisHealth: "HEALTHY" | "DEGRADED" | "DOWN";
  postgresHealth: "HEALTHY" | "DEGRADED" | "DOWN";
}
