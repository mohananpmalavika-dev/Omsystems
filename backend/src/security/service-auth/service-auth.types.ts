/**
 * Service Authentication Types
 * 
 * Defines contracts for service-to-service authentication and authorization.
 * Implements zero-trust principles with workload identity, JWT verification,
 * capability-based authorization, and multi-dimensional security controls.
 */

// =====================================================
// Service Identity & Authentication
// =====================================================

/**
 * Service capability - represents what a service is allowed to do
 */
export type ServiceCapability =
  | 'notifications:create'
  | 'notifications:read'
  | 'notifications:cancel'
  | 'analytics:submit'
  | 'events:publish'
  | 'health:read';

/**
 * Known service identifiers in the system
 */
export type ServiceId =
  | 'analytics-engine'
  | 'recording-service'
  | 'compliance-service'
  | 'health-monitor'
  | 'edge-agent';

/**
 * Service principal - represents an authenticated workload
 * 
 * This is produced by ServiceAuthService and consumed by authorization logic.
 */
export interface ServicePrincipal {
  /** Type discriminator */
  type: 'service';
  
  /** Service identifier (from JWT sub claim) */
  serviceId: ServiceId;
  
  /** Capabilities granted to this service */
  capabilities: ServiceCapability[];
  
  /** Tenant context (optional, for tenant-scoped services) */
  tenantId?: string;
  
  /** Credential/key identifier for audit */
  credentialId: string;
  
  /** When authentication occurred */
  authenticatedAt: Date;
  
  /** JWT ID for replay protection */
  jti: string;
  
  /** Token issued at timestamp */
  issuedAt: Date;
  
  /** Token expires at timestamp */
  expiresAt: Date;
}

/**
 * JWT claims structure for service tokens
 */
export interface ServiceJwtClaims {
  /** Issuer - must be sentinel-workload-identity */
  iss: string;
  
  /** Subject - service identifier */
  sub: ServiceId;
  
  /** Audience - must be sentinel-backend */
  aud: string;
  
  /** Scopes/capabilities */
  scope: ServiceCapability[];
  
  /** Tenant ID for tenant-scoped services */
  tid?: string;
  
  /** Issued at (Unix timestamp) */
  iat: number;
  
  /** Expires at (Unix timestamp) */
  exp: number;
  
  /** JWT ID (unique identifier for replay protection) */
  jti: string;
  
  /** Credential ID */
  cid: string;
}

/**
 * mTLS certificate identity (for future phase)
 */
export interface TlsIdentity {
  /** Service identifier from certificate CN or SAN */
  serviceId: ServiceId;
  
  /** Certificate serial number */
  serialNumber: string;
  
  /** Certificate subject */
  subject: string;
  
  /** Certificate issuer */
  issuer: string;
  
  /** Valid from */
  notBefore: Date;
  
  /** Valid until */
  notAfter: Date;
}

// =====================================================
// Notification-Specific Types
// =====================================================

/**
 * Notification purpose - controls what notifications a service can send
 */
export enum NotificationPurpose {
  ALERT_ESCALATION = 'ALERT_ESCALATION',
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  RECORDING_FAILURE = 'RECORDING_FAILURE',
  COMPLIANCE_VIOLATION = 'COMPLIANCE_VIOLATION',
  SECURITY_EVENT = 'SECURITY_EVENT',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
  USER_ACTION_REQUIRED = 'USER_ACTION_REQUIRED',
}

/**
 * Enhanced internal notification request with security context
 */
export interface InternalNotificationCommand {
  /** Tenant ID - must be authorized for the service */
  tenantId: string;
  
  /** Notification purpose - must be allowed for the service */
  purpose: NotificationPurpose;
  
  /** Event/alert ID this notification relates to */
  eventId: string;
  
  /** Template identifier (approved templates only) */
  templateId: string;
  
  /** Recipient reference(s) - resolved server-side */
  recipientRefs: string[];
  
  /** Template data (validated against template schema) */
  data: Record<string, unknown>;
  
  /** Idempotency key (mandatory for external side effects) */
  idempotencyKey: string;
  
  /** When the event occurred */
  occurredAt: string; // ISO 8601
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal notification result
 */
export interface InternalNotificationResult {
  /** Created notification ID */
  notificationId: string;
  
  /** Whether this was deduplicated via idempotency */
  duplicate: boolean;
  
  /** Status */
  status: 'accepted' | 'queued';
  
  /** Timestamp */
  acceptedAt: Date;
}

// =====================================================
// Authorization
// =====================================================

/**
 * Authorization context - input to authorization decisions
 */
export interface AuthorizationContext {
  /** The authenticated principal */
  principal: ServicePrincipal;
  
  /** Action being performed */
  action: ServiceCapability;
  
  /** Tenant context */
  tenantId: string;
  
  /** Resource type */
  resource: string;
  
  /** Resource-specific attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Authorization decision
 */
export interface AuthorizationDecision {
  /** Whether access is granted */
  allowed: boolean;
  
  /** Reason for the decision */
  reason: string;
  
  /** Which policy rule made the decision */
  policyRule?: string;
}

/**
 * Service notification policy - controls what notifications each service can send
 */
export interface ServiceNotificationPolicy {
  /** Service identifier */
  serviceId: ServiceId;
  
  /** Allowed notification purposes */
  allowedPurposes: NotificationPurpose[];
  
  /** Whether service can send to arbitrary tenants */
  crossTenantAllowed: boolean;
  
  /** Rate limits */
  rateLimits: ServiceRateLimits;
}

/**
 * Rate limit configuration per service
 */
export interface ServiceRateLimits {
  /** Requests per minute per tenant */
  perTenantPerMinute: number;
  
  /** Requests per minute per purpose */
  perPurposePerMinute: number;
  
  /** Recipients per minute per tenant */
  recipientsPerTenantPerMinute: number;
  
  /** Maximum recipients per request */
  maxRecipientsPerRequest: number;
}

// =====================================================
// Idempotency
// =====================================================

/**
 * Idempotency record
 */
export interface IdempotencyRecord {
  id: string;
  tenantId: string;
  callerService: ServiceId;
  idempotencyKey: string;
  requestHash: string;
  notificationId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  /** Whether this is a duplicate request */
  isDuplicate: boolean;
  
  /** Existing notification ID if duplicate */
  notificationId?: string;
  
  /** Whether this is a conflict (same key, different request) */
  isConflict: boolean;
}

// =====================================================
// Replay Protection
// =====================================================

/**
 * Replay protection record
 */
export interface ReplayRecord {
  serviceId: ServiceId;
  jti: string;
  consumedAt: Date;
  expiresAt: Date;
}

/**
 * Replay check result
 */
export interface ReplayCheckResult {
  /** Whether this token has been used before */
  isReplay: boolean;
  
  /** When it was previously used */
  previousUseAt?: Date;
}

// =====================================================
// Rate Limiting
// =====================================================

/**
 * Rate limit check context
 */
export interface RateLimitContext {
  serviceId: ServiceId;
  tenantId: string;
  purpose: NotificationPurpose;
  recipientCount: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean;
  
  /** Which limit was exceeded */
  limitType?: 'tenant' | 'purpose' | 'recipients' | 'request';
  
  /** Current count in window */
  currentCount?: number;
  
  /** Maximum allowed */
  limit?: number;
  
  /** When the limit resets */
  resetsAt?: Date;
}

/**
 * Rate limit bucket key
 */
export interface RateLimitBucket {
  key: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

// =====================================================
// Audit
// =====================================================

/**
 * Service authentication audit event
 */
export interface ServiceAuthAuditEvent {
  id: string;
  timestamp: Date;
  action: ServiceAuditAction;
  serviceId: ServiceId;
  credentialId: string;
  tenantId?: string;
  decision: 'ALLOW' | 'DENY';
  reason?: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit action types
 */
export type ServiceAuditAction =
  | 'AUTHENTICATION_ATTEMPTED'
  | 'AUTHENTICATION_SUCCESS'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_REQUESTED'
  | 'AUTHORIZATION_GRANTED'
  | 'AUTHORIZATION_DENIED'
  | 'NOTIFICATION_REQUESTED'
  | 'NOTIFICATION_ACCEPTED'
  | 'NOTIFICATION_REJECTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'REPLAY_DETECTED'
  | 'IDEMPOTENCY_CONFLICT';

// =====================================================
// Errors
// =====================================================

/**
 * Service authentication error
 */
export class ServiceAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ServiceAuthError';
  }
}

/**
 * Service authorization error
 */
export class ServiceAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 403,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ServiceAuthorizationError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly limitType: string,
    public readonly currentCount: number,
    public readonly limit: number,
    public readonly resetsAt: Date
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Idempotency conflict error
 */
export class IdempotencyConflictError extends Error {
  constructor(
    message: string,
    public readonly idempotencyKey: string,
    public readonly requestHash: string,
    public readonly existingHash: string
  ) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Replay detection error
 */
export class ReplayDetectedError extends Error {
  constructor(
    message: string,
    public readonly jti: string,
    public readonly previousUseAt: Date
  ) {
    super(message);
    this.name = 'ReplayDetectedError';
  }
}

// =====================================================
// Configuration
// =====================================================

/**
 * JWT verification configuration
 */
export interface JwtVerificationConfig {
  /** Expected issuer */
  issuer: string;
  
  /** Expected audience */
  audience: string;
  
  /** Public key or secret for verification */
  verificationKey: string;
  
  /** Algorithm (RS256, ES256, HS256, etc.) */
  algorithm: string;
  
  /** Clock skew tolerance in seconds */
  clockToleranceSeconds: number;
  
  /** Maximum token lifetime in seconds */
  maxLifetimeSeconds: number;
}

/**
 * Service auth configuration
 */
export interface ServiceAuthConfig {
  /** JWT verification settings */
  jwt: JwtVerificationConfig;
  
  /** Whether to enable replay protection */
  replayProtectionEnabled: boolean;
  
  /** Replay cache TTL in seconds */
  replayCacheTtlSeconds: number;
  
  /** Whether to require mTLS */
  mtlsRequired: boolean;
  
  /** Whether to verify service identity matches between mTLS and JWT */
  verifyIdentityMatch: boolean;
}

// =====================================================
// Service Interfaces
// =====================================================

/**
 * Service authentication service interface
 */
export interface IServiceAuthService {
  /**
   * Authenticate a service request
   * Extracts and validates JWT, produces ServicePrincipal
   */
  authenticate(headers: Record<string, string | string[] | undefined>): Promise<ServicePrincipal>;
  
  /**
   * Verify JWT signature and claims
   */
  verifyJwt(token: string): Promise<ServiceJwtClaims>;
  
  /**
   * Extract TLS identity (when mTLS is enabled)
   */
  extractTlsIdentity?(request: unknown): Promise<TlsIdentity | null>;
}

/**
 * Service authorization service interface
 */
export interface IServiceAuthorizationService {
  /**
   * Check if principal has capability
   */
  hasCapability(principal: ServicePrincipal, capability: ServiceCapability): boolean;
  
  /**
   * Require capability or throw
   */
  requireCapability(principal: ServicePrincipal, capability: ServiceCapability): void;
  
  /**
   * Authorize action in context
   */
  authorize(context: AuthorizationContext): Promise<AuthorizationDecision>;
  
  /**
   * Check if service can send notification purpose
   */
  canSendNotificationPurpose(
    serviceId: ServiceId,
    purpose: NotificationPurpose
  ): boolean;
  
  /**
   * Check if service can act for tenant
   */
  canActForTenant(
    principal: ServicePrincipal,
    tenantId: string
  ): Promise<boolean>;
}

/**
 * Replay protection service interface
 */
export interface IReplayProtectionService {
  /**
   * Check and consume JWT ID
   * Throws if JTI has been used before
   */
  consume(principal: ServicePrincipal): Promise<void>;
  
  /**
   * Check if JTI has been used
   */
  isReplayed(serviceId: ServiceId, jti: string): Promise<ReplayCheckResult>;
  
  /**
   * Record JTI as consumed
   */
  record(serviceId: ServiceId, jti: string, expiresAt: Date): Promise<void>;
}

/**
 * Idempotency service interface
 */
export interface INotificationIdempotencyService {
  /**
   * Check idempotency and return existing notification if duplicate
   */
  check(
    tenantId: string,
    serviceId: ServiceId,
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult>;
  
  /**
   * Record idempotency after successful notification creation
   */
  record(
    tenantId: string,
    serviceId: ServiceId,
    idempotencyKey: string,
    requestHash: string,
    notificationId: string,
    ttlSeconds: number
  ): Promise<void>;
}

/**
 * Rate policy service interface
 */
export interface INotificationRatePolicyService {
  /**
   * Check rate limits before processing notification
   * Throws RateLimitExceededError if any limit is exceeded
   */
  check(context: RateLimitContext): Promise<void>;
  
  /**
   * Increment rate limit counters after accepting notification
   */
  increment(context: RateLimitContext): Promise<void>;
  
  /**
   * Get current rate limit status
   */
  getStatus(context: RateLimitContext): Promise<RateLimitResult>;
}

/**
 * Service audit service interface
 */
export interface IServiceAuditService {
  /**
   * Record audit event
   */
  record(event: Omit<ServiceAuthAuditEvent, 'id' | 'timestamp'>): Promise<void>;
  
  /**
   * Query audit events
   */
  query(filters: {
    serviceId?: ServiceId;
    tenantId?: string;
    action?: ServiceAuditAction;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ServiceAuthAuditEvent[]>;
}

// =====================================================
// Utility Types
// =====================================================

/**
 * Type guard for service capability
 */
export function isServiceCapability(value: string): value is ServiceCapability {
  const capabilities: ServiceCapability[] = [
    'notifications:create',
    'notifications:read',
    'notifications:cancel',
    'analytics:submit',
    'events:publish',
    'health:read',
  ];
  return capabilities.includes(value as ServiceCapability);
}

/**
 * Type guard for service ID
 */
export function isServiceId(value: string): value is ServiceId {
  const serviceIds: ServiceId[] = [
    'analytics-engine',
    'recording-service',
    'compliance-service',
    'health-monitor',
    'edge-agent',
  ];
  return serviceIds.includes(value as ServiceId);
}

/**
 * Type guard for notification purpose
 */
export function isNotificationPurpose(value: string): value is NotificationPurpose {
  return Object.values(NotificationPurpose).includes(value as NotificationPurpose);
}
