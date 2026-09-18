/**
 * Feature Management API Routes
 * 
 * Endpoints for managing feature flags at tenant and global level.
 * 
 * Admin endpoints (requires 'admin' or 'platform_admin' role):
 * - Global feature management
 * - All tenants feature overview
 * - Usage statistics
 * 
 * Tenant endpoints (requires 'admin' role for tenant):
 * - View enabled features for tenant
 * - Request feature access
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FeatureManagementService } from "../services/feature-management.service.js";

const featureKeySchema = z.string().regex(/^[a-z0-9-]+$/, "Invalid feature key format");

export function isFeatureAdmin(user?: any): boolean {
  if (!user) return false;
  const role = String(user.role ?? "").toLowerCase();
  const isSuper =
    role === "super_admin" ||
    role === "superadmin" ||
    user.isSuperAdmin === true;
  const isAdmin =
    role === "admin" ||
    role === "company_admin" ||
    role === "hq_admin" ||
    role === "platform_admin" ||
    role === "global-admin" ||
    role === "global_admin";
  const hasArrayRole =
    Array.isArray(user.roles) &&
    user.roles.some((r: string) => {
      const lower = String(r).toLowerCase();
      return (
        lower === "super_admin" ||
        lower === "superadmin" ||
        lower === "admin" ||
        lower === "company_admin" ||
        lower === "hq_admin" ||
        lower === "platform_admin" ||
        lower === "global_admin" ||
        lower === "global-admin"
      );
    });
  const hasPermission =
    Array.isArray(user.permissions) &&
    (user.permissions.includes("features:manage") ||
     user.permissions.includes("admin") ||
     user.permissions.includes("*"));

  return isSuper || isAdmin || hasArrayRole || hasPermission;
}

export async function registerFeatureManagementRoutes(app: FastifyInstance, pool: any) {
  const featureService = new FeatureManagementService(pool);

  // ============================================================================
  // Tenant Endpoints (Available to all authenticated users)
  // ============================================================================

  /**
   * GET /api/v1/features
   * 
   * Get all features available to current tenant
   */
  app.get("/api/v1/features", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const features = await featureService.getAllFeaturesForTenant(user.tenantId);

      // Group by category
      const byCategory: Record<string, any[]> = {};
      features.forEach((feature) => {
        if (!byCategory[feature.featureCategory]) {
          byCategory[feature.featureCategory] = [];
        }
        byCategory[feature.featureCategory]!.push(feature);
      });

      return {
        success: true,
        features,
        byCategory,
        summary: {
          total: features.length,
          enabled: features.filter((f) => f.effectiveEnabled).length,
          disabled: features.filter((f) => !f.effectiveEnabled).length,
        },
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get features");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_features",
      });
    }
  });

  /**
   * GET /api/v1/features/:featureKey
   * 
   * Get details of a specific feature
   */
  app.get("/api/v1/features/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const feature = await featureService.getFeatureStatus(
        user.tenantId,
        params.featureKey
      );

      if (!feature) {
        return reply.code(404).send({
          success: false,
          error: "feature_not_found",
        });
      }

      return {
        success: true,
        feature,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_feature",
      });
    }
  });

  /**
   * POST /api/v1/features/:featureKey/check
   * 
   * Check if feature is enabled and can be used
   */
  app.post("/api/v1/features/:featureKey/check", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const result = await featureService.canUseFeature(
        user.tenantId,
        params.featureKey
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to check feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_check_feature",
      });
    }
  });

  /**
   * GET /api/v1/features/categories
   * 
   * Get all feature categories
   */
  app.get("/api/v1/features/categories", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const categories = await featureService.getFeatureCategories();

      return {
        success: true,
        categories,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get categories");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_categories",
      });
    }
  });

  // ============================================================================
  // Tenant Admin Endpoints (Admins and Super Admins)
  // ============================================================================

  /**
   * PATCH /api/v1/features/:featureKey
   * 
   * Enable/disable feature for current tenant (admins & super admins)
   */
  app.patch("/api/v1/features/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Admin or Super Admin access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const body = z.object({
        enabled: z.boolean(),
        usageLimit: z.number().int().positive().nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        config: z.record(z.any()).optional(),
        notes: z.string().max(1000).optional(),
      }).parse(request.body);

      await featureService.setTenantFeatureStatus(
        user.tenantId,
        params.featureKey,
        body.enabled,
        {
          usageLimit: body.usageLimit ?? undefined,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          config: body.config,
          notes: body.notes,
        }
      );

      return {
        success: true,
        message: `Feature ${body.enabled ? "enabled" : "disabled"} successfully for tenant`,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to update tenant feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_update_tenant_feature",
      });
    }
  });

  /**
   * DELETE /api/v1/features/:featureKey/override
   * 
   * Remove tenant-specific override and revert to global default
   */
  app.delete("/api/v1/features/:featureKey/override", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Admin or Super Admin access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      await featureService.removeTenantFeatureOverride(
        user.tenantId,
        params.featureKey
      );

      return {
        success: true,
        message: "Tenant feature override removed successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to remove tenant override");
      return reply.code(500).send({
        success: false,
        error: "failed_to_remove_tenant_override",
      });
    }
  });

  /**
   * POST /api/v1/features/:featureKey/request
   * 
   * Request access to a feature (admins & super admins)
   */
  app.post("/api/v1/features/:featureKey/request", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Only administrators can request features",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const body = z.object({
        reason: z.string().min(10).max(500),
        requestedLimit: z.number().int().positive().optional(),
      }).parse(request.body);

      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, details, timestamp)
         VALUES ($1, $2, 'feature_request', $3, NOW())`,
        [
          user.tenantId,
          user.id,
          JSON.stringify({
            featureKey: params.featureKey,
            reason: body.reason,
            requestedLimit: body.requestedLimit,
          }),
        ]
      );

      return {
        success: true,
        message: "Feature request submitted successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to request feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_request_feature",
      });
    }
  });

  // ============================================================================
  // Platform & Global Admin Endpoints (Admins and Super Admins)
  // ============================================================================

  /**
   * GET /api/v1/admin/features/global
   * 
   * Get all global features (admins and super admins)
   */
  app.get("/api/v1/admin/features/global", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const features = await featureService.getAllGlobalFeatures();

      return {
        success: true,
        features,
        summary: {
          total: features.length,
          enabled: features.filter((f) => f.enabled).length,
          disabled: features.filter((f) => !f.enabled).length,
        },
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get global features");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_global_features",
      });
    }
  });

  /**
   * PATCH /api/v1/admin/features/global/:featureKey
   * 
   * Enable/disable feature globally (admins and super admins)
   */
  app.patch("/api/v1/admin/features/global/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const body = z.object({
        enabled: z.boolean().optional(),
        config: z.record(z.any()).optional(),
      }).parse(request.body);

      if (body.enabled !== undefined) {
        await featureService.setGlobalFeatureStatus(
          params.featureKey,
          body.enabled,
          user.id
        );
      }

      if (body.config) {
        await featureService.updateGlobalFeatureConfig(
          params.featureKey,
          body.config
        );
      }

      return {
        success: true,
        message: "Global feature updated successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to update global feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_update_global_feature",
      });
    }
  });

  /**
   * POST /api/v1/admin/features/global
   * 
   * Create new global feature (admins and super admins)
   */
  app.post("/api/v1/admin/features/global", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const body = z.object({
        featureKey: featureKeySchema,
        featureName: z.string().min(3).max(200),
        featureCategory: z.string().min(2).max(50),
        description: z.string().max(1000).optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.any()).optional(),
      }).parse(request.body);

      const feature = await featureService.createGlobalFeature(body as any);

      return {
        success: true,
        feature,
        message: "Global feature created successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to create global feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_create_global_feature",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * DELETE /api/v1/admin/features/global/:featureKey
   * 
   * Delete global feature (admins and super admins, use with caution!)
   */
  app.delete("/api/v1/admin/features/global/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const query = z.object({
        confirm: z.string().optional(),
      }).parse(request.query);

      if (query.confirm !== "yes") {
        return reply.code(400).send({
          success: false,
          error: "confirmation_required",
          message: "Add ?confirm=yes to delete this feature",
        });
      }

      await featureService.deleteGlobalFeature(params.featureKey);

      return {
        success: true,
        message: "Global feature deleted successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to delete global feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_delete_global_feature",
      });
    }
  });

  /**
   * PUT /api/v1/admin/features/tenant/:tenantId/:featureKey
   * 
   * Enable/disable feature for specific tenant (admins and super admins)
   */
  app.put("/api/v1/admin/features/tenant/:tenantId/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        tenantId: z.string().uuid(),
        featureKey: featureKeySchema,
      }).parse(request.params);

      const body = z.object({
        enabled: z.boolean(),
        usageLimit: z.number().int().positive().nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        config: z.record(z.any()).optional(),
        notes: z.string().max(1000).optional(),
      }).parse(request.body);

      await featureService.setTenantFeatureStatus(
        params.tenantId,
        params.featureKey,
        body.enabled,
        {
          usageLimit: body.usageLimit ?? undefined,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          config: body.config,
          notes: body.notes,
        }
      );

      return {
        success: true,
        message: "Tenant feature updated successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to update tenant feature");
      return reply.code(500).send({
        success: false,
        error: "failed_to_update_tenant_feature",
      });
    }
  });

  /**
   * DELETE /api/v1/admin/features/tenant/:tenantId/:featureKey
   * 
   * Remove tenant-specific override (revert to global default)
   */
  app.delete("/api/v1/admin/features/tenant/:tenantId/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        tenantId: z.string().uuid(),
        featureKey: featureKeySchema,
      }).parse(request.params);

      await featureService.removeTenantFeatureOverride(
        params.tenantId,
        params.featureKey
      );

      return {
        success: true,
        message: "Tenant feature override removed successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to remove tenant override");
      return reply.code(500).send({
        success: false,
        error: "failed_to_remove_tenant_override",
      });
    }
  });

  /**
   * GET /api/v1/admin/features/usage/:featureKey
   * 
   * Get usage statistics for a feature (admins and super admins)
   */
  app.get("/api/v1/admin/features/usage/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const stats = await featureService.getFeatureUsageStats(params.featureKey);
      const tenants = await featureService.getTenantsUsingFeature(params.featureKey);

      return {
        success: true,
        stats,
        tenants,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get usage stats");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_usage_stats",
      });
    }
  });

  /**
   * GET /api/v1/admin/features/usage
   * 
   * Get usage statistics for all features (admins and super admins)
   */
  app.get("/api/v1/admin/features/usage", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const stats = await featureService.getAllUsageStats();

      return {
        success: true,
        stats,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get all usage stats");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_usage_stats",
      });
    }
  });

  /**
   * GET /api/v1/admin/features/audit/:featureKey
   * 
   * Get audit log for a feature (admins and super admins)
   */
  app.get("/api/v1/admin/features/audit/:featureKey", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        featureKey: featureKeySchema,
      }).parse(request.params);

      const query = z.object({
        tenantId: z.string().uuid().optional(),
        limit: z.coerce.number().int().positive().max(1000).default(100),
      }).parse(request.query);

      const auditLog = await featureService.getFeatureAuditLog(
        params.featureKey,
        query.tenantId,
        query.limit
      );

      return {
        success: true,
        auditLog,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to get audit log");
      return reply.code(500).send({
        success: false,
        error: "failed_to_get_audit_log",
      });
    }
  });

  /**
   * POST /api/v1/admin/features/cleanup-expired
   * 
   * Cleanup expired features (admins and super admins)
   */
  app.post("/api/v1/admin/features/cleanup-expired", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const count = await featureService.cleanupExpiredFeatures();

      return {
        success: true,
        message: `Disabled ${count} expired feature(s)`,
        count,
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to cleanup expired features");
      return reply.code(500).send({
        success: false,
        error: "failed_to_cleanup_expired",
      });
    }
  });

  /**
   * POST /api/v1/admin/features/tenant/:tenantId/:featureKey/reset-usage
   * 
   * Reset usage counter for a tenant (admins and super admins)
   */
  app.post("/api/v1/admin/features/tenant/:tenantId/:featureKey/reset-usage", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isFeatureAdmin(user)) {
        return reply.code(403).send({
          success: false,
          error: "insufficient_permissions",
          message: "Administrator or Super Administrator access required",
        });
      }

      const params = z.object({
        tenantId: z.string().uuid(),
        featureKey: featureKeySchema,
      }).parse(request.params);

      await featureService.resetUsageCount(params.tenantId, params.featureKey);

      return {
        success: true,
        message: "Usage counter reset successfully",
      };
    } catch (error) {
      app.log.error({ error }, "[Features] Failed to reset usage counter");
      return reply.code(500).send({
        success: false,
        error: "failed_to_reset_usage",
      });
    }
  });

  app.log.info("[Features] Feature Management routes registered successfully");
}
