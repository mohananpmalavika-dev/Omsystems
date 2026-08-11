/**
 * Endpoint Resolver Service
 * 
 * Converts resolved principals into verified delivery endpoints.
 * Handles email/SMS/push device lookup with verification checks.
 */

import { logger } from '../../utils/logger.js';
import {
  ResolvedPrincipal,
  RecipientResolutionContext,
  UserIdentity,
  isExternalPrincipal,
  isUserPrincipal,
} from './recipient.types.js';
import {
  DeliveryEndpoint,
  EndpointResolutionResult,
  EndpointResolutionWarning,
  EndpointWarningCode,
  PushDevice,
  NotificationPreferences,
  deduplicateEndpoints,
  applyStandardFilters,
} from './endpoint.types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Repository interfaces for endpoint data
 */
export interface IUserRepository {
  findActiveTenantUser(params: {
    tenantId: string;
    userId: string;
  }): Promise<UserIdentity | null>;
}

export interface IPushDeviceRepository {
  findActiveDevices(params: {
    tenantId: string;
    userId: string;
  }): Promise<PushDevice[]>;
}

export interface INotificationPreferenceRepository {
  findUserPreferences(params: {
    tenantId: string;
    userId: string;
  }): Promise<NotificationPreferences | null>;
}

/**
 * EndpointResolver - converts principals to delivery endpoints
 */
export class EndpointResolver {
  constructor(
    private readonly users: IUserRepository,
    private readonly devices: IPushDeviceRepository,
    private readonly preferences: INotificationPreferenceRepository,
  ) {}

  /**
   * Resolve principals to delivery endpoints
   */
  async resolve(
    principals: ResolvedPrincipal[],
    context: RecipientResolutionContext,
  ): Promise<EndpointResolutionResult> {
    const startTime = Date.now();
    const allEndpoints: DeliveryEndpoint[] = [];
    const warnings: EndpointResolutionWarning[] = [];

    logger.debug('Starting endpoint resolution', {
      tenantId: context.tenantId,
      principalCount: principals.length,
    });

    // Resolve endpoints for each principal
    for (const principal of principals) {
      if (isExternalPrincipal(principal)) {
        const endpoint = this.resolveExternal(principal);
        allEndpoints.push(endpoint);
      } else if (isUserPrincipal(principal)) {
        const result = await this.resolveUserEndpoints(principal, context);
        allEndpoints.push(...result.endpoints);
        warnings.push(...result.warnings);
      }
    }

    // Deduplicate endpoints
    const endpointsBeforeDedup = allEndpoints.length;
    const deduplicated = deduplicateEndpoints(allEndpoints);

    // Apply standard filters (verified, enabled, not stale)
    const filtered = applyStandardFilters(deduplicated, {
      requireVerified: true,
      requireEnabled: true,
      filterStale: true,
      staleDays: 180,
    });

    const durationMs = Date.now() - startTime;

    logger.info('Endpoint resolution complete', {
      tenantId: context.tenantId,
      endpointsResolved: filtered.length,
      endpointsFiltered: deduplicated.length - filtered.length,
      warnings: warnings.length,
      durationMs,
    });

    return {
      endpoints: filtered,
      warnings,
      metadata: {
        principalsProcessed: principals.length,
        endpointsBeforeDedup,
        endpointsFilteredByPreference: 0, // Will be updated by policy service
        durationMs,
      },
    };
  }

  /**
   * Resolve external principal to endpoint
   */
  private resolveExternal(
    principal: ResolvedPrincipal
  ): DeliveryEndpoint {
    if (!isExternalPrincipal(principal)) {
      throw new Error('Principal is not external');
    }

    return {
      id: uuidv4(),
      principalId: undefined, // No user ID for external
      channel: principal.externalEndpoint.channel,
      address: principal.externalEndpoint.address,
      verification: {
        state: 'UNVERIFIED', // External addresses are unverified
      },
      lifecycle: {
        enabled: true,
        lastActiveAt: new Date(),
      },
      provenance: principal.provenance,
      metadata: {
        channel: principal.externalEndpoint.channel,
      } as any,
    };
  }

  /**
   * Resolve user principal to endpoints
   * Looks up email, phone, and push devices
   */
  private async resolveUserEndpoints(
    principal: ResolvedPrincipal & { userId: string },
    context: RecipientResolutionContext,
  ): Promise<{
    endpoints: DeliveryEndpoint[];
    warnings: EndpointResolutionWarning[];
  }> {
    const endpoints: DeliveryEndpoint[] = [];
    const warnings: EndpointResolutionWarning[] = [];

    // Load user with contact info
    const user = await this.users.findActiveTenantUser({
      tenantId: context.tenantId,
      userId: principal.userId,
    });

    if (!user) {
      warnings.push({
        principalId: principal.userId,
        code: 'NO_VERIFIED_EMAIL',
        message: `User ${principal.userId} not found`,
      });
      return { endpoints, warnings };
    }

    // Resolve email endpoint
    const emailEndpoint = this.resolveEmailEndpoint(user, principal);
    if (emailEndpoint) {
      endpoints.push(emailEndpoint);
    } else if (context.requestedChannels?.includes('EMAIL')) {
      warnings.push({
        principalId: principal.userId,
        code: 'NO_VERIFIED_EMAIL',
        message: `User ${principal.userId} has no verified email`,
      });
    }

    // Resolve SMS endpoint
    const smsEndpoint = this.resolveSmsEndpoint(user, principal);
    if (smsEndpoint) {
      endpoints.push(smsEndpoint);
    } else if (context.requestedChannels?.includes('SMS')) {
      warnings.push({
        principalId: principal.userId,
        code: 'NO_VERIFIED_PHONE',
        message: `User ${principal.userId} has no verified phone`,
      });
    }

    // Resolve push endpoints
    const pushEndpoints = await this.resolvePushEndpoints(
      user,
      principal,
      context
    );
    
    if (pushEndpoints.length > 0) {
      endpoints.push(...pushEndpoints);
    } else if (context.requestedChannels?.includes('PUSH')) {
      warnings.push({
        principalId: principal.userId,
        code: 'NO_PUSH_DEVICES',
        message: `User ${principal.userId} has no active push devices`,
      });
    }

    // Warn if no endpoints at all
    if (endpoints.length === 0) {
      warnings.push({
        principalId: principal.userId,
        code: 'ALL_ENDPOINTS_DISABLED',
        message: `User ${principal.userId} has no available endpoints`,
      });
    }

    return { endpoints, warnings };
  }

  /**
   * Resolve email endpoint with verification check
   */
  private resolveEmailEndpoint(
    user: UserIdentity,
    principal: ResolvedPrincipal & { userId: string }
  ): DeliveryEndpoint | null {
    // Must have email, be verified, and be active
    if (
      !user.email ||
      !user.emailVerifiedAt ||
      user.emailStatus !== 'ACTIVE'
    ) {
      return null;
    }

    return {
      id: uuidv4(),
      principalId: user.id,
      channel: 'EMAIL',
      address: user.email.toLowerCase().trim(),
      verification: {
        state: 'VERIFIED',
        verifiedAt: user.emailVerifiedAt,
        method: 'EMAIL_LINK',
      },
      lifecycle: {
        enabled: true,
        lastActiveAt: new Date(),
      },
      provenance: principal.provenance,
      metadata: {
        channel: 'EMAIL',
        emailType: 'PERSONAL',
      },
    };
  }

  /**
   * Resolve SMS endpoint with verification check
   */
  private resolveSmsEndpoint(
    user: UserIdentity,
    principal: ResolvedPrincipal & { userId: string }
  ): DeliveryEndpoint | null {
    // Must have phone, be verified, and be active
    if (
      !user.phoneNumber ||
      !user.phoneVerifiedAt ||
      user.phoneStatus !== 'ACTIVE'
    ) {
      return null;
    }

    // Normalize phone to E.164
    const normalizedPhone = this.normalizePhone(user.phoneNumber);

    return {
      id: uuidv4(),
      principalId: user.id,
      channel: 'SMS',
      address: normalizedPhone,
      verification: {
        state: 'VERIFIED',
        verifiedAt: user.phoneVerifiedAt,
        method: 'SMS_CODE',
      },
      lifecycle: {
        enabled: true,
        lastActiveAt: new Date(),
      },
      provenance: principal.provenance,
      metadata: {
        channel: 'SMS',
        phoneType: 'MOBILE',
        countryCode: this.extractCountryCode(normalizedPhone),
      },
    };
  }

  /**
   * Resolve push device endpoints
   */
  private async resolvePushEndpoints(
    user: UserIdentity,
    principal: ResolvedPrincipal & { userId: string },
    context: RecipientResolutionContext,
  ): Promise<DeliveryEndpoint[]> {
    const devices = await this.devices.findActiveDevices({
      tenantId: context.tenantId,
      userId: user.id,
    });

    if (devices.length === 0) {
      return [];
    }

    // Filter and convert to endpoints
    const endpoints: DeliveryEndpoint[] = [];

    for (const device of devices) {
      // Skip invalidated devices
      if (device.invalidatedAt) {
        continue;
      }

      // Skip stale devices (no activity in 180 days)
      if (device.lastSeenAt) {
        const daysSinceLastSeen =
          (context.now.getTime() - device.lastSeenAt.getTime()) /
          (1000 * 60 * 60 * 24);
        
        if (daysSinceLastSeen > 180) {
          continue;
        }
      }

      endpoints.push({
        id: uuidv4(),
        principalId: user.id,
        channel: 'PUSH',
        address: device.token,
        verification: {
          state: 'VERIFIED',
          verifiedAt: device.registeredAt,
          method: 'DEVICE_REGISTRATION',
        },
        lifecycle: {
          enabled: device.enabled,
          lastSeenAt: device.lastSeenAt,
          lastActiveAt: device.lastSeenAt,
        },
        provenance: principal.provenance,
        metadata: {
          channel: 'PUSH',
          provider: device.provider,
          platform: device.platform,
          deviceId: device.deviceId,
          registeredAt: device.registeredAt,
        },
      });
    }

    return endpoints;
  }

  /**
   * Normalize phone to E.164 format
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // If it starts with country code, use as-is
    if (digits.startsWith('91') && digits.length === 12) {
      return `+${digits}`;
    }
    
    // If it's 10 digits, assume India (+91)
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    
    // Return with + prefix
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  /**
   * Extract country code from E.164 phone
   */
  private extractCountryCode(phone: string): string {
    // Simple extraction - in production use a proper library
    if (phone.startsWith('+91')) {
      return '+91';
    }
    if (phone.startsWith('+1')) {
      return '+1';
    }
    // Default to first 2-3 digits after +
    const match = phone.match(/^\+(\d{1,3})/);
    return match ? `+${match[1]}` : '+91';
  }
}
