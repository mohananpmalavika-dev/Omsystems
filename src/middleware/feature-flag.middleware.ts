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
  featureService = new FeatureManagementService(pool);
}

/**
 * Get or throw error if not initialized
 */
function getFeatureService(): FeatureManagementService {
  if (!featureService) {
    throw new Error("Feature middleware not initialized. Call initializeFeatureMiddleware() first.");
  }
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
    const result = await service.canUseFeature(user.tenantId, featureKey);

    if (!result.enabled) {
      return reply.code(403).send({
        success: false,
        error: "feature_not_available",
        feature: featureKey,
        message: result.reason || `Feature '${featureKey}' is not available for your account`,
      });
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
    
    // Check all features in parallel
    const results = await Promise.all(
      featureKeys.map((key) => 
        service.canUseFeature(user.tenantId, key)
          .then((result) => ({ key, enabled: result.enabled }))
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
    
    // Check all features in parallel
    const results = await Promise.all(
      featureKeys.map((key) => 
        service.canUseFeature(user.tenantId, key)
          .then((result) => ({ key, enabled: result.enabled, reason: result.reason }))
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
    const result = await service.canUseFeature(user.tenantId, featureKey);

    if (!result.enabled) {
      return reply.code(403).send({
        success: false,
        error: "feature_not_available",
        feature: featureKey,
        message: result.reason || `Feature '${featureKey}' is not available`,
      });
    }

    // Log usage
    await service.logUsage(
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
    );

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
    const result = await service.canUseFeature(user.tenantId, featureKey);

    // Add feature status to request object
    (request as any).featureEnabled = result.enabled;
    (request as any).featureKey = featureKey;
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
    const features = await service.areFeaturesEnabled(user.tenantId, featureKeys);

    // Add features status to request
    (request as any).features = features;
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
    const result = await checkFn(service, user.tenantId, user.id);

    if (!result.allowed) {
      return reply.code(403).send({
        success: false,
        error: "feature_check_failed",
        message: result.message || "Feature access denied",
      });
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
  return service.isFeatureEnabled(tenantId, featureKey);
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
  const result = await service.canUseFeature(tenantId, featureKey);

  if (result.enabled) {
    await service.logUsage(tenantId, featureKey, userId, action, metadata);
  }

  return result;
}

// Export for use in type declarations
export interface FeatureEnabledRequest extends FastifyRequest {
  featureEnabled?: boolean;
  featureKey?: string;
  features?: Record<string, boolean>;
}
