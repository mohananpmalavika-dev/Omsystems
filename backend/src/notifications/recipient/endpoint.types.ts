/**
 * Endpoint Resolution Types
 * 
 * Defines types for converting resolved principals into verified delivery endpoints.
 * Separates "who receives" from "where to send".
 */

import { NotificationChannel, RecipientProvenance } from './recipient.types.js';

// =====================================================
// Delivery Endpoints
// =====================================================

/**
 * Verified delivery endpoint
 * Represents a concrete destination for notification delivery
 */
export interface DeliveryEndpoint {
  /** Unique identifier for this endpoint */
  id: string;

  /** Principal this endpoint belongs to */
  principalId?: string;

  /** Delivery channel */
  channel: NotificationChannel;

  /** Destination address (email, phone, push token, etc.) */
  address: string;

  /** Verification state */
  verification: EndpointVerification;

  /** Lifecycle state */
  lifecycle: EndpointLifecycle;

  /** Provenance chain from principal resolution */
  provenance: RecipientProvenance[];

  /** Channel-specific metadata */
  metadata?: EndpointMetadata;
}

/**
 * Endpoint verification state
 */
export interface EndpointVerification {
  /** Verification status */
  state: 'VERIFIED' | 'UNVERIFIED';

  /** When verification occurred */
  verifiedAt?: Date;

  /** Verification method */
  method?: 'EMAIL_LINK' | 'SMS_CODE' | 'DEVICE_REGISTRATION' | 'ADMIN_VERIFIED';
}

/**
 * Endpoint lifecycle state
 */
export interface EndpointLifecycle {
  /** Is this endpoint enabled? */
  enabled: boolean;

  /** When was it invalidated (bounced, unsubscribed, etc.) */
  invalidatedAt?: Date;

  /** Invalidation reason */
  invalidationReason?: InvalidationReason;

  /** Last successful delivery timestamp */
  lastSeenAt?: Date;

  /** Last activity timestamp */
  lastActiveAt?: Date;
}

/**
 * Why an endpoint was invalidated
 */
export type InvalidationReason =
  | 'BOUNCED'              // Email bounced
  | 'INVALID_TOKEN'        // Push token invalid
  | 'OPTED_OUT'            // User opted out
  | 'SUSPENDED'            // Administrative suspension
  | 'STALE'                // No activity for extended period
  | 'PROVIDER_ERROR';      // Provider reported permanent failure

/**
 * Channel-specific metadata
 */
export type EndpointMetadata = 
  | EmailMetadata
  | SmsMetadata
  | PushMetadata
  | WebhookMetadata;

export interface EmailMetadata {
  channel: 'EMAIL';
  emailType?: 'PERSONAL' | 'WORK';
  bounceCount?: number;
  lastBounceAt?: Date;
}

export interface SmsMetadata {
  channel: 'SMS';
  phoneType?: 'MOBILE' | 'LANDLINE' | 'VOIP';
  carrier?: string;
  countryCode?: string;
}

export interface PushMetadata {
  channel: 'PUSH';
  provider: 'FCM' | 'APNS' | 'WEB_PUSH';
  platform?: 'ANDROID' | 'IOS' | 'WEB';
  deviceId?: string;
  appVersion?: string;
  registeredAt: Date;
}

export interface WebhookMetadata {
  channel: 'WEBHOOK';
  signatureMethod?: string;
  lastResponseCode?: number;
}

// =====================================================
// Endpoint Resolution Results
// =====================================================

/**
 * Result of endpoint resolution
 */
export interface EndpointResolutionResult {
  /** Successfully resolved endpoints */
  endpoints: DeliveryEndpoint[];

  /** Endpoint resolution warnings */
  warnings: EndpointResolutionWarning[];

  /** Resolution metadata */
  metadata?: {
    /** Principals processed */
    principalsProcessed: number;

    /** Endpoints before deduplication */
    endpointsBeforeDedup: number;

    /** Endpoints filtered by preferences */
    endpointsFilteredByPreference: number;

    /** Resolution duration */
    durationMs: number;
  };
}

/**
 * Endpoint resolution warning
 */
export interface EndpointResolutionWarning {
  /** Principal that generated this warning */
  principalId?: string;

  /** Warning code */
  code: EndpointWarningCode;

  /** Warning message */
  message: string;

  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Endpoint warning codes
 */
export type EndpointWarningCode =
  | 'NO_VERIFIED_EMAIL'
  | 'NO_VERIFIED_PHONE'
  | 'NO_PUSH_DEVICES'
  | 'ENDPOINT_UNVERIFIED'
  | 'ENDPOINT_STALE'
  | 'PREFERENCE_BLOCKED'
  | 'ALL_ENDPOINTS_DISABLED';

// =====================================================
// Push Device Types
// =====================================================

/**
 * Push device record
 */
export interface PushDevice {
  id: string;
  tenantId: string;
  userId: string;
  provider: 'FCM' | 'APNS' | 'WEB_PUSH';
  platform?: 'ANDROID' | 'IOS' | 'WEB';
  token: string;
  deviceId?: string;
  enabled: boolean;
  registeredAt: Date;
  lastSeenAt?: Date;
  invalidatedAt?: Date;
  metadata: Record<string, unknown>;
}

// =====================================================
// Notification Preferences
// =====================================================

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  
  /** Channel preferences */
  channels: ChannelPreferences;
  
  /** Event-type specific preferences */
  eventFilters: Record<string, EventPreference>;
  
  /** Quiet hours configuration */
  quietHours?: QuietHoursConfig;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Channel-level preferences
 */
export interface ChannelPreferences {
  email: ChannelPreference;
  sms: ChannelPreference;
  push: ChannelPreference;
  inApp: ChannelPreference;
}

/**
 * Individual channel preference
 */
export interface ChannelPreference {
  /** Is this channel enabled? */
  enabled: boolean;
  
  /** Minimum severity to receive */
  minimumSeverity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
}

/**
 * Event-specific preference
 */
export interface EventPreference {
  /** Is this event type enabled? */
  enabled: boolean;
  
  /** Allowed channels for this event */
  channels?: NotificationChannel[];
  
  /** Minimum severity */
  minimumSeverity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
}

/**
 * Quiet hours configuration
 */
export interface QuietHoursConfig {
  /** Is quiet hours enabled? */
  enabled: boolean;
  
  /** Start time (HH:MM format in user's timezone) */
  startTime: string;
  
  /** End time (HH:MM format) */
  endTime: string;
  
  /** Timezone */
  timezone: string;
  
  /** Days of week (0 = Sunday, 6 = Saturday) */
  days: number[];
  
  /** Allow critical notifications during quiet hours? */
  allowCritical: boolean;
}

// =====================================================
// Preference Policy
// =====================================================

/**
 * Tenant-level preference policy
 * Controls whether users can override notification settings
 */
export interface PreferencePolicy {
  /** Notification purpose */
  purpose: 'OPERATIONAL' | 'SECURITY' | 'INFORMATIONAL' | 'MARKETING';
  
  /** Can users control this? */
  userControllable: boolean;
  
  /** Override policy */
  override: 'NEVER' | 'CRITICAL_ONLY' | 'ALWAYS';
  
  /** Required channels that cannot be disabled */
  requiredChannels?: NotificationChannel[];
}

/**
 * Preference policy evaluation result
 */
export interface PreferencePolicyResult {
  /** Should this endpoint be used? */
  allowed: boolean;
  
  /** Reason if blocked */
  reason?: string;
  
  /** Policy that made the decision */
  policy?: 'USER_PREFERENCE' | 'TENANT_POLICY' | 'EMERGENCY_OVERRIDE';
}

// =====================================================
// Endpoint Deduplication
// =====================================================

/**
 * Create deduplication key for endpoint
 */
export function createEndpointKey(endpoint: DeliveryEndpoint): string {
  return `${endpoint.channel}:${normalizeAddress(endpoint.channel, endpoint.address)}`;
}

/**
 * Normalize address for deduplication
 */
function normalizeAddress(channel: NotificationChannel, address: string): string {
  switch (channel) {
    case 'EMAIL':
      return address.toLowerCase().trim();
    
    case 'SMS':
      // Normalize to E.164
      const digits = address.replace(/\D/g, '');
      return digits.startsWith('+') ? digits : `+${digits}`;
    
    case 'PUSH':
      // Push tokens are already unique
      return address;
    
    case 'WEBHOOK':
      // Normalize URL
      return new URL(address).href;
    
    case 'IN_APP':
      // User ID based
      return address;
    
    default:
      return address;
  }
}

/**
 * Merge endpoints with same key
 */
export function deduplicateEndpoints(
  endpoints: DeliveryEndpoint[]
): DeliveryEndpoint[] {
  const map = new Map<string, DeliveryEndpoint>();
  
  for (const endpoint of endpoints) {
    const key = createEndpointKey(endpoint);
    const existing = map.get(key);
    
    if (!existing) {
      map.set(key, endpoint);
      continue;
    }
    
    // Merge provenance
    existing.provenance.push(...endpoint.provenance);
    
    // Prefer verified over unverified
    if (endpoint.verification.state === 'VERIFIED' && 
        existing.verification.state === 'UNVERIFIED') {
      existing.verification = endpoint.verification;
    }
    
    // Prefer more recent last seen
    if (endpoint.lifecycle.lastSeenAt && 
        (!existing.lifecycle.lastSeenAt || 
         endpoint.lifecycle.lastSeenAt > existing.lifecycle.lastSeenAt)) {
      existing.lifecycle.lastSeenAt = endpoint.lifecycle.lastSeenAt;
    }
  }
  
  return [...map.values()];
}

/**
 * Filter stale endpoints
 */
export function filterStaleEndpoints(
  endpoints: DeliveryEndpoint[],
  staleDays: number = 180
): DeliveryEndpoint[] {
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - staleDays);
  
  return endpoints.filter(endpoint => {
    // Always allow if no last seen (newly added)
    if (!endpoint.lifecycle.lastSeenAt) {
      return true;
    }
    
    // Filter if stale
    return endpoint.lifecycle.lastSeenAt > staleThreshold;
  });
}

/**
 * Filter only verified endpoints
 */
export function filterVerifiedEndpoints(
  endpoints: DeliveryEndpoint[]
): DeliveryEndpoint[] {
  return endpoints.filter(
    endpoint => endpoint.verification.state === 'VERIFIED'
  );
}

/**
 * Filter enabled endpoints
 */
export function filterEnabledEndpoints(
  endpoints: DeliveryEndpoint[]
): DeliveryEndpoint[] {
  return endpoints.filter(
    endpoint => 
      endpoint.lifecycle.enabled && 
      !endpoint.lifecycle.invalidatedAt
  );
}

/**
 * Apply all standard filters
 */
export function applyStandardFilters(
  endpoints: DeliveryEndpoint[],
  options: {
    requireVerified?: boolean;
    requireEnabled?: boolean;
    filterStale?: boolean;
    staleDays?: number;
  } = {}
): DeliveryEndpoint[] {
  let filtered = endpoints;
  
  if (options.requireEnabled !== false) {
    filtered = filterEnabledEndpoints(filtered);
  }
  
  if (options.requireVerified !== false) {
    filtered = filterVerifiedEndpoints(filtered);
  }
  
  if (options.filterStale !== false) {
    filtered = filterStaleEndpoints(filtered, options.staleDays);
  }
  
  return filtered;
}

/**
 * Hash endpoint address for logging (security)
 */
export function hashEndpoint(address: string): string {
  // Simple hash for logging - should use crypto.createHash in production
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `ep_${Math.abs(hash).toString(36)}`;
}
