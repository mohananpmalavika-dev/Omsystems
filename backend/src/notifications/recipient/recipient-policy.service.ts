/**
 * Recipient Policy Service
 * 
 * Handles authorization of recipient selectors and preference filtering of endpoints.
 * Enforces tenant policies and user preferences while respecting emergency overrides.
 */

import { logger } from '../../utils/logger.js';
import {
  RecipientSelector,
  NotificationPurpose,
  NotificationSeverity,
} from './recipient.types.js';
import {
  DeliveryEndpoint,
  NotificationPreferences,
  PreferencePolicy,
  PreferencePolicyResult,
} from './endpoint.types.js';

/**
 * Policy evaluation context
 */
export interface PolicyContext {
  tenantId: string;
  notificationType: string;
  purpose: NotificationPurpose;
  severity: NotificationSeverity;
  requestedBy?: string; // Service or user ID
}

/**
 * Authorization request
 */
export interface AuthorizationRequest {
  context: PolicyContext;
  selectors: RecipientSelector[];
}

/**
 * Authorization result
 */
export interface AuthorizationResult {
  allowed: boolean;
  deniedSelectors: Array<{
    selector: RecipientSelector;
    reason: string;
  }>;
}

/**
 * Preference filter request
 */
export interface PreferenceFilterRequest {
  tenantId: string;
  userId: string;
  notificationType: string;
  severity: NotificationSeverity;
  purpose: NotificationPurpose;
  endpoints: DeliveryEndpoint[];
}

/**
 * Repository interface for preferences
 */
export interface INotificationPreferenceRepository {
  findUserPreferences(params: {
    tenantId: string;
    userId: string;
  }): Promise<NotificationPreferences | null>;
}

/**
 * RecipientPolicyService - authorization and preference filtering
 */
export class RecipientPolicyService {
  // Define which purposes allow external recipients
  private readonly externalRecipientAllowedPurposes: NotificationPurpose[] = [
    'INFORMATIONAL',
    'MARKETING',
  ];

  // Define which selectors require authorization
  private readonly restrictedSelectorTypes: RecipientSelector['type'][] = [
    'EMAIL',
    'PHONE',
  ];

  constructor(
    private readonly preferences: INotificationPreferenceRepository,
  ) {}

  /**
   * Authorize recipient selectors
   * Prevents unauthorized use of external addresses for sensitive notifications
   */
  async authorize(
    request: AuthorizationRequest
  ): Promise<AuthorizationResult> {
    const deniedSelectors: Array<{
      selector: RecipientSelector;
      reason: string;
    }> = [];

    for (const selector of request.selectors) {
      // Check if external recipients are allowed
      if (
        (selector.type === 'EMAIL' || selector.type === 'PHONE') &&
        !this.externalRecipientAllowedPurposes.includes(request.context.purpose)
      ) {
        deniedSelectors.push({
          selector,
          reason: `External ${selector.type.toLowerCase()} recipients not allowed for ${request.context.purpose} notifications`,
        });
      }

      // Additional authorization checks can be added here
      // For example: checking if requestedBy has permission to send to certain roles
    }

    const allowed = deniedSelectors.length === 0;

    if (!allowed) {
      logger.warn('Recipient authorization denied', {
        tenantId: request.context.tenantId,
        purpose: request.context.purpose,
        deniedCount: deniedSelectors.length,
      });
    }

    return {
      allowed,
      deniedSelectors,
    };
  }

  /**
   * Filter endpoints based on user preferences and tenant policies
   */
  async filterEndpoints(
    request: PreferenceFilterRequest
  ): Promise<DeliveryEndpoint[]> {
    const { endpoints, tenantId, userId, notificationType, severity, purpose } = request;

    // Get preference policy for this notification
    const policy = this.getPreferencePolicy(purpose);

    // If policy mandates delivery, skip preference check
    if (!policy.userControllable || policy.override === 'ALWAYS') {
      logger.debug('Bypassing preference filter due to policy', {
        tenantId,
        userId,
        purpose,
        policy: policy.override,
      });
      return endpoints;
    }

    // For critical notifications, check if policy allows override
    if (
      severity === 'CRITICAL' || 
      severity === 'EMERGENCY'
    ) {
      if (policy.override === 'CRITICAL_ONLY') {
        logger.debug('Bypassing preference filter for critical notification', {
          tenantId,
          userId,
          severity,
        });
        return endpoints;
      }
    }

    // Load user preferences
    const prefs = await this.preferences.findUserPreferences({
      tenantId,
      userId,
    });

    // If no preferences, allow all (opt-out model)
    if (!prefs) {
      return endpoints;
    }

    // Filter endpoints based on preferences
    const filtered = endpoints.filter(endpoint => {
      const result = this.evaluatePreference(
        endpoint,
        prefs,
        notificationType,
        severity,
        policy
      );

      if (!result.allowed) {
        logger.debug('Endpoint filtered by preference', {
          tenantId,
          userId,
          channel: endpoint.channel,
          reason: result.reason,
        });
      }

      return result.allowed;
    });

    logger.info('Preference filtering complete', {
      tenantId,
      userId,
      originalCount: endpoints.length,
      filteredCount: filtered.length,
    });

    return filtered;
  }

  /**
   * Evaluate preference for a single endpoint
   */
  private evaluatePreference(
    endpoint: DeliveryEndpoint,
    prefs: NotificationPreferences,
    notificationType: string,
    severity: NotificationSeverity,
    policy: PreferencePolicy
  ): PreferencePolicyResult {
    // Check if channel is in required channels (cannot be disabled)
    if (policy.requiredChannels?.includes(endpoint.channel)) {
      return {
        allowed: true,
        policy: 'TENANT_POLICY',
      };
    }

    // Check channel-level preference
    const channelPref = this.getChannelPreference(prefs, endpoint.channel);
    
    if (!channelPref.enabled) {
      return {
        allowed: false,
        reason: `${endpoint.channel} channel disabled by user`,
        policy: 'USER_PREFERENCE',
      };
    }

    // Check minimum severity for channel
    if (channelPref.minimumSeverity) {
      if (!this.meetsSeverityThreshold(severity, channelPref.minimumSeverity)) {
        return {
          allowed: false,
          reason: `Notification severity ${severity} below minimum ${channelPref.minimumSeverity}`,
          policy: 'USER_PREFERENCE',
        };
      }
    }

    // Check event-specific preference
    const eventPref = prefs.eventFilters[notificationType];
    if (eventPref) {
      if (!eventPref.enabled) {
        return {
          allowed: false,
          reason: `Event type ${notificationType} disabled by user`,
          policy: 'USER_PREFERENCE',
        };
      }

      // Check if channel is allowed for this event
      if (eventPref.channels && !eventPref.channels.includes(endpoint.channel)) {
        return {
          allowed: false,
          reason: `${endpoint.channel} not allowed for ${notificationType}`,
          policy: 'USER_PREFERENCE',
        };
      }

      // Check event minimum severity
      if (eventPref.minimumSeverity) {
        if (!this.meetsSeverityThreshold(severity, eventPref.minimumSeverity)) {
          return {
            allowed: false,
            reason: `Event severity ${severity} below minimum ${eventPref.minimumSeverity}`,
            policy: 'USER_PREFERENCE',
          };
        }
      }
    }

    // Check quiet hours
    if (prefs.quietHours?.enabled) {
      if (this.isInQuietHours(prefs.quietHours, new Date())) {
        // Allow critical if configured
        if (prefs.quietHours.allowCritical && 
            (severity === 'CRITICAL' || severity === 'EMERGENCY')) {
          return {
            allowed: true,
            reason: 'Critical notification during quiet hours',
            policy: 'USER_PREFERENCE',
          };
        }

        return {
          allowed: false,
          reason: 'In quiet hours',
          policy: 'USER_PREFERENCE',
        };
      }
    }

    return {
      allowed: true,
      policy: 'USER_PREFERENCE',
    };
  }

  /**
   * Get channel preference from preferences object
   */
  private getChannelPreference(
    prefs: NotificationPreferences,
    channel: string
  ): { enabled: boolean; minimumSeverity?: string } {
    switch (channel) {
      case 'EMAIL':
        return prefs.channels.email;
      case 'SMS':
        return prefs.channels.sms;
      case 'PUSH':
        return prefs.channels.push;
      case 'IN_APP':
        return prefs.channels.inApp;
      default:
        return { enabled: true }; // Default allow for unknown channels
    }
  }

  /**
   * Check if severity meets threshold
   */
  private meetsSeverityThreshold(
    actual: NotificationSeverity,
    minimum: string
  ): boolean {
    const severityOrder: NotificationSeverity[] = [
      'INFO',
      'WARNING',
      'CRITICAL',
      'EMERGENCY',
    ];

    const actualIndex = severityOrder.indexOf(actual);
    const minimumIndex = severityOrder.indexOf(minimum as NotificationSeverity);

    return actualIndex >= minimumIndex;
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(
    quietHours: NonNullable<NotificationPreferences['quietHours']>,
    now: Date
  ): boolean {
    // Simple implementation - in production use proper timezone handling
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();

    // Check if today is in allowed days
    if (!quietHours.days.includes(currentDay)) {
      return false;
    }

    // Parse start and end times
    const [startHour, startMinute] = quietHours.startTime.split(':').map(Number);
    const [endHour, endMinute] = quietHours.endTime.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Get preference policy for notification purpose
   */
  private getPreferencePolicy(purpose: NotificationPurpose): PreferencePolicy {
    switch (purpose) {
      case 'OPERATIONAL':
        return {
          purpose,
          userControllable: true,
          override: 'CRITICAL_ONLY',
          requiredChannels: undefined,
        };

      case 'SECURITY':
        return {
          purpose,
          userControllable: false, // Security notifications cannot be disabled
          override: 'ALWAYS',
          requiredChannels: ['EMAIL', 'SMS'], // Must receive via these channels
        };

      case 'INFORMATIONAL':
        return {
          purpose,
          userControllable: true,
          override: 'NEVER',
          requiredChannels: undefined,
        };

      case 'MARKETING':
        return {
          purpose,
          userControllable: true,
          override: 'NEVER',
          requiredChannels: undefined,
        };

      default:
        return {
          purpose: 'INFORMATIONAL',
          userControllable: true,
          override: 'NEVER',
          requiredChannels: undefined,
        };
    }
  }

  /**
   * Validate that at least one endpoint remains after filtering
   * Used for critical notifications where delivery must succeed
   */
  validateMinimumEndpoints(
    endpoints: DeliveryEndpoint[],
    minimumRequired: number = 1
  ): { valid: boolean; message?: string } {
    if (endpoints.length < minimumRequired) {
      return {
        valid: false,
        message: `Only ${endpoints.length} endpoints available, ${minimumRequired} required`,
      };
    }

    return { valid: true };
  }

  /**
   * Get fallback endpoints if user preferences block all delivery
   * Used for emergency situations
   */
  async getFallbackEndpoints(
    request: PreferenceFilterRequest
  ): Promise<DeliveryEndpoint[]> {
    // For emergency situations, return unfiltered endpoints
    // This ensures critical notifications always get through
    if (request.severity === 'EMERGENCY') {
      logger.warn('Using fallback endpoints for emergency notification', {
        tenantId: request.tenantId,
        userId: request.userId,
      });
      return request.endpoints;
    }

    return [];
  }
}
