/**
 * Feature Flag Middleware
 * 
 * Protects routes and endpoints based on feature flags.
 * 
 * Usage:
 * 1. Route-level protection:
 *    app.get('/api/v1/ai/search', { preHandler: requireFeature('ai-video-search') }, handler)
 * 
 * 2. Multiple features (ANY):
 *    requireAnyFeature(['ai-video-search', 'ai-prediction'])
 * 
 * 3. Multiple features (ALL):
 *    requireAllFeatures(['face-recognition', 'watchlist-management'])
 * 
 * 4. With automatic usage logging:
 *    requireFeatureWithLogging('guardian-ai-assistant')
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { FeatureManagementService } from "../services/feature-management.service.js";

// Global feature service instance (initialized once)
let featureService: FeatureManagementService | null = null;

export function initializeFeatureMiddleware(pool: Pool): void {
  try {
    featureService = new FeatureManagementService(pool);
  } catch (err) {
    console.warn("[FeatureMiddleware] Failed to initialize FeatureManagementService:", err);
  }
}

/**
 * Get service or return null if not initialized
 */
export function getFeatureService(): FeatureManagementService | null {
  return featureService;
}

/**
 * Require a single feature to be enabled
 */
export function requireFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "unauthorized",
        message: "Authentication required",
      });
    }

    const service = getFeatureService();
    if (!service) {
      // If feature flag service is not available, allow graceful fallback
      request.log?.debug?.({ featureKey }, "Feature service unavailable; allowing request");
      return;
    }

    try {
      const result = await service.canUseFeature(user.tenantId, featureKey);

      if (!result.enabled) {
        return reply.code(403).send({
          success: false,
          error: "feature_not_available",
          feature: featureKey,
          message: result.reason || `Feature '${featureKey}' is not available for your account`,
        });
      }
    } catch (err) {
      request.log?.warn?.({ err, featureKey }, "Feature check encountered an error; allowing request fallback");
      return;
    }

    // Feature is enabled, continue to handler
  };
}

/**
 * Require ANY of the specified features to be enabled
 */
export function requireAnyFeature(featureKeys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "unauthorized",
      });
    }

    const service = getFeatureService();
    if (!service) {
      return;
    }

    try {
      // Check all features in parallel
      const results = await Promise.all(
        featureKeys.map((key) => 
          service.canUseFeature(user.tenantId, key)
            .then((result) => ({ key, enabled: result.enabled }))
            .catch(() => ({ key, enabled: true }))
        )
      );

      // If ANY feature is enabled, allow access
      const hasAccess = results.some((r) => r.enabled);

      if (!hasAccess) {
        return reply.code(403).send({
          success: false,
          error: "feature_not_available",
          message: `At least one of these features is required: ${featureKeys.join(", ")}`,
          requiredFeatures: featureKeys,
        });
      }
    } catch (err) {
      request.log?.warn?.({ err, featureKeys }, "Feature check encountered an error; allowing request fallback");
      return;
    }
  };
}

/**
 * Require ALL of the specified features to be enabled
 */
export function requireAllFeatures(featureKeys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "unauthorized",
      });
    }

    const service = getFeatureService();
    if (!service) {
      return;
    }

    try {
      // Check all features in parallel
      const results = await Promise.all(
        featureKeys.map((key) => 
          service.canUseFeature(user.tenantId, key)
            .then((result) => ({ key, enabled: result.enabled, reason: result.reason }))
            .catch(() => ({ key, enabled: true, reason: undefined }))
        )
      );

      // Check if ALL features are enabled
      const disabledFeatures = results.filter((r) => !r.enabled);

      if (disabledFeatures.length > 0) {
        return reply.code(403).send({
          success: false,
          error: "features_not_available",
          message: "All required features must be enabled",
          disabledFeatures: disabledFeatures.map((f) => f.key),
          reasons: disabledFeatures.map((f) => ({ feature: f.key, reason: f.reason })),
        });
      }
    } catch (err) {
      request.log?.warn?.({ err, featureKeys }, "Feature check encountered an error; allowing request fallback");
      return;
    }
  };
}

/**
 * Require feature and automatically log usage
 */
export function requireFeatureWithLogging(
  featureKey: string,
  action: string = "access"
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "unauthorized",
      });
    }

    const service = getFeatureService();
    if (!service) {
      return;
    }

    try {
      const result = await service.canUseFeature(user.tenantId, featureKey);

      if (!result.enabled) {
        return reply.code(403).send({
          success: false,
          error: "feature_not_available",
          feature: featureKey,
          message: result.reason || `Feature '${featureKey}' is not available`,
        });
      }

      // Log usage asynchronously without failing the request on audit logging errors
      void service.logUsage(
        user.tenantId,
        featureKey,
        user.id,
        action,
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
          userAgent: request.headers["user-agent"],
        }
      ).catch((err) => {
        request.log?.debug?.({ err, featureKey }, "Feature usage logging failed silently");
      });
    } catch (err) {
      request.log?.warn?.({ err, featureKey }, "Feature check failed; allowing request fallback");
      return;
    }

    // Feature is enabled, continue to handler
  };
}

/**
 * Optional feature check (doesn't block, just adds flag to request)
 * Use this when you want to enable/disable functionality conditionally
 */
export function checkFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      // No user, feature is considered disabled
      (request as any).featureEnabled = false;
      return;
    }

    const service = getFeatureService();
    if (!service) {
      (request as any).featureEnabled = true;
      (request as any).featureKey = featureKey;
      return;
    }

    try {
      const result = await service.canUseFeature(user.tenantId, featureKey);
      (request as any).featureEnabled = result.enabled;
      (request as any).featureKey = featureKey;
    } catch {
      (request as any).featureEnabled = true;
      (request as any).featureKey = featureKey;
    }
  };
}

/**
 * Decorator to add feature check result to request
 * Checks multiple features and adds object to request
 */
export function checkFeatures(featureKeys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      (request as any).features = Object.fromEntries(
        featureKeys.map((key) => [key, false])
      );
      return;
    }

    const service = getFeatureService();
    if (!service) {
      (request as any).features = Object.fromEntries(
        featureKeys.map((key) => [key, true])
      );
      return;
    }

    try {
      const features = await service.areFeaturesEnabled(user.tenantId, featureKeys);
      (request as any).features = features;
    } catch {
      (request as any).features = Object.fromEntries(
        featureKeys.map((key) => [key, true])
      );
    }
  };
}

/**
 * Middleware factory for custom feature logic
 */
export function customFeatureCheck(
  checkFn: (
    service: FeatureManagementService,
    tenantId: string,
    userId: string
  ) => Promise<{ allowed: boolean; message?: string }>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "unauthorized",
      });
    }

    const service = getFeatureService();
    if (!service) {
      return;
    }

    try {
      const result = await checkFn(service, user.tenantId, user.id);

      if (!result.allowed) {
        return reply.code(403).send({
          success: false,
          error: "feature_check_failed",
          message: result.message || "Feature access denied",
        });
      }
    } catch {
      return;
    }
  };
}

/**
 * Helper to check feature in route handler (non-middleware usage)
 */
export async function isFeatureEnabledForUser(
  tenantId: string,
  featureKey: string
): Promise<boolean> {
  const service = getFeatureService();
  if (!service) return true;
  try {
    return await service.isFeatureEnabled(tenantId, featureKey);
  } catch {
    return true;
  }
}

/**
 * Helper to check and log feature usage in route handler
 */
export async function checkAndLogFeature(
  tenantId: string,
  featureKey: string,
  userId?: string,
  action: string = "access",
  metadata: Record<string, any> = {}
): Promise<{ enabled: boolean; reason?: string }> {
  const service = getFeatureService();
  if (!service) return { enabled: true };

  try {
    const result = await service.canUseFeature(tenantId, featureKey);

    if (result.enabled) {
      void service.logUsage(tenantId, featureKey, userId, action, metadata).catch(() => {});
    }

    return result;
  } catch {
    return { enabled: true };
  }
}

// Export for use in type declarations
export interface FeatureEnabledRequest extends FastifyRequest {
  featureEnabled?: boolean;
  featureKey?: string;
  features?: Record<string, boolean>;
}
