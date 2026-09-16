/**
 * Feature Protection Decorators
 * 
 * TypeScript decorators for protecting service methods with feature flags.
 * 
 * Usage:
 * ```typescript
 * class MyService {
 *   @FeatureProtected('ai-video-search')
 *   async searchVideo(tenantId: string, query: string) {
 *     // This will throw if feature is not enabled
 *   }
 * 
 *   @FeatureProtectedWithLogging('guardian-ai-assistant', 'chat')
 *   async processChat(tenantId: string, userId: string, message: string) {
 *     // This will log usage automatically
 *   }
 * }
 * ```
 */

import { FeatureManagementService } from "../services/feature-management.service.js";

export class FeatureNotAvailableError extends Error {
  constructor(
    public featureKey: string,
    public reason?: string
  ) {
    super(reason || `Feature '${featureKey}' is not available`);
    this.name = "FeatureNotAvailableError";
  }
}

/**
 * Decorator to protect a method with a feature flag
 * Expects first parameter to be tenantId
 */
export function FeatureProtected(featureKey: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tenantId = args[0]; // First argument must be tenantId

      if (!tenantId) {
        throw new Error("tenantId is required as first argument for @FeatureProtected");
      }

      // Get feature service from instance if available
      const featureService: FeatureManagementService = 
        (this as any).featureService || 
        (this as any).pool ? new FeatureManagementService((this as any).pool) : null;

      if (!featureService) {
        throw new Error("FeatureManagementService not available. Add 'featureService' or 'pool' property to class.");
      }

      // Check feature
      const result = await featureService.canUseFeature(tenantId, featureKey);

      if (!result.enabled) {
        throw new FeatureNotAvailableError(featureKey, result.reason);
      }

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator to protect and log feature usage
 * Expects first parameter to be tenantId, second to be userId (optional)
 */
export function FeatureProtectedWithLogging(
  featureKey: string,
  action: string = "access"
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tenantId = args[0];
      const userId = args[1]; // Optional second argument

      if (!tenantId) {
        throw new Error("tenantId is required as first argument");
      }

      const featureService: FeatureManagementService = 
        (this as any).featureService || 
        (this as any).pool ? new FeatureManagementService((this as any).pool) : null;

      if (!featureService) {
        throw new Error("FeatureManagementService not available");
      }

      // Check feature
      const result = await featureService.canUseFeature(tenantId, featureKey);

      if (!result.enabled) {
        throw new FeatureNotAvailableError(featureKey, result.reason);
      }

      // Log usage
      await featureService.logUsage(
        tenantId,
        featureKey,
        userId || undefined,
        action,
        {
          method: propertyKey,
          timestamp: new Date().toISOString(),
        }
      );

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator for optional feature (doesn't throw, returns null if disabled)
 */
export function FeatureOptional(featureKey: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tenantId = args[0];

      if (!tenantId) {
        return null;
      }

      const featureService: FeatureManagementService = 
        (this as any).featureService || 
        (this as any).pool ? new FeatureManagementService((this as any).pool) : null;

      if (!featureService) {
        return null;
      }

      // Check feature
      const enabled = await featureService.isFeatureEnabled(tenantId, featureKey);

      if (!enabled) {
        return null; // Feature disabled, return null instead of throwing
      }

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator to check multiple features (ANY)
 */
export function FeatureProtectedAny(featureKeys: string[]) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tenantId = args[0];

      if (!tenantId) {
        throw new Error("tenantId is required as first argument");
      }

      const featureService: FeatureManagementService = 
        (this as any).featureService || 
        (this as any).pool ? new FeatureManagementService((this as any).pool) : null;

      if (!featureService) {
        throw new Error("FeatureManagementService not available");
      }

      // Check all features
      const features = await featureService.areFeaturesEnabled(tenantId, featureKeys);
      const hasAccess = Object.values(features).some((enabled) => enabled);

      if (!hasAccess) {
        throw new FeatureNotAvailableError(
          featureKeys.join("|"),
          `At least one of these features is required: ${featureKeys.join(", ")}`
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator to check multiple features (ALL)
 */
export function FeatureProtectedAll(featureKeys: string[]) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tenantId = args[0];

      if (!tenantId) {
        throw new Error("tenantId is required as first argument");
      }

      const featureService: FeatureManagementService = 
        (this as any).featureService || 
        (this as any).pool ? new FeatureManagementService((this as any).pool) : null;

      if (!featureService) {
        throw new Error("FeatureManagementService not available");
      }

      // Check all features
      const features = await featureService.areFeaturesEnabled(tenantId, featureKeys);
      const disabledFeatures = featureKeys.filter((key) => !features[key]);

      if (disabledFeatures.length > 0) {
        throw new FeatureNotAvailableError(
          featureKeys.join("&"),
          `All of these features are required: ${disabledFeatures.join(", ")}`
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
