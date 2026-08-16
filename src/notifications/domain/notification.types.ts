/**
 * Consolidated Notification Subsystem - Domain Types
 * 
 * Defines canonical data contracts for all surveillance alert notifications,
 * outbox jobs, recipients, policies, schedules, endpoints, and provider health.
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

export type RecipientReason =
  | "BRANCH_MANAGER"
  | "REGIONAL_SECURITY"
  | "HO_OPERATOR"
  | "SURVEILLANCE_MANAGER"
  | "ON_CALL"
  | "INCIDENT_ASSIGNEE"
  | "ESCALATION_POLICY"
  | "EXPLICIT_USER";

export interface VerifiedEndpoint {
  id: string;
  type: "EMAIL" | "PHONE" | "PUSH_DEVICE";
  value: string;
  verified: boolean;
  verifiedAt?: Date | undefined;
  enabled: boolean;
  isPrimary?: boolean | undefined;
  metadata?: {
    platform?: "WEB" | "ANDROID" | "IOS" | undefined;
    deviceName?: string | undefined;
    provider?: string | undefined;
  } | undefined;
}

export interface ResolvedRecipient {
  tenantId: string;
  userId: string;
  displayName: string;
  name?: string | undefined; // For backward compatibility with simpler renderers
  email?: string | undefined;
  mobile?: string | undefined;
  pushTokens?: string[] | undefined;
  role?: string | undefined;

  channels: {
    dashboard?: boolean | undefined;
    email?: VerifiedEndpoint | undefined;
    sms?: VerifiedEndpoint | undefined;
    voice?: VerifiedEndpoint | undefined;
    push?: VerifiedEndpoint[] | undefined;
  };

  reasons: RecipientReason[];
  sourceAssignments: string[];

  branchId?: string | undefined;
  regionId?: string | undefined;

  resolutionPriority: number;
  resolvedAt: Date;
  endpointVerifiedAt?: Date | undefined;
}

export type RecipientSelector =
  | {
      type: "USER";
      userId: string;
    }
  | {
      type: "BRANCH_ROLE";
      role: string;
    }
  | {
      type: "REGION_ROLE";
      role: string;
    }
  | {
      type: "TENANT_ROLE";
      role: string;
    }
  | {
      type: "ON_CALL";
      scheduleKey: string;
    }
  | {
      type: "INCIDENT_ASSIGNEE";
    }
  | {
      type: "ESCALATION_POLICY";
      policyId: string;
      level: number;
    };

export interface RecipientResolutionContext {
  tenantId: string;
  alertId: string;
  incidentId?: string | undefined;

  branchId?: string | undefined;
  branchName?: string | undefined;
  regionId?: string | undefined;
  regionName?: string | undefined;
  zoneId?: string | undefined;
  timezone?: string | undefined;

  priority: NotificationPriority;
  alertType: string;
  occurredAt: Date;
  escalationLevel: number;
}

export interface RecipientResolutionRequest {
  context: RecipientResolutionContext;
  selectors: RecipientSelector[];
  requiredChannels: NotificationChannel[];
}

export interface RecipientResolutionWarning {
  userId?: string | undefined;
  selector: RecipientSelector;
  code:
    | "USER_NOT_FOUND"
    | "NO_EMAIL"
    | "NO_PHONE"
    | "PHONE_UNVERIFIED"
    | "NO_PUSH_DEVICE"
    | "NO_ACTIVE_ON_CALL_MEMBER"
    | "NO_ACTIVE_SHIFT_OPERATOR"
    | "ROLE_UNASSIGNED";
  message: string;
}

export interface RecipientResolutionResult {
  recipients: ResolvedRecipient[];
  warnings: RecipientResolutionWarning[];
  evaluatedSelectors: Array<{
    selector: RecipientSelector;
    candidateCount: number;
    resolvedCount: number;
  }>;
  resolvedAt: Date;
}

export interface RoleAssignment {
  id: string;
  tenantId: string;
  userId: string;
  roleKey: string;
  scopeType: "TENANT" | "REGION" | "BRANCH";
  scopeId?: string | undefined;
  activeFrom?: Date | undefined;
  activeUntil?: Date | undefined;
  enabled: boolean;
}

export interface ShiftMember {
  id: string;
  shiftId: string;
  tenantId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "ACTIVE" | "ABSENT" | "REPLACED";
}

export interface OnCallEntry {
  id: string;
  scheduleKey: string;
  tenantId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  priority: number;
  enabled: boolean;
}

export interface NotificationContext {
  tenantId: string;
  alertId: string;
  incidentId?: string | undefined;

  branchId?: string | undefined;
  branchName?: string | undefined;
  regionId?: string | undefined;

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

export interface ProviderSendResult {
  accepted: boolean;
  state?: "SENT" | "DELIVERED" | "QUEUED" | "FAILED" | undefined;
  provider?: string | undefined;
  providerMessageId?: string | undefined;
  error?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ProviderHealth {
  provider: string;
  channel: NotificationChannel;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNHEALTHY";
  healthy?: boolean | undefined;
  latencyMs?: number | undefined;
  consecutiveFailures?: number | undefined;
  lastFailureAt?: Date | undefined;
  lastError?: string | undefined;
  observedAt?: Date | undefined;
  lastCheckedAt?: Date | undefined;
  error?: string | undefined;
}

export interface ScopedNotificationPolicyAssignment {
  id: string;
  tenantId: string;
  scopeType: "TENANT" | "REGION" | "BRANCH" | "ALERT_TYPE";
  scopeId?: string | undefined;
  priority: NotificationPriority;
  priorityRank: number;
  channels: NotificationChannel[];
  policy?: NotificationPolicy | undefined;
  enabled: boolean;
}

export interface NotificationPolicy {
  priority: NotificationPriority;
  channels: NotificationChannel[];
  recipientSelectors?: RecipientSelector[] | undefined;
  repeat?: {
    enabled?: boolean | undefined;
    intervalSeconds: number;
    maximumAttempts?: number | undefined;
    maxCount?: number | undefined;
  } | undefined;
  escalation?: {
    acknowledgeWithinSeconds: number;
    escalateToLevel: number;
  } | undefined;
  escalationAfterSeconds?: number | undefined;
  escalationChannels?: NotificationChannel[] | undefined;
  escalationSelectors?: RecipientSelector[] | undefined;
  requiresAcknowledgement?: boolean | undefined;
  acknowledgementDeadlineSeconds?: number | undefined;
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  endpointId?: string | undefined;
  destination: string;
  recipientReasons: RecipientReason[];
  status: "QUEUED" | "SENDING" | "DELIVERED" | "FAILED" | "ACKNOWLEDGED" | "SKIPPED";
  attemptCount: number;
  lastAttemptAt?: Date | undefined;
}

export interface BranchNotificationReadiness {
  branchId: string;
  branchName: string;
  ready: boolean;
  priority: "P1";
  recipientSelectors: Array<{
    role: string;
    resolved: boolean;
    userIds: string[];
    phoneVerified: boolean;
  }>;
  channels: {
    sms: boolean;
    email: boolean;
    voice: boolean;
    dashboard: boolean;
  };
  warnings: string[];
}
