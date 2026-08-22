/**
 * Service Authorization Service
 * 
 * Handles authorization decisions for authenticated services.
 * Implements capability-based access control with tenant isolation,
 * purpose restrictions, and resource ownership validation.
 */

import {
  ServicePrincipal,
  ServiceCapability,
  ServiceId,
  NotificationPurpose,
  AuthorizationContext,
  AuthorizationDecision,
  ServiceNotificationPolicy,
  IServiceAuthorizationService,
  ServiceAuthorizationError,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Service notification policies
 * 
 * Defines what each service is allowed to do.
 * In production, this should be loaded from configuration or database.
 */
const SERVICE_NOTIFICATION_POLICIES: Record<ServiceId, ServiceNotificationPolicy> = {
  'analytics-engine': {
    serviceId: 'analytics-engine',
    allowedPurposes: [
      NotificationPurpose.ALERT_ESCALATION,
      NotificationPurpose.INCIDENT_CREATED,
      NotificationPurpose.SECURITY_EVENT,
    ],
    crossTenantAllowed: false,
    rateLimits: {
      perTenantPerMinute: 100,
      perPurposePerMinute: 50,
      recipientsPerTenantPerMinute: 200,
      maxRecipientsPerRequest: 20,
    },
  },
  'recording-service': {
    serviceId: 'recording-service',
    allowedPurposes: [
      NotificationPurpose.RECORDING_FAILURE,
      NotificationPurpose.DEVICE_OFFLINE,
    ],
    crossTenantAllowed: false,
    rateLimits: {
      perTenantPerMinute: 50,
      perPurposePerMinute: 30,
      recipientsPerTenantPerMinute: 100,
      maxRecipientsPerRequest: 10,
    },
  },
  'compliance-service': {
    serviceId: 'compliance-service',
    allowedPurposes: [
      NotificationPurpose.COMPLIANCE_VIOLATION,
      NotificationPurpose.USER_ACTION_REQUIRED,
    ],
    crossTenantAllowed: false,
    rateLimits: {
      perTenantPerMinute: 30,
      perPurposePerMinute: 20,
      recipientsPerTenantPerMinute: 60,
      maxRecipientsPerRequest: 5,
    },
  },
  'health-monitor': {
    serviceId: 'health-monitor',
    allowedPurposes: [
      NotificationPurpose.HEALTH_CHECK_FAILED,
      NotificationPurpose.DEVICE_OFFLINE,
      NotificationPurpose.SYSTEM_MAINTENANCE,
    ],
    crossTenantAllowed: true, // Health monitor can send system-wide notifications
    rateLimits: {
      perTenantPerMinute: 20,
      perPurposePerMinute: 10,
      recipientsPerTenantPerMinute: 50,
      maxRecipientsPerRequest: 10,
    },
  },
  'edge-agent': {
    serviceId: 'edge-agent',
    allowedPurposes: [
      NotificationPurpose.DEVICE_OFFLINE,
      NotificationPurpose.SECURITY_EVENT,
    ],
    crossTenantAllowed: false,
    rateLimits: {
      perTenantPerMinute: 40,
      perPurposePerMinute: 25,
      recipientsPerTenantPerMinute: 80,
      maxRecipientsPerRequest: 5,
    },
  },
};

export class ServiceAuthorizationService implements IServiceAuthorizationService {
  /**
   * Check if principal has capability
   */
  hasCapability(principal: ServicePrincipal, capability: ServiceCapability): boolean {
    return principal.capabilities.includes(capability);
  }

  /**
   * Require capability or throw
   */
  requireCapability(principal: ServicePrincipal, capability: ServiceCapability): void {
    if (!this.hasCapability(principal, capability)) {
      throw new ServiceAuthorizationError(
        `Service ${principal.serviceId} lacks required capability: ${capability}`,
        'MISSING_CAPABILITY',
        403,
        {
          serviceId: principal.serviceId,
          requiredCapability: capability,
          availableCapabilities: principal.capabilities,
        }
      );
    }
  }

  /**
   * Authorize action in context
   * 
   * Performs comprehensive authorization check including:
   * - Capability check
   * - Tenant authorization (if applicable)
   * - Resource-specific authorization
   */
  async authorize(context: AuthorizationContext): Promise<AuthorizationDecision> {
    const { principal, action, tenantId, resource, attributes } = context;

    // Check capability
    if (!this.hasCapability(principal, action)) {
      return {
        allowed: false,
        reason: `Service ${principal.serviceId} lacks capability: ${action}`,
        policyRule: 'capability-check',
      };
    }

    // Check tenant authorization
    if (tenantId) {
      const canActForTenant = await this.canActForTenant(principal, tenantId);
      
      if (!canActForTenant) {
        return {
          allowed: false,
          reason: `Service ${principal.serviceId} not authorized for tenant: ${tenantId}`,
          policyRule: 'tenant-authorization',
        };
      }
    }

    // Resource-specific authorization
    if (resource === 'notification' && attributes?.purpose) {
      const purpose = attributes.purpose as NotificationPurpose;
      
      if (!this.canSendNotificationPurpose(principal.serviceId, purpose)) {
        return {
          allowed: false,
          reason: `Service ${principal.serviceId} not allowed to send notification purpose: ${purpose}`,
          policyRule: 'notification-purpose-policy',
        };
      }
    }

    // All checks passed
    logger.debug('Authorization granted', {
      serviceId: principal.serviceId,
      action,
      tenantId,
      resource,
    });

    return {
      allowed: true,
      reason: 'All authorization checks passed',
      policyRule: 'allow',
    };
  }

  /**
   * Check if service can send notification purpose
   */
  canSendNotificationPurpose(serviceId: ServiceId, purpose: NotificationPurpose): boolean {
    const policy = SERVICE_NOTIFICATION_POLICIES[serviceId];
    
    if (!policy) {
      logger.warn('No notification policy found for service', { serviceId });
      return false;
    }

    return policy.allowedPurposes.includes(purpose);
  }

  /**
   * Check if service can act for tenant
   * 
   * Current implementation:
   * - If principal has tenantId claim, it must match requested tenant
   * - If principal has no tenantId claim and service allows cross-tenant, allow
   * - Otherwise deny
   * 
   * Production implementation should:
   * - Query tenant_service_grants table
   * - Check service registration for tenant
   * - Validate service is active for tenant
   */
  async canActForTenant(principal: ServicePrincipal, tenantId: string): Promise<boolean> {
    const policy = SERVICE_NOTIFICATION_POLICIES[principal.serviceId];
    
    if (!policy) {
      logger.warn('No policy found for service', { serviceId: principal.serviceId });
      return false;
    }

    // If JWT has tenant claim, it must match
    if (principal.tenantId) {
      if (principal.tenantId !== tenantId) {
        logger.warn('Service tenant mismatch', {
          serviceId: principal.serviceId,
          claimTenant: principal.tenantId,
          requestedTenant: tenantId,
        });
        return false;
      }
      return true;
    }

    // If no tenant claim, check if cross-tenant is allowed
    if (!policy.crossTenantAllowed) {
      logger.warn('Cross-tenant access denied', {
        serviceId: principal.serviceId,
        tenantId,
      });
      return false;
    }

    // Cross-tenant allowed
    logger.debug('Cross-tenant access granted', {
      serviceId: principal.serviceId,
      tenantId,
    });

    return true;
  }

  /**
   * Get notification policy for service
   */
  getNotificationPolicy(serviceId: ServiceId): ServiceNotificationPolicy | null {
    return SERVICE_NOTIFICATION_POLICIES[serviceId] || null;
  }

  /**
   * Get all service policies (for admin/debugging)
   */
  getAllPolicies(): ServiceNotificationPolicy[] {
    return Object.values(SERVICE_NOTIFICATION_POLICIES);
  }
}

/**
 * Factory function for creating ServiceAuthorizationService
 */
export function createServiceAuthorizationService(): ServiceAuthorizationService {
  return new ServiceAuthorizationService();
}
