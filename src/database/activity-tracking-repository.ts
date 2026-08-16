import type { Pool } from "pg";

export class ActivityTrackingRepository {
  constructor(private pool: Pool) {}

  private async resolveTenantUuid(tenantIdOrSlug: string): Promise<string> {
    const slug = (tenantIdOrSlug || "omsystems").trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
      return slug;
    }
    const result = await this.pool.query(
      `SELECT id::text FROM tenants WHERE slug=$1 LIMIT 1`,
      [slug],
    );
    if (result.rows[0]?.id) {
      return result.rows[0].id;
    }
    const inserted = await this.pool.query(
      `INSERT INTO tenants (id, slug, name)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
       RETURNING id::text`,
      [slug, slug === "omsystems" ? "Sentinel Grid Enterprise" : slug],
    );
    return inserted.rows[0]!.id;
  }

  private async resolveUserUuid(userId: string, tenantId: string): Promise<string> {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return userId;
    }
    const username = userId.replace(/^user-/, "");
    const userRes = await this.pool.query(
      `SELECT id::text FROM users WHERE username=$1 OR identity_subject=$2 LIMIT 1`,
      [username, userId],
    );
    if (userRes.rows[0]?.id) {
      return userRes.rows[0].id;
    }
    const insUser = await this.pool.query(
      `INSERT INTO users (id, tenant_id, identity_subject, display_name, email, username, role, status, active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'super_admin', 'active', true)
       ON CONFLICT (username) DO UPDATE SET active=true
       RETURNING id::text`,
      [tenantId, userId, "Dhanya Mohan (Superadmin)", "mgdhanyamohan@omsystems.bank", username],
    );
    return insUser.rows[0]?.id ?? "00000000-0000-0000-0000-000000000001";
  }

  // ============================================
  // Session Management
  // ============================================

  async startActivitySession(
    userId: string,
    tenantId: string,
    deviceInfo: any,
    ipAddress: string,
    locationInfo?: any
  ): Promise<string> {
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const resolvedUserId = await this.resolveUserUuid(userId, resolvedTenantId);

    const result = await this.pool.query(
      `INSERT INTO user_activity_sessions (
        tenant_id, user_id, device_info, ip_address, location_info,
        session_status, login_time, last_activity_time
      ) VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [resolvedTenantId, resolvedUserId, JSON.stringify(deviceInfo || {}), ipAddress, JSON.stringify(locationInfo || {})]
    );
    
    // Update current activity status
    await this.pool.query(
      `INSERT INTO user_current_activity (user_id, tenant_id, session_id, is_online, last_activity_time)
       VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         session_id = EXCLUDED.session_id,
         is_online = true,
         last_activity_time = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [resolvedUserId, resolvedTenantId, result.rows[0].id]
    );
    
    return result.rows[0].id;
  }

  async endActivitySession(
    sessionId: string,
    userId: string,
    terminationReason = 'user_logout'
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Close child intervals first so session active/idle totals include the
      // final page and monitoring interval even on browser exit.
      await client.query(
        `UPDATE user_page_visits
         SET visit_end_time = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - visit_start_time))::INT,
             active_time_seconds = CASE
               WHEN active_time_seconds = 0 AND idle_time_seconds = 0
               THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - visit_start_time))::INT
               ELSE active_time_seconds
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND user_id = $2 AND visit_end_time IS NULL`,
        [sessionId, userId]
      );
      await client.query(
        `UPDATE control_room_monitoring_activity
         SET monitoring_end_time = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - monitoring_start_time))::INT,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND user_id = $2 AND monitoring_end_time IS NULL`,
        [sessionId, userId]
      );
      await client.query(
        `UPDATE user_activity_sessions
         SET logout_time = CURRENT_TIMESTAMP,
             total_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::INT,
             active_duration_seconds = COALESCE((
               SELECT SUM(active_time_seconds) FROM user_page_visits WHERE session_id = $1
             ), 0)::INT,
             idle_duration_seconds = COALESCE((
               SELECT SUM(idle_time_seconds) FROM user_page_visits WHERE session_id = $1
             ), 0)::INT,
             session_status = 'logged_out',
             termination_reason = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND logout_time IS NULL`,
        [sessionId, userId, terminationReason]
      );
      await client.query(
        `UPDATE user_current_activity
         SET is_online = false,
             is_in_control_room = false,
             current_branch_id = NULL,
             current_branch_name = NULL,
             current_branch_group = NULL,
             monitoring_camera_count = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2`,
        [userId, sessionId]
      );
      await client.query(`SELECT update_user_daily_activity_summary($1::uuid, CURRENT_DATE)`, [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSessionHeartbeat(sessionId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_activity_sessions
       SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND logout_time IS NULL`,
      [sessionId, userId]
    );
    
    await this.pool.query(
      `UPDATE user_current_activity
       SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND session_id = $2 AND is_online = true`,
      [userId, sessionId]
    );
  }

  async expireStaleActivitySessions(staleAfterSeconds: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stale = await client.query<{ id: string; user_id: string }>(
        `SELECT id::text, user_id::text
         FROM user_activity_sessions
         WHERE session_status = 'active' AND logout_time IS NULL
           AND last_activity_time < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')
         FOR UPDATE SKIP LOCKED`,
        [staleAfterSeconds]
      );
      if (stale.rows.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      const sessionIds = stale.rows.map((row) => row.id);
      await client.query(
        `UPDATE user_page_visits page
         SET visit_end_time = GREATEST(page.visit_start_time, session.last_activity_time),
             duration_seconds = EXTRACT(EPOCH FROM (
               GREATEST(page.visit_start_time, session.last_activity_time) - page.visit_start_time
             ))::INT,
             active_time_seconds = CASE
               WHEN page.active_time_seconds = 0 AND page.idle_time_seconds = 0
               THEN EXTRACT(EPOCH FROM (
                 GREATEST(page.visit_start_time, session.last_activity_time) - page.visit_start_time
               ))::INT
               ELSE page.active_time_seconds
             END,
             updated_at = CURRENT_TIMESTAMP
         FROM user_activity_sessions session
         WHERE page.session_id = session.id AND page.session_id = ANY($1::uuid[])
           AND page.visit_end_time IS NULL`,
        [sessionIds]
      );
      await client.query(
        `UPDATE control_room_monitoring_activity activity
         SET monitoring_end_time = GREATEST(activity.monitoring_start_time, session.last_activity_time),
             duration_seconds = EXTRACT(EPOCH FROM (
               GREATEST(activity.monitoring_start_time, session.last_activity_time) - activity.monitoring_start_time
             ))::INT,
             updated_at = CURRENT_TIMESTAMP
         FROM user_activity_sessions session
         WHERE activity.session_id = session.id AND activity.session_id = ANY($1::uuid[])
           AND activity.monitoring_end_time IS NULL`,
        [sessionIds]
      );
      await client.query(
        `UPDATE user_activity_sessions session
         SET logout_time = session.last_activity_time,
             total_duration_seconds = EXTRACT(EPOCH FROM (session.last_activity_time - session.login_time))::INT,
             active_duration_seconds = COALESCE((
               SELECT SUM(page.active_time_seconds) FROM user_page_visits page WHERE page.session_id = session.id
             ), 0)::INT,
             idle_duration_seconds = COALESCE((
               SELECT SUM(page.idle_time_seconds) FROM user_page_visits page WHERE page.session_id = session.id
             ), 0)::INT,
             session_status = 'expired',
             termination_reason = 'session_timeout',
             updated_at = CURRENT_TIMESTAMP
         WHERE session.id = ANY($1::uuid[]) AND session.logout_time IS NULL`,
        [sessionIds]
      );
      await client.query(
        `UPDATE user_current_activity
         SET is_online = false,
             is_in_control_room = false,
             current_branch_id = NULL,
             current_branch_name = NULL,
             current_branch_group = NULL,
             monitoring_camera_count = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ANY($1::uuid[])`,
        [sessionIds]
      );
      for (const userId of new Set(stale.rows.map((row) => row.user_id))) {
        await client.query(`SELECT update_user_daily_activity_summary($1::uuid, CURRENT_DATE)`, [userId]);
      }
      await client.query('COMMIT');
      return stale.rows.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Page Visit Tracking
  // ============================================

  async trackPageVisit(
    userId: string,
    tenantId: string,
    sessionId: string,
    pagePath: string,
    pageTitle: string | null,
    pageModule: string,
    pageCategory: string | null,
    referrerPath: string | null,
    queryParameters: any
  ): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO user_page_visits (
        tenant_id, user_id, session_id, page_path, page_title,
        page_module, page_category, referrer_path, query_parameters, visit_start_time
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
      FROM user_activity_sessions session
      WHERE session.id = $3 AND session.user_id = $2 AND session.tenant_id = $1
        AND session.logout_time IS NULL
      RETURNING id`,
      [tenantId, userId, sessionId, pagePath, pageTitle, pageModule, pageCategory, referrerPath, JSON.stringify(queryParameters || {})]
    );
    
    return result.rows[0].id;
  }

  async endPageVisit(
    pageVisitId: string,
    userId: string,
    durationSeconds: number,
    activeTimeSeconds: number,
    idleTimeSeconds: number,
    clickCount: number,
    scrollDepthPercentage: number,
    formInteractionsCount: number,
    nextPagePath: string | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE user_page_visits
       SET visit_end_time = CURRENT_TIMESTAMP,
           duration_seconds = $3,
           active_time_seconds = $4,
           idle_time_seconds = $5,
           click_count = $6,
           scroll_depth_percentage = $7,
           form_interactions_count = $8,
           next_page_path = $9,
           updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND visit_end_time IS NULL`,
      [pageVisitId, userId, durationSeconds, activeTimeSeconds, idleTimeSeconds, 
       clickCount, scrollDepthPercentage, formInteractionsCount, nextPagePath]
    );
  }

  // ============================================
  // Control Room Activity Tracking
  // ============================================

  async startControlRoomActivity(
    userId: string,
    tenantId: string,
    sessionId: string,
    pageVisitId: string | null,
    monitoringType: string,
    branchNodeId: string | null,
    branchGroupId: string | null,
    branchGroupName: string | null,
    cameraIds: string[],
    branchIds: string[],
    branchNames: string[],
    monitoringMode: string
  ): Promise<string> {
    // First verify session exists and is active
    const sessionCheck = await this.pool.query(
      `SELECT id FROM user_activity_sessions
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND logout_time IS NULL`,
      [sessionId, userId, tenantId]
    );
    
    if (sessionCheck.rows.length === 0) {
      throw new Error('Invalid or expired session');
    }
    
    // If pageVisitId provided, verify it exists
    if (pageVisitId) {
      const pageCheck = await this.pool.query(
        `SELECT id FROM user_page_visits
         WHERE id = $1 AND user_id = $2 AND session_id = $3`,
        [pageVisitId, userId, sessionId]
      );
      
      if (pageCheck.rows.length === 0) {
        throw new Error('Invalid page visit ID');
      }
    }
    
    // Insert the control room activity
    const result = await this.pool.query(
      `INSERT INTO control_room_monitoring_activity (
        tenant_id, user_id, session_id, page_visit_id, monitoring_type,
        branch_node_id, branch_group_id, branch_group_name,
        camera_ids, camera_count, branch_ids, branch_names,
        monitoring_mode, monitoring_start_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      RETURNING id`,
      [
        tenantId, userId, sessionId, pageVisitId, monitoringType,
        branchNodeId, branchGroupId, branchGroupName,
        cameraIds, cameraIds.length, branchIds, branchNames,
        monitoringMode
      ]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create control room activity record');
    }
    
    // Update current activity
    await this.pool.query(
      `UPDATE user_current_activity
       SET is_in_control_room = true,
           current_branch_id = $2,
           current_branch_name = $3,
           current_branch_group = $4,
           monitoring_camera_count = $5,
           current_activity = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [
        userId, branchNodeId, branchNames[0] || null, branchGroupName,
        cameraIds.length, `Monitoring: ${branchNames[0] || branchGroupName || 'Multiple branches'}`
      ]
    );
    
    return result.rows[0].id;
  }

  async endControlRoomActivity(
    activityId: string,
    userId: string,
    durationSeconds: number,
    alertCount: number,
    incidentCount: number,
    cameraSwitchCount: number,
    playbackCount: number,
    snapshotCount: number,
    exportCount: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE control_room_monitoring_activity
       SET monitoring_end_time = CURRENT_TIMESTAMP,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - monitoring_start_time))::INT,
           alert_count = $4,
           incident_count = $5,
           camera_switch_count = $6,
           playback_count = $7,
           snapshot_count = $8,
           export_count = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [activityId, userId, durationSeconds, alertCount, incidentCount, 
       cameraSwitchCount, playbackCount, snapshotCount, exportCount]
    );
    
    // Update current activity
    await this.pool.query(
      `UPDATE user_current_activity
       SET is_in_control_room = false,
           current_branch_id = NULL,
           current_branch_name = NULL,
           current_branch_group = NULL,
           monitoring_camera_count = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
  }

  async updateControlRoomActivity(
    activityId: string,
    userId: string,
    alertCount: number | null,
    incidentCount: number | null,
    cameraSwitchCount: number | null
  ): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [activityId, userId];
    let paramIndex = 3;
    
    if (alertCount !== null) {
      updates.push(`alert_count = $${paramIndex++}`);
      values.push(alertCount);
    }
    if (incidentCount !== null) {
      updates.push(`incident_count = $${paramIndex++}`);
      values.push(incidentCount);
    }
    if (cameraSwitchCount !== null) {
      updates.push(`camera_switch_count = $${paramIndex++}`);
      values.push(cameraSwitchCount);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      await this.pool.query(
        `UPDATE control_room_monitoring_activity
         SET ${updates.join(', ')}
         WHERE id = $1 AND user_id = $2`,
        values
      );
    }
  }

  // ============================================
  // Action Logging
  // ============================================

  async logUserAction(
    userId: string,
    tenantId: string,
    sessionId: string,
    pageVisitId: string | null,
    actionType: string,
    actionCategory: string,
    actionTarget: string | null,
    actionDescription: string | null,
    moduleName: string,
    featureName: string | null,
    actionMetadata: any
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_action_log (
        tenant_id, user_id, session_id, page_visit_id, action_type,
        action_category, action_target, action_description, module_name,
        feature_name, action_metadata, action_time
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
      FROM user_activity_sessions session
      WHERE session.id = $3 AND session.user_id = $2 AND session.tenant_id = $1
        AND session.logout_time IS NULL
        AND ($4::uuid IS NULL OR EXISTS (
          SELECT 1 FROM user_page_visits page
          WHERE page.id = $4 AND page.user_id = $2 AND page.session_id = $3
        ))`,
      [
        tenantId, userId, sessionId, pageVisitId, actionType,
        actionCategory, actionTarget, actionDescription, moduleName,
        featureName, JSON.stringify(actionMetadata || {})
      ]
    );
  }

  // ============================================
  // Current Activity
  // ============================================

  async getCurrentActivity(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM v_active_users_now
       WHERE user_id IN (
         SELECT id FROM users WHERE tenant_id = $1
       )
       ORDER BY last_activity_time DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async getUserCurrentActivity(userId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT * FROM user_current_activity WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // ============================================
  // Reports and Summaries
  // ============================================

  async getActivitySessions(
    tenantId: string,
    userId: string,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<{ sessions: any[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1', 'user_id = $2'];
    const values: any[] = [tenantId, userId];
    let paramIndex = 3;
    
    if (startDate) {
      conditions.push(`DATE(login_time) >= $${paramIndex++}::date`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(login_time) <= $${paramIndex++}::date`);
      values.push(endDate);
    }
    
    const whereClause = conditions.join(' AND ');
    
    const sessionsResult = await this.pool.query(
      `SELECT * FROM v_user_session_details
       WHERE ${whereClause}
       ORDER BY login_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );
    
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM user_activity_sessions WHERE ${whereClause}`,
      values
    );
    
    return {
      sessions: sessionsResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  async getPageVisits(
    tenantId: string,
    userId: string,
    sessionId: string | null,
    module: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]> {
    const conditions: string[] = ['pv.tenant_id = $1', 'pv.user_id = $2'];
    const values: any[] = [tenantId, userId];
    let paramIndex = 3;
    
    if (sessionId) {
      conditions.push(`pv.session_id = $${paramIndex++}`);
      values.push(sessionId);
    }
    if (module) {
      conditions.push(`pv.page_module = $${paramIndex++}`);
      values.push(module);
    }
    if (startDate) {
      conditions.push(`DATE(pv.visit_start_time) >= $${paramIndex++}::date`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(pv.visit_start_time) <= $${paramIndex++}::date`);
      values.push(endDate);
    }
    
    const result = await this.pool.query(
      `SELECT pv.*, u.display_name as user_name
       FROM user_page_visits pv
       JOIN users u ON u.id = pv.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pv.visit_start_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );
    
    return result.rows;
  }

  async getControlRoomActivities(
    tenantId: string,
    userId: string,
    branchId: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]> {
    const conditions: string[] = ['cr.tenant_id = $1', 'cr.user_id = $2'];
    const values: any[] = [tenantId, userId];
    let paramIndex = 3;
    
    if (branchId) {
      conditions.push(`cr.branch_node_id = $${paramIndex++}`);
      values.push(branchId);
    }
    if (startDate) {
      conditions.push(`DATE(cr.monitoring_start_time) >= $${paramIndex++}::date`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(cr.monitoring_start_time) <= $${paramIndex++}::date`);
      values.push(endDate);
    }
    
    const result = await this.pool.query(
      `SELECT cr.*, u.display_name as user_name, rn.name as branch_name
       FROM control_room_monitoring_activity cr
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cr.monitoring_start_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );
    
    return result.rows;
  }

  async getDailySummary(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT s.*, u.display_name as user_name
       FROM user_activity_daily_summary s
       JOIN users u ON u.id = s.user_id
       WHERE s.tenant_id = $1 AND s.user_id = $2
         AND s.summary_date >= $3::date AND s.summary_date <= $4::date
       ORDER BY s.summary_date DESC`,
      [tenantId, userId, startDate, endDate]
    );
    
    return result.rows;
  }

  async getWeeklySummary(
    tenantId: string,
    userId: string,
    year: number,
    weeks: number
  ): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT s.*, u.display_name as user_name
       FROM user_activity_weekly_summary s
       JOIN users u ON u.id = s.user_id
       WHERE s.tenant_id = $1 AND s.user_id = $2 AND s.year = $3
       ORDER BY s.week_start_date DESC
       LIMIT $4`,
      [tenantId, userId, year, weeks]
    );
    
    return result.rows;
  }

  async getMonthlySummary(
    tenantId: string,
    userId: string,
    year: number,
    months: number
  ): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT s.*, u.display_name as user_name
       FROM user_activity_monthly_summary s
       JOIN users u ON u.id = s.user_id
       WHERE s.tenant_id = $1 AND s.user_id = $2 AND s.year = $3
       ORDER BY s.year DESC, s.month DESC
       LIMIT $4`,
      [tenantId, userId, year, months]
    );
    
    return result.rows;
  }

  async getActivityTimeline(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string,
    limit: number,
    offset: number
  ): Promise<{ events: any[]; total: number }> {
    const result = await this.pool.query(
      `WITH timeline AS (
        SELECT
          'session-login-' || s.id::text AS event_id,
          'session_login'::text AS event_type,
          s.login_time AS event_time,
          s.id AS session_id,
          NULL::uuid AS page_visit_id,
          NULL::text AS module_name,
          'Signed in'::text AS title,
          'Authenticated employee session started'::text AS description,
          NULL::int AS duration_seconds,
          NULL::uuid AS branch_id,
          NULL::text AS branch_name,
          NULL::text AS outcome,
          jsonb_build_object('status', s.session_status, 'device', COALESCE(s.device_info, '{}'::jsonb)) AS metadata
        FROM user_activity_sessions s
        WHERE s.tenant_id = $1 AND s.user_id = $2
          AND s.login_time >= $3::date AND s.login_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'session-logout-' || s.id::text,
          'session_logout', s.logout_time, s.id, NULL::uuid, NULL::text,
          'Signed out', COALESCE('Session ended: ' || s.termination_reason, 'Employee session ended'),
          s.total_duration_seconds, NULL::uuid, NULL::text, NULL::text,
          jsonb_build_object('status', s.session_status, 'activeSeconds', s.active_duration_seconds, 'idleSeconds', s.idle_duration_seconds)
        FROM user_activity_sessions s
        WHERE s.tenant_id = $1 AND s.user_id = $2 AND s.logout_time IS NOT NULL
          AND s.logout_time >= $3::date AND s.logout_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'page-enter-' || pv.id::text,
          'page_enter', pv.visit_start_time, pv.session_id, pv.id, pv.page_module,
          COALESCE(NULLIF(pv.page_title, ''), pv.page_path),
          'Entered ' || pv.page_path, NULL::int, NULL::uuid, NULL::text, NULL::text,
          jsonb_build_object('path', pv.page_path, 'category', pv.page_category)
        FROM user_page_visits pv
        WHERE pv.tenant_id = $1 AND pv.user_id = $2
          AND pv.visit_start_time >= $3::date AND pv.visit_start_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'page-exit-' || pv.id::text,
          'page_exit', pv.visit_end_time, pv.session_id, pv.id, pv.page_module,
          COALESCE(NULLIF(pv.page_title, ''), pv.page_path),
          'Left ' || pv.page_path, pv.duration_seconds, NULL::uuid, NULL::text, NULL::text,
          jsonb_build_object(
            'path', pv.page_path,
            'activeSeconds', pv.active_time_seconds,
            'idleSeconds', pv.idle_time_seconds,
            'clickCount', pv.click_count,
            'formInteractions', pv.form_interactions_count,
            'scrollDepth', pv.scroll_depth_percentage
          )
        FROM user_page_visits pv
        WHERE pv.tenant_id = $1 AND pv.user_id = $2 AND pv.visit_end_time IS NOT NULL
          AND pv.visit_end_time >= $3::date AND pv.visit_end_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'monitor-start-' || cr.id::text,
          'monitoring_start', cr.monitoring_start_time, cr.session_id, cr.page_visit_id, 'control_room',
          'Control-room monitoring started',
          'Monitoring ' || COALESCE(rn.name, NULLIF(array_to_string(cr.branch_names, ', '), ''), cr.branch_group_name, 'multiple branches'),
          NULL::int, cr.branch_node_id, COALESCE(rn.name, NULLIF(array_to_string(cr.branch_names, ', '), ''), cr.branch_group_name), NULL::text,
          jsonb_build_object('mode', cr.monitoring_mode, 'type', cr.monitoring_type, 'cameraCount', cr.camera_count, 'branchIds', cr.branch_ids)
        FROM control_room_monitoring_activity cr
        LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
        WHERE cr.tenant_id = $1 AND cr.user_id = $2
          AND cr.monitoring_start_time >= $3::date AND cr.monitoring_start_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'monitor-end-' || cr.id::text,
          'monitoring_end', cr.monitoring_end_time, cr.session_id, cr.page_visit_id, 'control_room',
          'Control-room monitoring ended',
          'Stopped monitoring ' || COALESCE(rn.name, NULLIF(array_to_string(cr.branch_names, ', '), ''), cr.branch_group_name, 'multiple branches'),
          cr.duration_seconds, cr.branch_node_id, COALESCE(rn.name, NULLIF(array_to_string(cr.branch_names, ', '), ''), cr.branch_group_name), NULL::text,
          jsonb_build_object(
            'cameraCount', cr.camera_count, 'alerts', cr.alert_count, 'incidents', cr.incident_count,
            'cameraSwitches', cr.camera_switch_count, 'playbacks', cr.playback_count,
            'snapshots', cr.snapshot_count, 'exports', cr.export_count
          )
        FROM control_room_monitoring_activity cr
        LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
        WHERE cr.tenant_id = $1 AND cr.user_id = $2 AND cr.monitoring_end_time IS NOT NULL
          AND cr.monitoring_end_time >= $3::date AND cr.monitoring_end_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'action-' || a.id::text,
          'user_action', a.action_time, a.session_id, a.page_visit_id, a.module_name,
          replace(a.action_type, '_', ' '),
          COALESCE(a.action_description, a.action_target, a.action_type),
          NULL::int, NULL::uuid, NULL::text, NULL::text,
          jsonb_build_object('category', a.action_category, 'target', a.action_target, 'feature', a.feature_name, 'context', a.action_metadata)
        FROM user_action_log a
        WHERE a.tenant_id = $1 AND a.user_id = $2
          AND a.action_time >= $3::date AND a.action_time < ($4::date + INTERVAL '1 day')

        UNION ALL
        SELECT
          'transaction-' || ae.id::text,
          'transaction', ae.occurred_at, NULL::uuid, NULL::uuid, 'platform',
          replace(ae.action, '.', ' '),
          'Server transaction ' || ae.outcome,
          NULL::int, ae.resource_node_id, rn.name, ae.outcome,
          jsonb_build_object('correlationId', ae.correlation_id, 'resourceNodeId', ae.resource_node_id)
        FROM audit_events ae
        LEFT JOIN resource_nodes rn ON rn.id = ae.resource_node_id
        WHERE ae.tenant_id = $1 AND ae.actor_user_id = $2
          AND ae.occurred_at >= $3::date AND ae.occurred_at < ($4::date + INTERVAL '1 day')
      )
      SELECT timeline.*, COUNT(*) OVER()::int AS total_count
      FROM timeline
      ORDER BY event_time DESC, event_id DESC
      LIMIT $5 OFFSET $6`,
      [tenantId, userId, startDate, endDate, limit, offset]
    );

    const total = Number(result.rows[0]?.total_count ?? 0);
    return {
      events: result.rows.map(({ total_count: _totalCount, ...event }) => event),
      total,
    };
  }

  async getComprehensiveReport(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    // Get user info
    const userResult = await this.pool.query(
      `SELECT id, display_name, identity_subject as username
       FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    
    // Get session summary
    const sessionResult = await this.pool.query(
      `SELECT
         COUNT(*) as total_sessions,
         SUM(COALESCE(total_duration_seconds, 0)) as total_duration_seconds,
         SUM(COALESCE(active_duration_seconds, 0)) as active_duration_seconds,
         SUM(COALESCE(idle_duration_seconds, 0)) as idle_duration_seconds,
         AVG(COALESCE(total_duration_seconds, 0))::int as avg_session_duration_seconds,
         MIN(login_time) as first_login,
         MAX(logout_time) as last_logout
       FROM user_activity_sessions
       WHERE tenant_id = $1 AND user_id = $2 AND DATE(login_time) >= $3::date AND DATE(login_time) <= $4::date`,
      [tenantId, userId, startDate, endDate]
    );
    
    // Get module usage
    const moduleResult = await this.pool.query(
      `SELECT
         page_module,
         COUNT(*) as visit_count,
         SUM(COALESCE(duration_seconds, 0)) as total_seconds,
         AVG(COALESCE(duration_seconds, 0))::int as avg_seconds
       FROM user_page_visits
       WHERE tenant_id = $1 AND user_id = $2 AND DATE(visit_start_time) >= $3::date AND DATE(visit_start_time) <= $4::date
       GROUP BY page_module
       ORDER BY total_seconds DESC`,
      [tenantId, userId, startDate, endDate]
    );
    
    // Get control room summary
    const controlRoomResult = await this.pool.query(
      `SELECT
         COUNT(*) as total_monitoring_sessions,
         SUM(COALESCE(duration_seconds, 0)) as total_monitoring_seconds,
         (SELECT COUNT(DISTINCT monitored.branch_id)
          FROM control_room_monitoring_activity scoped
          CROSS JOIN LATERAL unnest(
            CASE
              WHEN cardinality(scoped.branch_ids) > 0 THEN scoped.branch_ids
              WHEN scoped.branch_node_id IS NOT NULL THEN ARRAY[scoped.branch_node_id]
              ELSE ARRAY[]::uuid[]
            END
          ) AS monitored(branch_id)
          WHERE scoped.tenant_id = $1 AND scoped.user_id = $2
            AND DATE(scoped.monitoring_start_time) >= $3::date
            AND DATE(scoped.monitoring_start_time) <= $4::date) as unique_branches_monitored,
         SUM(COALESCE(alert_count, 0)) as total_alerts_handled,
         SUM(COALESCE(incident_count, 0)) as total_incidents_created,
         SUM(COALESCE(camera_switch_count, 0)) as total_camera_switches
       FROM control_room_monitoring_activity
       WHERE tenant_id = $1 AND user_id = $2 AND DATE(monitoring_start_time) >= $3::date AND DATE(monitoring_start_time) <= $4::date`,
      [tenantId, userId, startDate, endDate]
    );
    
    // Get branch monitoring breakdown
    const branchResult = await this.pool.query(
      `SELECT
         COALESCE(rn.name, cr.branch_names[monitored.ordinality::int], monitored.branch_id::text) as branch_name,
         monitored.branch_id as branch_node_id,
         COUNT(*) as monitoring_sessions,
         SUM(COALESCE(cr.duration_seconds, 0)) as total_seconds
       FROM control_room_monitoring_activity cr
       CROSS JOIN LATERAL unnest(
         CASE
           WHEN cardinality(cr.branch_ids) > 0 THEN cr.branch_ids
           WHEN cr.branch_node_id IS NOT NULL THEN ARRAY[cr.branch_node_id]
           ELSE ARRAY[]::uuid[]
         END
       ) WITH ORDINALITY AS monitored(branch_id, ordinality)
       LEFT JOIN resource_nodes rn ON rn.id = monitored.branch_id
       WHERE cr.tenant_id = $1 AND cr.user_id = $2
         AND DATE(cr.monitoring_start_time) >= $3::date
         AND DATE(cr.monitoring_start_time) <= $4::date
       GROUP BY rn.name, cr.branch_names[monitored.ordinality::int], monitored.branch_id
       ORDER BY total_seconds DESC
       LIMIT 20`,
      [tenantId, userId, startDate, endDate]
    );
    
    // Get action summary
    const actionResult = await this.pool.query(
      `SELECT action_category, COUNT(*) as action_count
       FROM user_action_log
       WHERE tenant_id = $1 AND user_id = $2 AND DATE(action_time) >= $3::date AND DATE(action_time) <= $4::date
       GROUP BY action_category
       ORDER BY action_count DESC`,
      [tenantId, userId, startDate, endDate]
    );
    
    return {
      user: userResult.rows[0],
      period: { startDate, endDate },
      sessionSummary: sessionResult.rows[0],
      moduleUsage: moduleResult.rows,
      controlRoomSummary: controlRoomResult.rows[0],
      branchMonitoring: branchResult.rows,
      actionSummary: actionResult.rows
    };
  }
}
