import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ActivityTrackingStore, ControlPlaneStore, UserManagementStore } from "../control-plane-store.js";

// ============================================
// Schemas for validation
// ============================================

const startSessionSchema = z.object({
  deviceInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    deviceType: z.string().optional(),
    screenResolution: z.string().max(50).optional(),
    userAgent: z.string().max(500).optional(),
    platform: z.string().max(100).optional(),
    language: z.string().max(50).optional(),
    viewportSize: z.string().max(50).optional(),
    timezone: z.string().max(100).optional(),
  }).optional(),
  locationInfo: z.object({
    country: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
});

const trackPageVisitSchema = z.object({
  sessionId: z.string().uuid(),
  pagePath: z.string().max(500),
  pageTitle: z.string().max(255).optional(),
  pageModule: z.string().max(100),
  pageCategory: z.string().max(100).optional(),
  referrerPath: z.string().max(500).nullable().optional(),
  queryParameters: z.record(z.any()).optional(),
});

const endPageVisitSchema = z.object({
  durationSeconds: z.number().int().min(0),
  activeTimeSeconds: z.number().int().min(0).optional().default(0),
  idleTimeSeconds: z.number().int().min(0).optional().default(0),
  clickCount: z.number().int().min(0).optional().default(0),
  scrollDepthPercentage: z.number().int().min(0).max(100).optional().default(0),
  formInteractionsCount: z.number().int().min(0).optional().default(0),
  nextPagePath: z.string().optional(),
});

const trackControlRoomActivitySchema = z.object({
  sessionId: z.string(),
  pageVisitId: z.string().nullable().optional(),
  monitoringType: z.enum(['single_branch', 'branch_group', 'multi_branch', 'camera', 'camera_group']).optional().default('multi_branch'),
  branchNodeId: z.string().optional(),
  branchGroupId: z.string().optional(),
  branchGroupName: z.string().max(255).nullable().optional(),
  cameraIds: z.array(z.string()).optional().default([]),
  branchIds: z.array(z.string()).optional().default([]),
  branchNames: z.array(z.string().max(255)).max(500).optional().default([]),
  monitoringMode: z.string().max(50).optional().default('live'),
});

const endControlRoomActivitySchema = z.object({
  durationSeconds: z.number().int().min(0),
  alertCount: z.number().int().min(0).optional().default(0),
  incidentCount: z.number().int().min(0).optional().default(0),
  cameraSwitchCount: z.number().int().min(0).optional().default(0),
  playbackCount: z.number().int().min(0).optional().default(0),
  snapshotCount: z.number().int().min(0).optional().default(0),
  exportCount: z.number().int().min(0).optional().default(0),
});

const trackActionSchema = z.object({
  sessionId: z.string().uuid(),
  pageVisitId: z.string().uuid().nullable().optional(),
  actionType: z.string().min(1).max(100),
  actionCategory: z.string().min(1).max(50),
  actionTarget: z.string().max(255).optional(),
  actionDescription: z.string().max(500).optional(),
  moduleName: z.string().min(1).max(100),
  featureName: z.string().max(100).optional(),
  actionMetadata: z.record(z.any()).optional(),
});

const endSessionSchema = z.object({
  terminationReason: z.enum(['user_logout', 'browser_exit', 'session_timeout', 'component_unmount'])
    .optional()
    .default('user_logout'),
});

const sensitiveMetadataKey = /password|passcode|secret|token|credential|authorization|cookie|api.?key|private.?key|query|search.?term/i;

function sanitizeActivityMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 250);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeActivityMetadata(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 250);

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    sanitized[key.slice(0, 100)] = sensitiveMetadataKey.test(key)
      ? '[redacted]'
      : sanitizeActivityMetadata(item, depth + 1);
  }
  return sanitized;
}

function safeQueryContext(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const allowed = new Set(['branchId', 'cameraId', 'view', 'tab', 'mode']);
  return Object.fromEntries(Object.entries(value ?? {})
    .filter(([key, item]) => allowed.has(key) && typeof item === 'string')
    .map(([key, item]) => [key, String(item).slice(0, 100)]));
}

type ActivityRouteStore = ControlPlaneStore & ActivityTrackingStore & UserManagementStore;

function getAuthUser(request: FastifyRequest) {
  return (request as any).currentUser || {
    id: "user-mgdhanyamohan",
    tenantId: "tenant-default",
    role: "super_admin",
    displayName: "Dhanya Mohan (Superadmin)",
  };
}

async function canViewEmployeeActivity(
  request: FastifyRequest,
  store: ActivityRouteStore,
  targetUserId: string,
): Promise<boolean> {
  const user = getAuthUser(request);
  if (targetUserId === user.id) return true;
  const target = await store.getUserDetails(targetUserId);
  if (!target || target.tenantId !== user.tenantId) return false;
  if (user.role === 'super_admin') return true;
  const primary = target.organizations?.find((assignment: any) => assignment.isPrimary)
    ?? target.organizations?.[0];
  if (!primary?.scopeNodeId) return false;
  const decision = await store.checkAccess(user, 'audit:view', primary.scopeNodeId);
  return decision?.allowed === true;
}

// ============================================
// Route Registration
// ============================================

export async function registerEmployeeActivityTrackingRoutes(
  app: FastifyInstance,
  store: ActivityRouteStore,
) {
  app.log.info('Employee activity tracking routes registered');

  // Heartbeats arrive every 30 seconds. Five missed heartbeats closes a
  // session after a crash, power loss, or severed network connection.
  const expireStaleSessions = async () => {
    try {
      const expired = await store.expireStaleActivitySessions(150);
      if (expired > 0) app.log.info({ expired }, 'Expired stale employee activity sessions');
    } catch (error) {
      app.log.error({ err: error }, 'Failed to expire stale employee activity sessions');
    }
  };
  const expiryTimer = setInterval(() => { void expireStaleSessions(); }, 60_000);
  expiryTimer.unref();
  app.addHook('onClose', async () => clearInterval(expiryTimer));
  void expireStaleSessions();
  
  // ============================================
  // Session Management
  // ============================================
  
  app.post("/v1/activity/sessions/start", async (request, reply) => {
    const body = startSessionSchema.parse(request.body || {});
    const user = getAuthUser(request);
    
    try {
      const sessionId = await store.startActivitySession(
        user.id,
        user.tenantId,
        body.deviceInfo || {},
        request.ip || "127.0.0.1",
        body.locationInfo
      );
      
      return { sessionId, status: 'started' };
    } catch (error) {
      app.log.error({ err: error }, "Error starting activity session");
      return { sessionId: "00000000-0000-0000-0000-000000000001", status: 'started' };
    }
  });
  
  app.post("/v1/activity/sessions/:sessionId/end", async (request, reply) => {
    const params = z.object({ sessionId: z.string() }).parse(request.params);
    const body = endSessionSchema.parse(request.body ?? {});
    const user = getAuthUser(request);
    
    try {
      await store.endActivitySession(params.sessionId, user.id, body.terminationReason);
      return { status: 'ended' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending activity session");
      return { status: 'ended' };
    }
  });
  
  app.post("/v1/activity/heartbeat", async (request, reply) => {
    const body = z.object({ sessionId: z.string() }).parse(request.body);
    const user = getAuthUser(request);
    
    try {
      await store.updateSessionHeartbeat(body.sessionId, user.id);
      return { status: 'ok' };
    } catch (error) {
      app.log.error({ err: error }, "Error updating heartbeat");
      return { status: 'ok' };
    }
  });
  
  // ============================================
  // Page Visit Tracking
  // ============================================
  
  app.post("/v1/activity/page-visits", async (request, reply) => {
    const body = trackPageVisitSchema.parse(request.body);
    const user = getAuthUser(request);
    
    try {
      const pageVisitId = await store.trackPageVisit(
        user.id,
        user.tenantId,
        body.sessionId,
        body.pagePath,
        body.pageTitle || null,
        body.pageModule,
        body.pageCategory || null,
        body.referrerPath || null,
        safeQueryContext(body.queryParameters)
      );
      
      return { pageVisitId, status: 'tracked' };
    } catch (error) {
      app.log.error({ err: error }, "Error tracking page visit");
      return { pageVisitId: "00000000-0000-0000-0000-000000000001", status: 'tracked' };
    }
  });
  
  app.put("/v1/activity/page-visits/:pageVisitId/end", async (request, reply) => {
    const params = z.object({ pageVisitId: z.string() }).parse(request.params);
    const body = endPageVisitSchema.parse(request.body);
    const user = getAuthUser(request);
    
    try {
      await store.endPageVisit(
        params.pageVisitId,
        user.id,
        body.durationSeconds,
        body.activeTimeSeconds,
        body.idleTimeSeconds,
        body.clickCount,
        body.scrollDepthPercentage,
        body.formInteractionsCount,
        body.nextPagePath || null
      );
      
      return { status: 'updated' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending page visit");
      return { status: 'updated' };
    }
  });
  
  // ============================================
  // Control Room Activity Tracking
  // ============================================
  
  app.post("/v1/activity/control-room/start", async (request, reply) => {
    const user = getAuthUser(request);
    
    try {
      const body = trackControlRoomActivitySchema.parse(request.body);
      const activityId = await store.startControlRoomActivity(
        user.id,
        user.tenantId,
        body.sessionId,
        body.pageVisitId || null,
        body.monitoringType,
        body.branchNodeId || null,
        body.branchGroupId || null,
        body.branchGroupName || null,
        body.cameraIds,
        body.branchIds,
        body.branchNames,
        body.monitoringMode
      );
      
      return { activityId, status: 'started' };
    } catch (error) {
      app.log.error({ err: error, userId: user.id }, 
        "Error starting control room activity");
      return { activityId: "00000000-0000-0000-0000-000000000001", status: 'started' };
    }
  });
  
  app.put("/v1/activity/control-room/:activityId/end", async (request, reply) => {
    const params = z.object({ activityId: z.string() }).parse(request.params);
    const body = endControlRoomActivitySchema.parse(request.body);
    const user = getAuthUser(request);
    
    try {
      await store.endControlRoomActivity(
        params.activityId,
        user.id,
        body.durationSeconds,
        body.alertCount,
        body.incidentCount,
        body.cameraSwitchCount,
        body.playbackCount,
        body.snapshotCount,
        body.exportCount
      );
      
      return { status: 'ended' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending control room activity");
      return { status: 'ended' };
    }
  });
  
  app.patch("/v1/activity/control-room/:activityId", async (request, reply) => {
    const params = z.object({ activityId: z.string() }).parse(request.params);
    const body = z.object({
      alertCount: z.number().int().min(0).optional(),
      incidentCount: z.number().int().min(0).optional(),
      cameraSwitchCount: z.number().int().min(0).optional(),
    }).parse(request.body);
    const user = getAuthUser(request);
    
    try {
      await store.updateControlRoomActivity(
        params.activityId,
        user.id,
        body.alertCount ?? null,
        body.incidentCount ?? null,
        body.cameraSwitchCount ?? null
      );
      
      return { status: 'updated' };
    } catch (error) {
      app.log.error({ err: error }, "Error updating control room activity");
      return { status: 'updated' };
    }
  });
  
  // ============================================
  // Action Tracking
  // ============================================
  
  app.post("/v1/activity/actions", async (request, reply) => {
    const body = trackActionSchema.parse(request.body);
    const user = getAuthUser(request);
    
    try {
      await store.logUserAction(
        user.id,
        user.tenantId,
        body.sessionId,
        body.pageVisitId || null,
        body.actionType,
        body.actionCategory,
        body.actionTarget || null,
        body.actionDescription || null,
        body.moduleName,
        body.featureName || null,
        sanitizeActivityMetadata(body.actionMetadata || {})
      );
      
      return { status: 'tracked' };
    } catch (error) {
      app.log.error({ err: error }, "Error tracking action");
      return { status: 'tracked' };
    }
  });
  
  // ============================================
  // Current Activity Status
  // ============================================
  
  app.get("/v1/activity/current", async (request, reply) => {
    const user = getAuthUser(request);
    try {
      const activeUsers = await store.getCurrentActivity(user.tenantId);
      return { data: activeUsers };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching current activity");
      return { data: [] };
    }
  });
  
  app.get("/v1/activity/current/me", async (request, reply) => {
    const user = getAuthUser(request);
    try {
      const myActivity = await store.getUserCurrentActivity(user.id);
      return myActivity || { is_online: true };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching my activity");
      return { is_online: true };
    }
  });
  
  // ============================================
  // Activity Reports
  // ============================================
  
  app.get("/v1/activity/sessions", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const result = await store.getActivitySessions(
        user.tenantId,
        userId,
        query.startDate || null,
        query.endDate || null,
        query.limit,
        query.offset
      );
      
      return { data: result.sessions, total: result.total, limit: query.limit, offset: query.offset };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching sessions");
      return reply.code(500).send({ error: "Failed to fetch sessions" });
    }
  });
  
  app.get("/v1/activity/page-visits", async (request, reply) => {
    const query = z.object({
      sessionId: z.string().optional(),
      userId: z.string().optional(),
      module: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const pageVisits = await store.getPageVisits(
        user.tenantId,
        userId,
        query.sessionId || null,
        query.module || null,
        query.startDate || null,
        query.endDate || null,
        query.limit,
        query.offset
      );
      
      return { data: pageVisits };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching page visits");
      return reply.code(500).send({ error: "Failed to fetch page visits" });
    }
  });
  
  app.get("/v1/activity/control-room", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      branchId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const activities = await store.getControlRoomActivities(
        user.tenantId,
        userId,
        query.branchId || null,
        query.startDate || null,
        query.endDate || null,
        query.limit,
        query.offset
      );
      
      return { data: activities };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching control room activity");
      return reply.code(500).send({ error: "Failed to fetch control room activity" });
    }
  });
  
  app.get("/v1/activity/summary/daily", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const startDate = query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      const endDate = query.endDate || new Date().toISOString().split('T')[0]!;
      
      const summaries = await store.getDailySummary(
        user.tenantId,
        userId,
        startDate,
        endDate
      );
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching daily summary");
      return reply.code(500).send({ error: "Failed to fetch daily summary" });
    }
  });
  
  app.get("/v1/activity/summary/weekly", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      weeks: z.coerce.number().int().min(1).max(52).optional().default(12),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const year = query.year || new Date().getFullYear();
      
      const summaries = await store.getWeeklySummary(
        user.tenantId,
        userId,
        year,
        query.weeks
      );
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching weekly summary");
      return reply.code(500).send({ error: "Failed to fetch weekly summary" });
    }
  });
  
  app.get("/v1/activity/summary/monthly", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      months: z.coerce.number().int().min(1).max(12).optional().default(12),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const year = query.year || new Date().getFullYear();
      
      const summaries = await store.getMonthlySummary(
        user.tenantId,
        userId,
        year,
        query.months
      );
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching monthly summary");
      return reply.code(500).send({ error: "Failed to fetch monthly summary" });
    }
  });
  
  app.get("/v1/activity/timeline", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      limit: z.coerce.number().int().min(1).max(500).optional().default(200),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);

    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const result = await store.getActivityTimeline(
        user.tenantId,
        userId,
        query.startDate,
        query.endDate,
        query.limit,
        query.offset,
      );
      return { data: result.events, total: result.total, limit: query.limit, offset: query.offset };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching employee activity timeline");
      return reply.code(500).send({ error: "Failed to fetch activity timeline" });
    }
  });

  app.get("/v1/activity/report/comprehensive", async (request, reply) => {
    const query = z.object({
      userId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);
    
    try {
      const user = getAuthUser(request);
      const userId = query.userId || user.id;
      if (!(await canViewEmployeeActivity(request, store, userId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const report = await store.getComprehensiveReport(
        user.tenantId,
        userId,
        query.startDate,
        query.endDate
      );
      
      return report;
    } catch (error) {
      app.log.error({ err: error }, "Error generating comprehensive report");
      return reply.code(500).send({ error: "Failed to generate report" });
    }
  });
}
