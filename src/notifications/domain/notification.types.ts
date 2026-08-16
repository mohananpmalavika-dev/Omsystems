/**
 * Consolidated Notification Subsystem - Domain Types
 * 
 * Defines canonical data contracts for all surveillance alert notifications,
 * outbox jobs, recipients, policies, and provider health.
 */

export type NotificationChannel =
  | "dashboard"
  | "email"
  | "sms"
  | "voice"
  | "push"
  | "system_log";

export type NotificationPriority = "P1" | "P2" | "P3" | "P4";

export type NotificationStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "ACKNOWLEDGED"
  | "CANCELLED"
  | "DEAD_LETTER";

export interface NotificationContext {
  tenantId: string;
  alertId: string;
  incidentId?: string | undefined;

  branchId?: string | undefined;
  branchName?: string | undefined;

  cameraId?: string | undefined;
  cameraName?: string | undefined;

  detectionType?: string | undefined;

  priority: NotificationPriority;
  severity: string;

  title: string;
  message: string;

  occurredAt: Date;
  metadata?: Record<string, unknown> | undefined;
}

export interface ResolvedRecipient {
  userId?: string | undefined;
  name: string;
  email?: string | undefined;
  mobile?: string | undefined;
  pushTokens?: string[] | undefined;
  role?: string | undefined;
  preferredLanguage?: string | undefined;
}

export interface RenderedPayload {
  subject?: string | undefined;
  text: string;
  html?: string | undefined;
  voiceText?: string | undefined;
  ivrActions?: {
    acknowledgeDigit: string;
    repeatDigit: string;
  } | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface NotificationJob {
  id: string;
  tenantId: string;
  alertId: string;
  channel: NotificationChannel;
  priority: NotificationPriority;

  recipientId?: string | undefined;
  recipientName?: string | undefined;
  destination: string;

  payload: RenderedPayload;
  status: NotificationStatus;

  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: Date | undefined;

  provider?: string | undefined;
  providerMessageId?: string | undefined;
  idempotencyKey: string;

  createdAt: Date;
  processingStartedAt?: Date | undefined;
  sentAt?: Date | undefined;
  deliveredAt?: Date | undefined;
  acknowledgedAt?: Date | undefined;
  cancelledAt?: Date | undefined;
  cancelReason?: string | undefined;

  lastError?: string | undefined;
}

export interface NotificationPolicy {
  priority: NotificationPriority;
  channels: NotificationChannel[];
  repeat?: {
    enabled: boolean;
    intervalSeconds: number;
    maximumAttempts?: number | undefined;
  } | undefined;
  escalation?: {
    acknowledgeWithinSeconds: number;
    escalateToLevel?: number | undefined;
  } | undefined;
}

export interface ScopedNotificationPolicyAssignment {
  id: string;
  tenantId: string;
  scopeType: "TENANT" | "REGION" | "BRANCH" | "ALERT_TYPE";
  scopeId: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  priorityRank: number; // Higher number = higher precedence
}

export interface ProviderSendResult {
  accepted: boolean;
  provider: string;
  providerMessageId?: string | undefined;
  state: "ACCEPTED" | "SENT" | "DELIVERED";
  metadata?: Record<string, unknown> | undefined;
}

export interface ProviderHealth {
  provider: string;
  channel: NotificationChannel;
  status: "HEALTHY" | "WARNING" | "UNHEALTHY";
  latencyMs: number;
  consecutiveFailures: number;
  lastSuccessAt?: Date | undefined;
  lastFailureAt?: Date | undefined;
  lastError?: string | undefined;
  observedAt: Date;
}
