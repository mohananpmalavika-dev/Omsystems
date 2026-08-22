/**
 * Core Notification System Types
 * 
 * Defines the contracts for the unified notification subsystem.
 */

// =====================================================
// Channel Types
// =====================================================

export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook' | 'in_app';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationStatus = 
  | 'pending'      // Ready to be processed
  | 'processing'   // Worker is currently handling
  | 'accepted'     // Provider accepted the message
  | 'delivered'    // Confirmed delivered (if provider supports it)
  | 'retry_wait'   // Waiting for retry
  | 'failed'       // Permanently failed
  | 'cancelled';   // Manually cancelled

export type PushPlatform = 'android' | 'ios' | 'web';

// =====================================================
// Request Types
// =====================================================

/**
 * Recipient specification - flexible addressing
 */
export interface NotificationRecipient {
  /** User ID for in-app and preference lookup */
  userId?: string;
  
  /** Direct email address */
  email?: string;
  
  /** Direct phone number */
  phone?: string;
  
  /** Push token (or will be resolved from userId) */
  pushToken?: string;
  
  /** Webhook URL */
  webhookUrl?: string;
}

/**
 * Main notification request - used by producers
 */
export interface NotificationRequest {
  /** Tenant ID for isolation */
  tenantId: string;
  
  /** Notification type for policies and templates */
  type: string;
  
  /** Channels to send through */
  channels: NotificationChannel[];
  
  /** Recipient specification */
  recipient: NotificationRecipient;
  
  /** Email subject (optional, can come from template) */
  subject?: string;
  
  /** Title for push/in-app */
  title?: string;
  
  /** Main message body */
  body: string;
  
  /** Template ID if using templates */
  templateId?: string;
  
  /** Data for template rendering */
  templateData?: Record<string, unknown>;
  
  /** Additional context */
  metadata?: Record<string, unknown>;
  
  /** Priority level */
  priority?: NotificationPriority;
  
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
  
  /** Source tracking */
  source?: {
    type: string;
    id: string;
  };
}

/**
 * Result of enqueue operation
 */
export interface NotificationResult {
  /** Created notification ID */
  notificationId: string;
  
  /** Created delivery IDs (one per channel) */
  deliveryIds: string[];
  
  /** Initial status */
  status: 'queued';
  
  /** Whether this was a duplicate (idempotency) */
  duplicate?: boolean;
}

// =====================================================
// Database Entity Types
// =====================================================

/**
 * Logical notification record
 */
export interface Notification {
  id: string;
  tenantId: string;
  type: string;
  sourceType?: string;
  sourceId?: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Physical delivery record (outbox)
 */
export interface NotificationDelivery {
  id: string;
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
  destination: string;
  subject?: string;
  title?: string;
  body: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  priority: NotificationPriority;
  status: NotificationStatus;
  idempotencyKey?: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date;
  lockedBy?: string;
  provider?: string;
  providerMessageId?: string;
  lastError?: string;
  lastErrorCode?: string;
  createdAt: Date;
  processingAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
}

/**
 * Delivery attempt audit record
 */
export interface NotificationDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  provider?: string;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  responseCode?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

/**
 * User push device record
 */
export interface UserPushDevice {
  id: string;
  tenantId: string;
  userId: string;
  platform?: PushPlatform;
  pushToken: string;
  active: boolean;
  lastSeenAt?: Date;
  deviceInfo: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Notification policy (tenant-level routing)
 */
export interface NotificationPolicy {
  id: string;
  tenantId: string;
  eventType: string;
  enabled: boolean;
  minimumSeverity?: string;
  channels: NotificationChannel[];
  cooldownSeconds: number;
  escalationRules?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  eventFilters: Record<string, boolean>;
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // TIME format
  quietHoursEnd?: string;   // TIME format
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// Provider Interface Types
// =====================================================

/**
 * Request passed to provider
 */
export interface DeliveryRequest {
  id: string;
  tenantId: string;
  destination: string;
  subject?: string;
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result from provider delivery
 */
export interface DeliveryResult {
  /** Provider's message ID */
  providerMessageId?: string;
  
  /** Delivery status */
  status: 'accepted' | 'delivered' | 'rejected';
  
  /** Additional provider metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delivery error with retry classification
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code?: string,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

/**
 * Base interface for notification providers
 */
export interface NotificationProvider {
  /** Channel this provider handles */
  readonly channel: NotificationChannel;
  
  /** Provider identifier */
  readonly name: string;
  
  /** Send notification through this provider */
  send(request: DeliveryRequest): Promise<DeliveryResult>;
  
  /** Health check */
  healthCheck?(): Promise<boolean>;
}

// =====================================================
// Worker Types
// =====================================================

/**
 * Job claimed by worker
 */
export interface NotificationJob {
  delivery: NotificationDelivery;
  notification: Notification;
}

/**
 * Worker configuration
 */
export interface WorkerConfig {
  workerId: string;
  batchSize: number;
  pollIntervalMs: number;
  lockTimeoutMinutes: number;
}

/**
 * Worker metrics
 */
export interface WorkerMetrics {
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  averageProcessingTimeMs: number;
  lastProcessedAt?: Date;
}

// =====================================================
// Service Interface Types
// =====================================================

/**
 * Options for enqueue operation
 */
export interface EnqueueOptions {
  /** Database transaction to use (for transactional outbox) */
  transaction?: unknown; // Pool client from pg
}

/**
 * Notification service interface
 */
export interface INotificationService {
  /**
   * Enqueue notification for delivery
   * Returns immediately after durable persistence
   */
  enqueue(
    request: NotificationRequest,
    options?: EnqueueOptions
  ): Promise<NotificationResult>;
  
  /**
   * Get notification by ID
   */
  getNotification(
    notificationId: string,
    tenantId: string
  ): Promise<Notification | null>;
  
  /**
   * Get delivery status
   */
  getDeliveryStatus(
    deliveryId: string,
    tenantId: string
  ): Promise<NotificationDelivery | null>;
  
  /**
   * Get all deliveries for a notification
   */
  getDeliveries(
    notificationId: string,
    tenantId: string
  ): Promise<NotificationDelivery[]>;
  
  /**
   * Cancel pending delivery
   */
  cancelDelivery(
    deliveryId: string,
    tenantId: string
  ): Promise<boolean>;
}

// =====================================================
// Repository Interface Types
// =====================================================

export interface INotificationRepository {
  createNotification(
    notification: Omit<Notification, 'id' | 'createdAt'>,
    tx?: unknown
  ): Promise<Notification>;
  
  createDelivery(
    delivery: Omit<NotificationDelivery, 'id' | 'createdAt' | 'attemptCount'>,
    tx?: unknown
  ): Promise<NotificationDelivery>;
  
  createDeliveryAttempt(
    attempt: Omit<NotificationDeliveryAttempt, 'id'>,
    tx?: unknown
  ): Promise<NotificationDeliveryAttempt>;
  
  findNotification(
    id: string,
    tenantId: string
  ): Promise<Notification | null>;
  
  findDelivery(
    id: string,
    tenantId: string
  ): Promise<NotificationDelivery | null>;
  
  findDeliveriesByNotification(
    notificationId: string,
    tenantId: string
  ): Promise<NotificationDelivery[]>;
  
  claimPendingDeliveries(
    workerId: string,
    batchSize: number
  ): Promise<NotificationJob[]>;
  
  updateDeliveryStatus(
    id: string,
    status: NotificationStatus,
    updates: Partial<NotificationDelivery>
  ): Promise<void>;
  
  incrementAttemptCount(
    id: string,
    nextAttemptAt: Date
  ): Promise<void>;
  
  resetStuckDeliveries(
    timeoutMinutes: number
  ): Promise<number>;
  
  getUserPushDevices(
    userId: string,
    tenantId: string
  ): Promise<UserPushDevice[]>;
  
  deactivatePushDevice(
    token: string
  ): Promise<void>;
  
  getUserPreferences(
    userId: string,
    tenantId: string
  ): Promise<NotificationPreferences | null>;
  
  getTenantPolicies(
    tenantId: string
  ): Promise<NotificationPolicy[]>;
}

// =====================================================
// Recipient Resolver Types
// =====================================================

/**
 * Resolved recipient with actual contact info
 */
export interface ResolvedRecipient {
  userId?: string;
  email?: string;
  phone?: string;
  pushTokens: string[];
  webhookUrl?: string;
}

export interface IRecipientResolver {
  resolve(
    recipient: NotificationRecipient,
    tenantId: string
  ): Promise<ResolvedRecipient>;
}

// =====================================================
// Policy Engine Types
// =====================================================

export interface PolicyEvaluationResult {
  shouldSend: boolean;
  channels: NotificationChannel[];
  reason?: string;
  cooldownUntil?: Date;
}

export interface IPolicyEngine {
  evaluate(
    request: NotificationRequest
  ): Promise<PolicyEvaluationResult>;
}

// =====================================================
// Template Types
// =====================================================

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  type: string;
  channel: NotificationChannel;
  subject?: string;
  title?: string;
  body: string;
  variables: string[];
}

export interface ITemplateService {
  render(
    templateId: string,
    channel: NotificationChannel,
    data: Record<string, unknown>,
    tenantId: string
  ): Promise<{
    subject?: string;
    title?: string;
    body: string;
  }>;
}

// =====================================================
// Monitoring Types
// =====================================================

export interface QueueDepthMetric {
  tenantId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  priority: NotificationPriority;
  count: number;
  oldestPending?: Date;
}

export interface DeliveryStatsMetric {
  tenantId: string;
  channel: NotificationChannel;
  provider?: string;
  total: number;
  delivered: number;
  accepted: number;
  failed: number;
  avgDeliveryTimeSeconds?: number;
}

export interface NotificationFailure {
  id: string;
  tenantId: string;
  notificationType: string;
  channel: NotificationChannel;
  destination: string;
  attemptCount: number;
  lastError?: string;
  failedAt?: Date;
  createdAt: Date;
}

// =====================================================
// Event Types (for future event bus integration)
// =====================================================

export interface NotificationEvent {
  type: 'notification.created' | 'notification.delivered' | 'notification.failed';
  notificationId: string;
  deliveryId?: string;
  tenantId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// =====================================================
// Configuration Types
// =====================================================

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface FcmConfig {
  projectId: string;
  credentials: unknown; // Firebase credentials
}

export interface WebhookConfig {
  signatureSecret?: string;
  userAgent: string;
}

export interface NotificationSystemConfig {
  worker: WorkerConfig;
  smtp?: SmtpConfig;
  twilio?: TwilioConfig;
  fcm?: FcmConfig;
  webhook: WebhookConfig;
}

// =====================================================
// Utility Types
// =====================================================

/**
 * Type guard for channel validation
 */
export function isValidChannel(channel: string): channel is NotificationChannel {
  return ['email', 'sms', 'push', 'webhook', 'in_app'].includes(channel);
}

/**
 * Type guard for priority validation
 */
export function isValidPriority(priority: string): priority is NotificationPriority {
  return ['low', 'normal', 'high', 'critical'].includes(priority);
}

/**
 * Type guard for status validation
 */
export function isValidStatus(status: string): status is NotificationStatus {
  return ['pending', 'processing', 'accepted', 'delivered', 'retry_wait', 'failed', 'cancelled'].includes(status);
}
