/**
 * Notification System Domain Types
 * Production-ready notification & escalation subsystem
 */

// =====================================================
// ENUMS AND CONSTANTS
// =====================================================

export type NotificationChannel = 
  | 'dashboard'
  | 'email'
  | 'sms'
  | 'voice'
  | 'push'
  | 'webhook';

export type AlertSeverity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type PolicyStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'RETRYING'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export type DeliveryStatus = 
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'ACKNOWLEDGED';

export type EscalationStatus = 
  | 'ACTIVE'
  | 'ACKNOWLEDGED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED';

export type ScopeType = 
  | 'TENANT'
  | 'REGION'
  | 'BRANCH'
  | 'DEVICE'
  | 'CAMERA'
  | 'ALERT_TYPE';

export type ProviderType =
  | 'SMTP'
  | 'SMPP'
  | 'GSM_MODEM'
  | 'SIP'
  | 'TWILIO'
  | 'SNS'
  | 'WEBSOCKET'
  | 'FCM'
  | 'APNS'
  | 'WEBHOOK';

export type NotificationAuditAction =
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_PUBLISHED'
  | 'POLICY_ARCHIVED'
  | 'POLICY_ROLLED_BACK'
  | 'RECIPIENT_GROUP_CREATED'
  | 'RECIPIENT_GROUP_UPDATED'
  | 'RECIPIENT_ADDED'
  | 'RECIPIENT_REMOVED'
  | 'RECIPIENT_UPDATED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'PROVIDER_CONFIGURED'
  | 'PROVIDER_ENABLED'
  | 'PROVIDER_DISABLED'
  | 'TEST_NOTIFICATION_SENT';

// =====================================================
// RECIPIENT GROUPS
// =====================================================

export interface RecipientGroup {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  scopeType: ScopeType;
  scopeRegionIds: string[];
  scopeBranchIds: string[];
  scopeAlertTypes: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  members?: RecipientMember[];
}

export interface RecipientMember {
  id: string;
  groupId: string;
  userId?: string;
  displayName: string;
  email?: string;
  phone?: string;
  voiceNumber?: string;
  preferredLanguage: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecipientGroupInput {
  tenantId: string;
  name: string;
  description?: string;
  scopeType?: ScopeType;
  scopeRegionIds?: string[];
  scopeBranchIds?: string[];
  scopeAlertTypes?: string[];
  members: Omit<RecipientMember, 'id' | 'groupId' | 'createdAt' | 'updatedAt'>[];
}

export interface UpdateRecipientGroupInput {
  name?: string;
  description?: string;
  scopeType?: ScopeType;
  scopeRegionIds?: string[];
  scopeBranchIds?: string[];
  scopeAlertTypes?: string[];
}

// =====================================================
// NOTIFICATION RULES
// =====================================================

export interface NotificationRule {
  channels: NotificationChannel[];
  recipientGroupIds: string[];
  templateId?: string;
  requireAcknowledgement: boolean;
  repeatUntilAcknowledged: boolean;
  customTemplate?: {
    subject?: string;
    body: string;
  };
}

export interface QuietHoursConfig {
  enabled: boolean;
  start: string; // HH:mm format
  end: string;   // HH:mm format
  timezone: string; // IANA timezone
  bypassSeverities: AlertSeverity[];
}

export interface RateLimitConfig {
  perMinute: number;
  perRecipientPerMinute: number;
}

// =====================================================
// ESCALATION
// =====================================================

export interface EscalationStep {
  afterSeconds: number;
  recipientGroupIds: string[];
  channels: NotificationChannel[];
  stopOnAcknowledgement: boolean;
  customMessage?: string;
}

export interface EscalationPolicy {
  acknowledgeRequired: boolean;
  steps: EscalationStep[];
  maximumAttempts?: number;
}

export interface EscalationJob {
  id: string;
  tenantId: string;
  incidentId: string;
  policyId: string;
  severity: AlertSeverity;
  currentStep: number;
  totalSteps: number;
  status: EscalationStatus;
  nextEscalationAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  cancelledAt?: Date;
  cancelledReason?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// NOTIFICATION POLICY
// =====================================================

export interface PolicyScope {
  type: ScopeType;
  regionIds?: string[];
  branchIds?: string[];
  deviceIds?: string[];
  cameraIds?: string[];
  alertTypes?: string[];
}

export interface NotificationPolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version: number;
  status: PolicyStatus;

  // Scope
  scope: PolicyScope;

  // Priority-based rules
  p1Rule: NotificationRule;
  p2Rule: NotificationRule;
  p3Rule: NotificationRule;
  p4Rule: NotificationRule;
  p5Rule: NotificationRule;

  // Quiet hours
  quietHours?: QuietHoursConfig;

  // Rate limiting
  rateLimits: RateLimitConfig;

  // Escalation policies
  p1Escalation?: EscalationPolicy;
  p2Escalation?: EscalationPolicy;
  p3Escalation?: EscalationPolicy;
  p4Escalation?: EscalationPolicy;
  p5Escalation?: EscalationPolicy;

  // Metadata
  createdBy?: string;
  updatedBy?: string;
  approvedBy?: string;
  publishedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  publishedAt?: Date;
}

export interface NotificationPolicyVersion {
  id: string;
  policyId: string;
  version: number;
  snapshot: Partial<NotificationPolicy>;
  changeSummary?: string;
  createdBy?: string;
  createdAt: Date;
}

export interface CreateNotificationPolicyInput {
  tenantId: string;
  name: string;
  description?: string;
  scope?: PolicyScope;
  p1Rule?: NotificationRule;
  p2Rule?: NotificationRule;
  p3Rule?: NotificationRule;
  p4Rule?: NotificationRule;
  p5Rule?: NotificationRule;
  quietHours?: QuietHoursConfig;
  rateLimits?: RateLimitConfig;
  p1Escalation?: EscalationPolicy;
  p2Escalation?: EscalationPolicy;
  p3Escalation?: EscalationPolicy;
  p4Escalation?: EscalationPolicy;
  p5Escalation?: EscalationPolicy;
}

export interface UpdateNotificationPolicyInput {
  name?: string;
  description?: string;
  scope?: PolicyScope;
  p1Rule?: NotificationRule;
  p2Rule?: NotificationRule;
  p3Rule?: NotificationRule;
  p4Rule?: NotificationRule;
  p5Rule?: NotificationRule;
  quietHours?: QuietHoursConfig;
  rateLimits?: RateLimitConfig;
  p1Escalation?: EscalationPolicy;
  p2Escalation?: EscalationPolicy;
  p3Escalation?: EscalationPolicy;
  p4Escalation?: EscalationPolicy;
  p5Escalation?: EscalationPolicy;
}

// =====================================================
// NOTIFICATION TEMPLATES
// =====================================================

export interface NotificationTemplate {
  id: string;
  tenantId?: string;
  templateKey: string;
  channel: NotificationChannel;
  language: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  variables: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariables {
  [key: string]: any;
  severity?: string;
  incident?: {
    id: string;
    occurredAt: string;
    title?: string;
    description?: string;
  };
  alert?: {
    id: string;
    type: string;
    message?: string;
  };
  branch?: {
    id: string;
    name: string;
    location?: string;
  };
  camera?: {
    id: string;
    name: string;
    location?: string;
  };
  device?: {
    id: string;
    name: string;
    type?: string;
  };
}

// =====================================================
// NOTIFICATION OUTBOX (Transactional Pattern)
// =====================================================

export interface NotificationOutbox {
  id: string;
  tenantId: string;

  // Source context
  incidentId?: string;
  alertId?: string;
  policyId?: string;
  escalationStep: number;

  // Notification details
  channel: NotificationChannel;
  recipientId?: string;
  recipientDisplayName: string;
  recipientDestination: string;
  recipientDestinationMasked: string;

  // Template and content
  templateKey?: string;
  subject?: string;
  body: string;
  variables: TemplateVariables;

  // Delivery control
  status: NotificationStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  scheduledAt: Date;

  // Provider details
  providerName?: string;
  providerMessageId?: string;

  // Deduplication
  dedupKey: string;

  // Timestamps
  createdAt: Date;
  processingStartedAt?: Date;
  processedAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;

  // Error tracking
  lastErrorCode?: string;
  lastErrorMessage?: string;
  errorHistory: NotificationError[];
}

export interface NotificationError {
  attemptNumber: number;
  errorCode: string;
  errorMessage: string;
  timestamp: Date;
  isPermanent: boolean;
}

export interface CreateNotificationOutboxInput {
  tenantId: string;
  incidentId?: string;
  alertId?: string;
  policyId?: string;
  escalationStep?: number;
  channel: NotificationChannel;
  recipientId?: string;
  recipientDisplayName: string;
  recipientDestination: string;
  templateKey?: string;
  subject?: string;
  body: string;
  variables?: TemplateVariables;
  scheduledAt?: Date;
  providerName?: string;
}

// =====================================================
// NOTIFICATION DELIVERY
// =====================================================

export interface NotificationDelivery {
  id: string;
  tenantId: string;
  outboxId: string;
  incidentId?: string;

  channel: NotificationChannel;
  recipientId?: string;
  recipientDisplayName: string;
  recipientDestinationMasked: string;

  providerName?: string;
  providerMessageId?: string;

  status: DeliveryStatus;
  attemptNumber: number;

  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;

  errorCode?: string;
  errorMessage?: string;

  latencyMs?: number;

  createdAt: Date;
}

// =====================================================
// PROVIDER CONFIGURATION
// =====================================================

export interface ProviderConfig {
  id: string;
  tenantId?: string;
  providerKey: string;
  providerType: ProviderType;
  channel: NotificationChannel;

  config: Record<string, any>;
  credentialsRef?: string;

  enabled: boolean;
  isDefault: boolean;
  priority: number;

  healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  lastHealthCheckAt?: Date;
  lastSuccessfulSendAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

export interface SMSGatewayConfig {
  gatewayUrl: string;
  apiKey: string;
  senderId?: string;
  encoding?: 'GSM7' | 'UCS2';
}

export interface SIPConfig {
  sipServer: string;
  sipUsername: string;
  sipPassword: string;
  fromNumber: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

// =====================================================
// NOTIFICATION PROVIDER INTERFACE
// =====================================================

export interface DeliveryResult {
  accepted: boolean;
  providerMessageId?: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  failureCode?: string;
  failureReason?: string;
  isPermanentFailure?: boolean;
  timestamp: Date;
}

export interface NotificationProvider {
  readonly providerKey: string;
  readonly providerType: ProviderType;
  readonly channel: NotificationChannel;

  initialize(config: ProviderConfig): Promise<void>;
  send(message: NotificationMessage): Promise<DeliveryResult>;
  checkHealth(): Promise<ProviderHealthStatus>;
}

export interface NotificationMessage {
  recipientDestination: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
}

export interface ProviderHealthStatus {
  healthy: boolean;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  latencyMs?: number;
  lastError?: string;
  timestamp: Date;
}

// =====================================================
// NOTIFICATION CONTEXT
// =====================================================

export interface NotificationContext {
  tenantId: string;
  severity: AlertSeverity;
  incidentId?: string;
  alertId?: string;
  alertType?: string;
  branchId?: string;
  regionId?: string;
  deviceId?: string;
  cameraId?: string;
  occurredAt: Date;
  variables: TemplateVariables;
}

// =====================================================
// NOTIFICATION AUDIT
// =====================================================

export interface NotificationAuditLog {
  id: string;
  tenantId: string;
  actorId?: string;
  actorRole?: string;
  action: NotificationAuditAction;
  resourceType: 'POLICY' | 'RECIPIENT_GROUP' | 'RECIPIENT' | 'TEMPLATE' | 'PROVIDER' | 'DELIVERY';
  resourceId?: string;
  previousValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  tenantId: string;
  actorId?: string;
  actorRole?: string;
  action: NotificationAuditAction;
  resourceType: NotificationAuditLog['resourceType'];
  resourceId?: string;
  previousValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// =====================================================
// RATE LIMITING
// =====================================================

export interface RateLimitBucket {
  id: string;
  tenantId: string;
  bucketKey: string;
  windowStart: Date;
  windowEnd: Date;
  count: number;
  limitValue: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

// =====================================================
// POLICY MATCHING
// =====================================================

export interface PolicyMatchCriteria {
  tenantId: string;
  severity: AlertSeverity;
  branchId?: string;
  regionId?: string;
  deviceId?: string;
  cameraId?: string;
  alertType?: string;
}

export interface PolicyMatchResult {
  matched: boolean;
  policy?: NotificationPolicy;
  rule?: NotificationRule;
  escalationPolicy?: EscalationPolicy;
  inQuietHours: boolean;
  shouldNotify: boolean;
  reason?: string;
}

// =====================================================
// NOTIFICATION STATISTICS
// =====================================================

export interface NotificationStats {
  period: 'hour' | 'day' | 'week';
  startDate: Date;
  endDate: Date;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  byChannel: {
    [K in NotificationChannel]?: {
      sent: number;
      delivered: number;
      failed: number;
      avgLatencyMs: number;
    };
  };
  bySeverity: {
    [K in AlertSeverity]?: {
      sent: number;
      delivered: number;
      failed: number;
    };
  };
}

export interface ProviderStats {
  providerKey: string;
  channel: NotificationChannel;
  healthy: boolean;
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  recentCount: number;
  avgLatencyMs?: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

// =====================================================
// TEST NOTIFICATION
// =====================================================

export interface TestNotificationInput {
  severity: AlertSeverity;
  channels: NotificationChannel[];
  recipientGroupIds: string[];
  customMessage?: string;
}

export interface TestNotificationResult {
  success: boolean;
  results: {
    channel: NotificationChannel;
    recipient: string;
    status: 'DELIVERED' | 'FAILED';
    latencyMs: number;
    error?: string;
  }[];
}

// =====================================================
// HELPER TYPES
// =====================================================

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListNotificationsQuery {
  tenantId: string;
  incidentId?: string;
  alertId?: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface ListDeliveriesQuery {
  tenantId: string;
  incidentId?: string;
  recipientId?: string;
  channel?: NotificationChannel;
  status?: DeliveryStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}
