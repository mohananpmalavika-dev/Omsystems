/**
 * Feature Flag Usage Examples
 * 
 * This file demonstrates how to use the Feature Management System
 * in various scenarios throughout the application.
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { 
  requireFeature, 
  requireAnyFeature, 
  requireAllFeatures,
  requireFeatureWithLogging,
  checkFeature,
  checkFeatures,
  isFeatureEnabledForUser,
  checkAndLogFeature
} from "../middleware/feature-flag.middleware.js";
import {
  FeatureProtected,
  FeatureProtectedWithLogging,
  FeatureOptional,
  FeatureProtectedAny,
  FeatureProtectedAll,
  FeatureNotAvailableError
} from "../decorators/feature-protected.decorator.js";

// ============================================================================
// Example 1: Protecting Routes with Middleware
// ============================================================================

export async function exampleRouteProtection(app: FastifyInstance, pool: Pool) {
  
  // Protect single route
  app.get(
    "/api/v1/ai/video-search",
    {
      preHandler: requireFeature("ai-video-search")
    },
    async (request, reply) => {
      // Only accessible if ai-video-search is enabled
      return { message: "AI Video Search is enabled!" };
    }
  );

  // Protect with automatic logging
  app.post(
    "/api/v1/guardian/chat",
    {
      preHandler: requireFeatureWithLogging("guardian-ai-assistant", "chat")
    },
    async (request, reply) => {
      // Usage is automatically logged
      return { message: "Guardian AI processing..." };
    }
  );

  // Require ANY of multiple features
  app.get(
    "/api/v1/analytics/advanced",
    {
      preHandler: requireAnyFeature([
        "behavioral-analytics",
        "crowd-analytics",
        "retail-analytics"
      ])
    },
    async (request, reply) => {
      return { message: "At least one analytics feature is enabled" };
    }
  );

  // Require ALL features
  app.post(
    "/api/v1/face/watchlist",
    {
      preHandler: requireAllFeatures([
        "face-recognition",
        "watchlist-management"
      ])
    },
    async (request, reply) => {
      return { message: "Both face recognition and watchlist are enabled" };
    }
  );

  // Optional feature check (doesn't block)
  app.get(
    "/api/v1/dashboard",
    {
      preHandler: checkFeatures([
        "ai-video-search",
        "guardian-ai-assistant",
        "behavioral-analytics"
      ])
    },
    async (request, reply) => {
      // request.features contains enabled status for each feature
      const features = (request as any).features;
      
      return {
        dashboard: "main",
        availableFeatures: Object.entries(features)
          .filter(([_, enabled]) => enabled)
          .map(([key]) => key)
      };
    }
  );
}

// ============================================================================
// Example 2: Using Decorators in Services
// ============================================================================

class AIVideoSearchService {
  constructor(private pool: Pool) {}

  @FeatureProtected("ai-video-search")
  async searchByNaturalLanguage(tenantId: string, query: string) {
    // Automatically checks if ai-video-search is enabled
    // Throws FeatureNotAvailableError if disabled
    return {
      results: ["video1", "video2"],
      query
    };
  }

  @FeatureProtectedWithLogging("ai-video-search", "search")
  async searchWithLogging(tenantId: string, userId: string, query: string) {
    // Checks feature AND logs usage automatically
    return { results: [] };
  }

  @FeatureOptional("ai-prediction")
  async getPredictiveInsights(tenantId: string) {
    // Returns null if feature is disabled (no error)
    return { insights: ["insight1", "insight2"] };
  }
}

class GuardianAIService {
  constructor(private pool: Pool) {}

  @FeatureProtectedWithLogging("guardian-ai-assistant", "chat")
  async processMessage(
    tenantId: string,
    userId: string,
    message: string
  ) {
    return { response: "Guardian AI response" };
  }
}

class FaceRecognitionService {
  constructor(private pool: Pool) {}

  @FeatureProtectedAll(["face-recognition", "watchlist-management"])
  async searchWatchlist(tenantId: string, faceId: string) {
    // Requires BOTH features to be enabled
    return { matches: [] };
  }

  @FeatureProtectedAny(["face-recognition", "vip-detection"])
  async detectFaces(tenantId: string, imageUrl: string) {
    // Requires ANY of these features
    return { faces: [] };
  }
}

// ============================================================================
// Example 3: Manual Feature Checks in Handlers
// ============================================================================

export async function exampleManualChecks(app: FastifyInstance, pool: Pool) {
  
  app.post("/api/v1/alerts/create", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    // Check feature manually
    const result = await checkAndLogFeature(
      user.tenantId,
      "ai-incident-summary",
      user.id,
      "create_alert"
    );

    let aiSummary = null;
    if (result.enabled) {
      // AI summary is available, generate it
      aiSummary = await generateAISummary();
    }

    return {
      alert: { id: "alert-123" },
      aiSummary
    };
  });

  app.get("/api/v1/features/check", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    // Check without logging
    const enabled = await isFeatureEnabledForUser(
      user.tenantId,
      "behavioral-analytics"
    );

    return {
      feature: "behavioral-analytics",
      enabled
    };
  });
}

async function generateAISummary() {
  return "AI-generated incident summary";
}

// ============================================================================
// Example 4: Conditional Logic Based on Features
// ============================================================================

class AnalyticsService {
  constructor(private pool: Pool) {}

  async getAnalytics(tenantId: string) {
    const basicAnalytics = await this.getBasicAnalytics(tenantId);

    // Check if advanced features are available
    const behavioralEnabled = await isFeatureEnabledForUser(
      tenantId,
      "behavioral-analytics"
    );

    if (behavioralEnabled) {
      const behavioral = await this.getBehavioralAnalytics(tenantId);
      return { ...basicAnalytics, behavioral };
    }

    return basicAnalytics;
  }

  private async getBasicAnalytics(tenantId: string) {
    return { alerts: 100, cameras: 50 };
  }

  @FeatureProtected("behavioral-analytics")
  private async getBehavioralAnalytics(tenantId: string) {
    return { patterns: [], anomalies: [] };
  }
}

// ============================================================================
// Example 5: Error Handling
// ============================================================================

export async function exampleErrorHandling(app: FastifyInstance, pool: Pool) {
  
  app.post("/api/v1/features/try", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    try {
      const service = new AIVideoSearchService(pool);
      const results = await service.searchByNaturalLanguage(
        user.tenantId,
        "show me people in red shirts"
      );

      return { success: true, results };
    } catch (error) {
      if (error instanceof FeatureNotAvailableError) {
        // Handle feature not available
        return reply.code(403).send({
          success: false,
          error: "feature_not_available",
          feature: error.featureKey,
          message: error.message
        });
      }

      // Other errors
      throw error;
    }
  });
}

// ============================================================================
// Example 6: Multi-Feature Dashboard
// ============================================================================

export async function exampleDashboard(app: FastifyInstance, pool: Pool) {
  
  app.get("/api/v1/dashboard/features", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    // Import feature service
    const { FeatureManagementService } = await import("../services/feature-management.service.js");
    const featureService = new FeatureManagementService(pool);

    // Get all features for tenant
    const features = await featureService.getAllFeaturesForTenant(user.tenantId);

    // Categorize features
    const aiFeatures = features.filter(f => f.featureCategory === "ai" && f.effectiveEnabled);
    const analyticsFeatures = features.filter(f => f.featureCategory === "analytics" && f.effectiveEnabled);
    const securityFeatures = features.filter(f => f.featureCategory === "security" && f.effectiveEnabled);

    return {
      summary: {
        total: features.length,
        enabled: features.filter(f => f.effectiveEnabled).length,
        aiEnabled: aiFeatures.length,
        analyticsEnabled: analyticsFeatures.length,
        securityEnabled: securityFeatures.length
      },
      features: {
        ai: aiFeatures.map(f => f.featureKey),
        analytics: analyticsFeatures.map(f => f.featureKey),
        security: securityFeatures.map(f => f.featureKey)
      }
    };
  });
}

// ============================================================================
// Example 7: Admin Feature Management
// ============================================================================

export async function exampleAdminManagement(app: FastifyInstance, pool: Pool) {
  
  // Platform admin enables a feature for a specific tenant
  app.post("/api/v1/admin/enable-feature", async (request, reply) => {
    const user = request.currentUser;
    
    // Check if platform admin
    if ((user as any).role !== "platform_admin") {
      return reply.code(403).send({ error: "insufficient_permissions" });
    }

    const { tenantId, featureKey, usageLimit, expiresAt } = request.body as any;

    const { FeatureManagementService } = await import("../services/feature-management.service.js");
    const featureService = new FeatureManagementService(pool);

    await featureService.setTenantFeatureStatus(
      tenantId,
      featureKey,
      true,
      {
        usageLimit,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        notes: `Enabled by ${user.email}`
      }
    );

    return {
      success: true,
      message: `Feature '${featureKey}' enabled for tenant ${tenantId}`
    };
  });
}

// ============================================================================
// Summary of Usage Patterns
// ============================================================================

/*
1. Route Protection:
   - Use requireFeature() for single feature
   - Use requireAnyFeature() when any of multiple features works
   - Use requireAllFeatures() when all features required
   - Use requireFeatureWithLogging() to auto-log usage

2. Service Methods:
   - Use @FeatureProtected for simple protection
   - Use @FeatureProtectedWithLogging to auto-log
   - Use @FeatureOptional for graceful degradation
   - Use @FeatureProtectedAny/@FeatureProtectedAll for multiple features

3. Manual Checks:
   - Use isFeatureEnabledForUser() for simple boolean check
   - Use checkAndLogFeature() to check and log in one call
   - Use FeatureManagementService directly for advanced scenarios

4. Error Handling:
   - Catch FeatureNotAvailableError for graceful handling
   - Return appropriate 403 responses with feature info

5. Conditional Logic:
   - Check features before calling optional functionality
   - Provide degraded experience when features disabled
   - Use checkFeatures() middleware for dashboard/UI toggles
*/
