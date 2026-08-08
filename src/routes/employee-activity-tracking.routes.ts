import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

// ============================================
// Schemas for validation
// ============================================

const startSessionSchema = z.object({
  deviceInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    deviceType: z.string().optional(),
    screenResolution: z.string().optional(),
  }).optional(),
  locationInfo: z.object({
    country: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
});

const trackPageVisitSchema = z.object({
  sessionId: z.string().uuid(),
  pagePath: z.string(),
  pageTitle: z.string().optional(),
  pageModule: z.string(),
  pageCategory: z.string().optional(),
  referrerPath: z.string().optional(),
  queryParameters: z.record(z.any()).optional(),
});

const endPageVisitSchema = z.object({
  pageVisitId: z.string().uuid(),
  durationSeconds: z.number().int().min(0),
  activeTimeSeconds: z.number().int().min(0).optional(),
  idleTimeSeconds: z.number().int().min(0).optional(),
  clickCount: z.number().int().min(0).optional(),
  scrollDepthPercentage: z.number().int().min(0).max(100).optional(),
  formInteractionsCount: z.number().int().min(0).optional(),
  nextPagePath: z.string().optional(),
});

const trackControlRoomActivitySchema = z.object({
  sessionId: z.string().uuid(),
  pageVisitId: z.string().uuid().optional(),
  monitoringType: z.enum(['single_branch', 'branch_group', 'multi_branch', 'camera', 'camera_group']),
  branchNodeId: z.string().uuid().optional(),
  branchGroupId: z.string().uuid().optional(),
  branchGroupName: z.string().optional(),
  cameraIds: z.array(z.string().uuid()).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  branchNames: z.array(z.string()).optional(),
  monitoringMode: z.string().optional(),
});

const endControlRoomActivitySchema = z.object({
  activityId: z.string().uuid(),
  durationSeconds: z.number().int().min(0),
  alertCount: z.number().int().min(0).optional(),
  incidentCount: z.number().int().min(0).optional(),
  cameraSwitchCount: z.number().int().min(0).optional(),
  playbackCount: z.number().int().min(0).optional(),
});

const trackActionSchema = z.object({
  sessionId: z.string().uuid(),
  pageVisitId: z.string().uuid().optional(),
  actionType: z.string(),
  actionCategory: z.string(),
  actionTarget: z.string().optional(),
  actionDescription: z.string().optional(),
  moduleName: z.string(),
  featureName: z.string().optional(),
  actionMetadata: z.record(z.any()).optional(),
});

const getActivityReportSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().uuid().optional(),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
  includeDetails: z.boolean().optional().default(false),
});

// ============================================
// Route Registration
// ============================================

export async function registerEmployeeActivityTrackingRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  
  // ============================================
  // Session Management
  // ============================================
  
  // Start a new activity tracking session (called on login)
  app.post("/v1/activity/sessions/start", async (request, reply) => {
    const body = startSessionSchema.parse(request.body);
    
    try {
      const sessionId = await store.db.oneFirst<string>`
        INSERT INTO user_activity_sessions (
          tenant_id,
          user_id,
          device_info,
          ip_address,
          location_info,
          session_status,
          login_time,
          last_activity_time
        )
        VALUES (
          ${request.currentUser.tenantId},
          ${request.currentUser.id},
          ${JSON.stringify(body.deviceInfo || {})},
          ${request.ip}::inet,
          ${JSON.stringify(body.locationInfo || {})},
          'active',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING id
      `;

      
      // Update current activity status
      await store.db.query`
        INSERT INTO user_current_activity (user_id, tenant_id, session_id, is_online, last_activity_time)
        VALUES (${request.currentUser.id}, ${request.currentUser.tenantId}, ${sessionId}, true, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET
          session_id = EXCLUDED.session_id,
          is_online = true,
          last_activity_time = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      return { sessionId, status: 'started' };
    } catch (error) {
      app.log.error({ err: error }, "Error starting activity session");
      return reply.code(500).send({ error: "Failed to start activity session" });
    }
  });
  
  // End activity session (called on logout)
  app.post("/v1/activity/sessions/:sessionId/end", async (request, reply) => {
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    
    try {
      await store.db.query`
        UPDATE user_activity_sessions
        SET
          logout_time = CURRENT_TIMESTAMP,
          total_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::INT,
          session_status = 'logged_out',
          termination_reason = 'user_logout',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.sessionId}
          AND user_id = ${request.currentUser.id}
          AND logout_time IS NULL
      `;
      
      // End any active page visits
      await store.db.query`
        UPDATE user_page_visits
        SET
          visit_end_time = CURRENT_TIMESTAMP,
          duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - visit_start_time))::INT,
          updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ${params.sessionId}
          AND visit_end_time IS NULL
      `;

      
      // End any active control room monitoring
      await store.db.query`
        UPDATE control_room_monitoring_activity
        SET
          monitoring_end_time = CURRENT_TIMESTAMP,
          duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - monitoring_start_time))::INT,
          updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ${params.sessionId}
          AND monitoring_end_time IS NULL
      `;
      
      // Update current activity status
      await store.db.query`
        UPDATE user_current_activity
        SET is_online = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${request.currentUser.id}
      `;
      
      // Trigger daily summary update
      await store.db.query`
        SELECT update_user_daily_activity_summary(
          ${request.currentUser.id}::uuid,
          CURRENT_DATE
        )
      `;
      
      return { status: 'ended' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending activity session");
      return reply.code(500).send({ error: "Failed to end activity session" });
    }
  });
  
  // Heartbeat to update last activity time
  app.post("/v1/activity/heartbeat", async (request, reply) => {
    const body = z.object({ sessionId: z.string().uuid() }).parse(request.body);
    
    try {
      await store.db.query`
        UPDATE user_activity_sessions
        SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${body.sessionId} AND user_id = ${request.currentUser.id}
      `;
      
      await store.db.query`
        UPDATE user_current_activity
        SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${request.currentUser.id}
      `;
      
      return { status: 'ok' };
    } catch (error) {
      app.log.error({ err: error }, "Error updating heartbeat");
      return reply.code(500).send({ error: "Failed to update heartbeat" });
    }
  });

  
  // ============================================
  // Page Visit Tracking
  // ============================================
  
  // Track page visit start
  app.post("/v1/activity/page-visits", async (request, reply) => {
    const body = trackPageVisitSchema.parse(request.body);
    
    try {
      const pageVisitId = await store.db.oneFirst<string>`
        INSERT INTO user_page_visits (
          tenant_id,
          user_id,
          session_id,
          page_path,
          page_title,
          page_module,
          page_category,
          referrer_path,
          query_parameters,
          visit_start_time
        )
        VALUES (
          ${request.currentUser.tenantId},
          ${request.currentUser.id},
          ${body.sessionId},
          ${body.pagePath},
          ${body.pageTitle || null},
          ${body.pageModule},
          ${body.pageCategory || null},
          ${body.referrerPath || null},
          ${JSON.stringify(body.queryParameters || {})},
          CURRENT_TIMESTAMP
        )
        RETURNING id
      `;
      
      return { pageVisitId, status: 'tracked' };
    } catch (error) {
      app.log.error({ err: error }, "Error tracking page visit");
      return reply.code(500).send({ error: "Failed to track page visit" });
    }
  });
  
  // Update page visit end
  app.put("/v1/activity/page-visits/:pageVisitId/end", async (request, reply) => {
    const params = z.object({ pageVisitId: z.string().uuid() }).parse(request.params);
    const body = endPageVisitSchema.parse(request.body);
    
    try {
      await store.db.query`
        UPDATE user_page_visits
        SET
          visit_end_time = CURRENT_TIMESTAMP,
          duration_seconds = ${body.durationSeconds},
          active_time_seconds = ${body.activeTimeSeconds || 0},
          idle_time_seconds = ${body.idleTimeSeconds || 0},
          click_count = ${body.clickCount || 0},
          scroll_depth_percentage = ${body.scrollDepthPercentage || 0},
          form_interactions_count = ${body.formInteractionsCount || 0},
          next_page_path = ${body.nextPagePath || null},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.pageVisitId}
          AND user_id = ${request.currentUser.id}
      `;
      
      return { status: 'updated' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending page visit");
      return reply.code(500).send({ error: "Failed to end page visit" });
    }
  });

  
  // ============================================
  // Control Room Activity Tracking
  // ============================================
  
  // Start control room monitoring
  app.post("/v1/activity/control-room/start", async (request, reply) => {
    const body = trackControlRoomActivitySchema.parse(request.body);
    
    try {
      const activityId = await store.db.oneFirst<string>`
        INSERT INTO control_room_monitoring_activity (
          tenant_id,
          user_id,
          session_id,
          page_visit_id,
          monitoring_type,
          branch_node_id,
          branch_group_id,
          branch_group_name,
          camera_ids,
          camera_count,
          branch_ids,
          branch_names,
          monitoring_mode,
          monitoring_start_time
        )
        VALUES (
          ${request.currentUser.tenantId},
          ${request.currentUser.id},
          ${body.sessionId},
          ${body.pageVisitId || null},
          ${body.monitoringType},
          ${body.branchNodeId || null},
          ${body.branchGroupId || null},
          ${body.branchGroupName || null},
          ${body.cameraIds ? `{${body.cameraIds.join(',')}}` : null},
          ${body.cameraIds?.length || 0},
          ${body.branchIds ? `{${body.branchIds.join(',')}}` : null},
          ${body.branchNames ? `{${body.branchNames.join(',')}}` : null},
          ${body.monitoringMode || 'live'},
          CURRENT_TIMESTAMP
        )
        RETURNING id
      `;
      
      // Update current activity
      await store.db.query`
        UPDATE user_current_activity
        SET
          is_in_control_room = true,
          current_branch_id = ${body.branchNodeId || null},
          current_branch_name = ${body.branchNames?.[0] || null},
          current_branch_group = ${body.branchGroupName || null},
          monitoring_camera_count = ${body.cameraIds?.length || 0},
          current_activity = ${`Monitoring: ${body.branchNames?.[0] || body.branchGroupName || 'Multiple branches'}`},
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${request.currentUser.id}
      `;
      
      return { activityId, status: 'started' };
    } catch (error) {
      app.log.error({ err: error }, "Error starting control room activity");
      return reply.code(500).send({ error: "Failed to start control room activity" });
    }
  });

  
  // End control room monitoring
  app.put("/v1/activity/control-room/:activityId/end", async (request, reply) => {
    const params = z.object({ activityId: z.string().uuid() }).parse(request.params);
    const body = endControlRoomActivitySchema.parse(request.body);
    
    try {
      await store.db.query`
        UPDATE control_room_monitoring_activity
        SET
          monitoring_end_time = CURRENT_TIMESTAMP,
          duration_seconds = ${body.durationSeconds},
          alert_count = ${body.alertCount || 0},
          incident_count = ${body.incidentCount || 0},
          camera_switch_count = ${body.cameraSwitchCount || 0},
          playback_count = ${body.playbackCount || 0},
          snapshot_count = ${body.snapshotCount || 0},
          export_count = ${body.exportCount || 0},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.activityId}
          AND user_id = ${request.currentUser.id}
      `;
      
      // Update current activity
      await store.db.query`
        UPDATE user_current_activity
        SET
          is_in_control_room = false,
          current_branch_id = NULL,
          current_branch_name = NULL,
          current_branch_group = NULL,
          monitoring_camera_count = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${request.currentUser.id}
      `;
      
      return { status: 'ended' };
    } catch (error) {
      app.log.error({ err: error }, "Error ending control room activity");
      return reply.code(500).send({ error: "Failed to end control room activity" });
    }
  });
  
  // Update control room activity metrics (for real-time updates)
  app.patch("/v1/activity/control-room/:activityId", async (request, reply) => {
    const params = z.object({ activityId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      alertCount: z.number().int().min(0).optional(),
      incidentCount: z.number().int().min(0).optional(),
      cameraSwitchCount: z.number().int().min(0).optional(),
    }).parse(request.body);
    
    try {
      await store.db.query`
        UPDATE control_room_monitoring_activity
        SET
          alert_count = COALESCE(${body.alertCount}, alert_count),
          incident_count = COALESCE(${body.incidentCount}, incident_count),
          camera_switch_count = COALESCE(${body.cameraSwitchCount}, camera_switch_count),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.activityId}
          AND user_id = ${request.currentUser.id}
      `;
      
      return { status: 'updated' };
    } catch (error) {
      app.log.error({ err: error }, "Error updating control room activity");
      return reply.code(500).send({ error: "Failed to update control room activity" });
    }
  });

  
  // ============================================
  // Action Tracking
  // ============================================
  
  // Track user action
  app.post("/v1/activity/actions", async (request, reply) => {
    const body = trackActionSchema.parse(request.body);
    
    try {
      await store.db.query`
        INSERT INTO user_action_log (
          tenant_id,
          user_id,
          session_id,
          page_visit_id,
          action_type,
          action_category,
          action_target,
          action_description,
          module_name,
          feature_name,
          action_metadata,
          action_time
        )
        VALUES (
          ${request.currentUser.tenantId},
          ${request.currentUser.id},
          ${body.sessionId},
          ${body.pageVisitId || null},
          ${body.actionType},
          ${body.actionCategory},
          ${body.actionTarget || null},
          ${body.actionDescription || null},
          ${body.moduleName},
          ${body.featureName || null},
          ${JSON.stringify(body.actionMetadata || {})},
          CURRENT_TIMESTAMP
        )
      `;
      
      return { status: 'tracked' };
    } catch (error) {
      app.log.error({ err: error }, "Error tracking action");
      return reply.code(500).send({ error: "Failed to track action" });
    }
  });
  
  // ============================================
  // Current Activity Status
  // ============================================
  
  // Get current activity for all users (admin)
  app.get("/v1/activity/current", async (request, reply) => {
    try {
      const activeUsers = await store.db.any`
        SELECT * FROM v_active_users_now
        WHERE user_id IN (
          SELECT id FROM users WHERE tenant_id = ${request.currentUser.tenantId}
        )
        ORDER BY last_activity_time DESC
      `;
      
      return { data: activeUsers };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching current activity");
      return reply.code(500).send({ error: "Failed to fetch current activity" });
    }
  });

  
  // Get my current activity
  app.get("/v1/activity/current/me", async (request, reply) => {
    try {
      const myActivity = await store.db.maybeOne`
        SELECT * FROM user_current_activity
        WHERE user_id = ${request.currentUser.id}
      `;
      
      return myActivity || { is_online: false };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching my activity");
      return reply.code(500).send({ error: "Failed to fetch activity" });
    }
  });
  
  // ============================================
  // Activity Reports
  // ============================================
  
  // Get user session details
  app.get("/v1/activity/sessions", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      
      const sessions = await store.db.any`
        SELECT * FROM v_user_session_details
        WHERE tenant_id = ${request.currentUser.tenantId}
          AND user_id = ${userId}
          ${query.startDate ? store.db.query`AND DATE(login_time) >= ${query.startDate}::date` : store.db.query``}
          ${query.endDate ? store.db.query`AND DATE(login_time) <= ${query.endDate}::date` : store.db.query``}
        ORDER BY login_time DESC
        LIMIT ${query.limit}
        OFFSET ${query.offset}
      `;
      
      const total = await store.db.oneFirst<number>`
        SELECT COUNT(*) FROM user_activity_sessions
        WHERE tenant_id = ${request.currentUser.tenantId}
          AND user_id = ${userId}
          ${query.startDate ? store.db.query`AND DATE(login_time) >= ${query.startDate}::date` : store.db.query``}
          ${query.endDate ? store.db.query`AND DATE(login_time) <= ${query.endDate}::date` : store.db.query``}
      `;
      
      return { data: sessions, total, limit: query.limit, offset: query.offset };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching sessions");
      return reply.code(500).send({ error: "Failed to fetch sessions" });
    }
  });

  
  // Get detailed page visit history
  app.get("/v1/activity/page-visits", async (request, reply) => {
    const query = z.object({
      sessionId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
      module: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      
      const pageVisits = await store.db.any`
        SELECT
          pv.*,
          u.display_name as user_name
        FROM user_page_visits pv
        JOIN users u ON u.id = pv.user_id
        WHERE pv.tenant_id = ${request.currentUser.tenantId}
          AND pv.user_id = ${userId}
          ${query.sessionId ? store.db.query`AND pv.session_id = ${query.sessionId}` : store.db.query``}
          ${query.module ? store.db.query`AND pv.page_module = ${query.module}` : store.db.query``}
          ${query.startDate ? store.db.query`AND DATE(pv.visit_start_time) >= ${query.startDate}::date` : store.db.query``}
          ${query.endDate ? store.db.query`AND DATE(pv.visit_start_time) <= ${query.endDate}::date` : store.db.query``}
        ORDER BY pv.visit_start_time DESC
        LIMIT ${query.limit}
        OFFSET ${query.offset}
      `;
      
      return { data: pageVisits };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching page visits");
      return reply.code(500).send({ error: "Failed to fetch page visits" });
    }
  });
  
  // Get control room monitoring history
  app.get("/v1/activity/control-room", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      
      const activities = await store.db.any`
        SELECT
          cr.*,
          u.display_name as user_name,
          rn.name as branch_name
        FROM control_room_monitoring_activity cr
        JOIN users u ON u.id = cr.user_id
        LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
        WHERE cr.tenant_id = ${request.currentUser.tenantId}
          AND cr.user_id = ${userId}
          ${query.branchId ? store.db.query`AND cr.branch_node_id = ${query.branchId}` : store.db.query``}
          ${query.startDate ? store.db.query`AND DATE(cr.monitoring_start_time) >= ${query.startDate}::date` : store.db.query``}
          ${query.endDate ? store.db.query`AND DATE(cr.monitoring_start_time) <= ${query.endDate}::date` : store.db.query``}
        ORDER BY cr.monitoring_start_time DESC
        LIMIT ${query.limit}
        OFFSET ${query.offset}
      `;
      
      return { data: activities };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching control room activity");
      return reply.code(500).send({ error: "Failed to fetch control room activity" });
    }
  });

  
  // Get daily summary
  app.get("/v1/activity/summary/daily", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      const startDate = query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = query.endDate || new Date().toISOString().split('T')[0];
      
      const summaries = await store.db.any`
        SELECT
          s.*,
          u.display_name as user_name
        FROM user_activity_daily_summary s
        JOIN users u ON u.id = s.user_id
        WHERE s.tenant_id = ${request.currentUser.tenantId}
          AND s.user_id = ${userId}
          AND s.summary_date >= ${startDate}::date
          AND s.summary_date <= ${endDate}::date
        ORDER BY s.summary_date DESC
      `;
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching daily summary");
      return reply.code(500).send({ error: "Failed to fetch daily summary" });
    }
  });
  
  // Get weekly summary
  app.get("/v1/activity/summary/weekly", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      weeks: z.coerce.number().int().min(1).max(52).optional().default(12),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      const year = query.year || new Date().getFullYear();
      
      const summaries = await store.db.any`
        SELECT
          s.*,
          u.display_name as user_name
        FROM user_activity_weekly_summary s
        JOIN users u ON u.id = s.user_id
        WHERE s.tenant_id = ${request.currentUser.tenantId}
          AND s.user_id = ${userId}
          AND s.year = ${year}
        ORDER BY s.week_start_date DESC
        LIMIT ${query.weeks}
      `;
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching weekly summary");
      return reply.code(500).send({ error: "Failed to fetch weekly summary" });
    }
  });

  
  // Get monthly summary
  app.get("/v1/activity/summary/monthly", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      months: z.coerce.number().int().min(1).max(12).optional().default(12),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      const year = query.year || new Date().getFullYear();
      
      const summaries = await store.db.any`
        SELECT
          s.*,
          u.display_name as user_name
        FROM user_activity_monthly_summary s
        JOIN users u ON u.id = s.user_id
        WHERE s.tenant_id = ${request.currentUser.tenantId}
          AND s.user_id = ${userId}
          AND s.year = ${year}
        ORDER BY s.year DESC, s.month DESC
        LIMIT ${query.months}
      `;
      
      return { data: summaries };
    } catch (error) {
      app.log.error({ err: error }, "Error fetching monthly summary");
      return reply.code(500).send({ error: "Failed to fetch monthly summary" });
    }
  });
  
  // Get comprehensive activity report
  app.get("/v1/activity/report/comprehensive", async (request, reply) => {
    const query = z.object({
      userId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);
    
    try {
      const userId = query.userId || request.currentUser.id;
      
      // Get user info
      const user = await store.db.one`
        SELECT id, display_name, identity_subject as username
        FROM users
        WHERE id = ${userId}
      `;
      
      // Get session summary
      const sessionSummary = await store.db.one`
        SELECT
          COUNT(*) as total_sessions,
          SUM(COALESCE(total_duration_seconds, 0)) as total_duration_seconds,
          AVG(COALESCE(total_duration_seconds, 0))::int as avg_session_duration_seconds,
          MIN(login_time) as first_login,
          MAX(logout_time) as last_logout
        FROM user_activity_sessions
        WHERE user_id = ${userId}
          AND DATE(login_time) >= ${query.startDate}::date
          AND DATE(login_time) <= ${query.endDate}::date
      `;

      
      // Get module usage breakdown
      const moduleUsage = await store.db.any`
        SELECT
          page_module,
          COUNT(*) as visit_count,
          SUM(COALESCE(duration_seconds, 0)) as total_seconds,
          AVG(COALESCE(duration_seconds, 0))::int as avg_seconds
        FROM user_page_visits
        WHERE user_id = ${userId}
          AND DATE(visit_start_time) >= ${query.startDate}::date
          AND DATE(visit_start_time) <= ${query.endDate}::date
        GROUP BY page_module
        ORDER BY total_seconds DESC
      `;
      
      // Get control room activity
      const controlRoomSummary = await store.db.one`
        SELECT
          COUNT(*) as total_monitoring_sessions,
          SUM(COALESCE(duration_seconds, 0)) as total_monitoring_seconds,
          COUNT(DISTINCT branch_node_id) as unique_branches_monitored,
          SUM(COALESCE(alert_count, 0)) as total_alerts_handled,
          SUM(COALESCE(incident_count, 0)) as total_incidents_created,
          SUM(COALESCE(camera_switch_count, 0)) as total_camera_switches
        FROM control_room_monitoring_activity
        WHERE user_id = ${userId}
          AND DATE(monitoring_start_time) >= ${query.startDate}::date
          AND DATE(monitoring_start_time) <= ${query.endDate}::date
      `;
      
      // Get branch monitoring breakdown
      const branchMonitoring = await store.db.any`
        SELECT
          rn.name as branch_name,
          cr.branch_node_id,
          COUNT(*) as monitoring_sessions,
          SUM(COALESCE(cr.duration_seconds, 0)) as total_seconds
        FROM control_room_monitoring_activity cr
        LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
        WHERE cr.user_id = ${userId}
          AND DATE(cr.monitoring_start_time) >= ${query.startDate}::date
          AND DATE(cr.monitoring_start_time) <= ${query.endDate}::date
          AND cr.branch_node_id IS NOT NULL
        GROUP BY rn.name, cr.branch_node_id
        ORDER BY total_seconds DESC
        LIMIT 20
      `;
      
      // Get action summary
      const actionSummary = await store.db.any`
        SELECT
          action_category,
          COUNT(*) as action_count
        FROM user_action_log
        WHERE user_id = ${userId}
          AND DATE(action_time) >= ${query.startDate}::date
          AND DATE(action_time) <= ${query.endDate}::date
        GROUP BY action_category
        ORDER BY action_count DESC
      `;
      
      return {
        user,
        period: { startDate: query.startDate, endDate: query.endDate },
        sessionSummary,
        moduleUsage,
        controlRoomSummary,
        branchMonitoring,
        actionSummary,
      };
    } catch (error) {
      app.log.error({ err: error }, "Error generating comprehensive report");
      return reply.code(500).send({ error: "Failed to generate report" });
    }
  });
}
