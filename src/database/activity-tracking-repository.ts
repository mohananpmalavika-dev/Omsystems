import type { Pool } from "pg";

export class ActivityTrackingRepository {
  constructor(private pool: Pool) {}

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
    const result = await this.pool.query(
      `INSERT INTO user_activity_sessions (
        tenant_id, user_id, device_info, ip_address, location_info,
        session_status, login_time, last_activity_time
      ) VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [tenantId, userId, JSON.stringify(deviceInfo || {}), ipAddress, JSON.stringify(locationInfo || {})]
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
      [userId, tenantId, result.rows[0].id]
    );
    
    return result.rows[0].id;
  }

  async endActivitySession(sessionId: string, userId: string): Promise<void> {
    // Update session
    await this.pool.query(
      `UPDATE user_activity_sessions
       SET logout_time = CURRENT_TIMESTAMP,
           total_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::INT,
           session_status = 'logged_out',
           termination_reason = 'user_logout',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND logout_time IS NULL`,
      [sessionId, userId]
    );
    
    // End any active page visits
    await this.pool.query(
      `UPDATE user_page_visits
       SET visit_end_time = CURRENT_TIMESTAMP,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - visit_start_time))::INT,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND visit_end_time IS NULL`,
      [sessionId]
    );
    
    // End any active control room monitoring
    await this.pool.query(
      `UPDATE control_room_monitoring_activity
       SET monitoring_end_time = CURRENT_TIMESTAMP,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - monitoring_start_time))::INT,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND monitoring_end_time IS NULL`,
      [sessionId]
    );
    
    // Update current activity status
    await this.pool.query(
      `UPDATE user_current_activity
       SET is_online = false, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
    
    // Trigger daily summary update
    await this.pool.query(
      `SELECT update_user_daily_activity_summary($1::uuid, CURRENT_DATE)`,
      [userId]
    );
  }

  async updateSessionHeartbeat(sessionId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_activity_sessions
       SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    
    await this.pool.query(
      `UPDATE user_current_activity
       SET last_activity_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
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
       WHERE id = $1 AND user_id = $2`,
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
    const result = await this.pool.query(
      `INSERT INTO control_room_monitoring_activity (
        tenant_id, user_id, session_id, page_visit_id, monitoring_type,
        branch_node_id, branch_group_id, branch_group_name,
        camera_ids, camera_count, branch_ids, branch_names,
        monitoring_mode, monitoring_start_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      RETURNING id`,
      [
        tenantId, userId, sessionId, pageVisitId, monitoringType,
        branchNodeId, branchGroupId, branchGroupName,
        cameraIds, cameraIds.length, branchIds, branchNames,
        monitoringMode
      ]
    );
    
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
           duration_seconds = $3,
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
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

  async getComprehensiveReport(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    // Get user info
    const userResult = await this.pool.query(
      `SELECT id, display_name, identity_subject as username
       FROM users WHERE id = $1`,
      [userId]
    );
    
    // Get session summary
    const sessionResult = await this.pool.query(
      `SELECT
         COUNT(*) as total_sessions,
         SUM(COALESCE(total_duration_seconds, 0)) as total_duration_seconds,
         AVG(COALESCE(total_duration_seconds, 0))::int as avg_session_duration_seconds,
         MIN(login_time) as first_login,
         MAX(logout_time) as last_logout
       FROM user_activity_sessions
       WHERE user_id = $1 AND DATE(login_time) >= $2::date AND DATE(login_time) <= $3::date`,
      [userId, startDate, endDate]
    );
    
    // Get module usage
    const moduleResult = await this.pool.query(
      `SELECT
         page_module,
         COUNT(*) as visit_count,
         SUM(COALESCE(duration_seconds, 0)) as total_seconds,
         AVG(COALESCE(duration_seconds, 0))::int as avg_seconds
       FROM user_page_visits
       WHERE user_id = $1 AND DATE(visit_start_time) >= $2::date AND DATE(visit_start_time) <= $3::date
       GROUP BY page_module
       ORDER BY total_seconds DESC`,
      [userId, startDate, endDate]
    );
    
    // Get control room summary
    const controlRoomResult = await this.pool.query(
      `SELECT
         COUNT(*) as total_monitoring_sessions,
         SUM(COALESCE(duration_seconds, 0)) as total_monitoring_seconds,
         COUNT(DISTINCT branch_node_id) as unique_branches_monitored,
         SUM(COALESCE(alert_count, 0)) as total_alerts_handled,
         SUM(COALESCE(incident_count, 0)) as total_incidents_created,
         SUM(COALESCE(camera_switch_count, 0)) as total_camera_switches
       FROM control_room_monitoring_activity
       WHERE user_id = $1 AND DATE(monitoring_start_time) >= $2::date AND DATE(monitoring_start_time) <= $3::date`,
      [userId, startDate, endDate]
    );
    
    // Get branch monitoring breakdown
    const branchResult = await this.pool.query(
      `SELECT
         rn.name as branch_name,
         cr.branch_node_id,
         COUNT(*) as monitoring_sessions,
         SUM(COALESCE(cr.duration_seconds, 0)) as total_seconds
       FROM control_room_monitoring_activity cr
       LEFT JOIN resource_nodes rn ON rn.id = cr.branch_node_id
       WHERE cr.user_id = $1 
         AND DATE(cr.monitoring_start_time) >= $2::date 
         AND DATE(cr.monitoring_start_time) <= $3::date
         AND cr.branch_node_id IS NOT NULL
       GROUP BY rn.name, cr.branch_node_id
       ORDER BY total_seconds DESC
       LIMIT 20`,
      [userId, startDate, endDate]
    );
    
    // Get action summary
    const actionResult = await this.pool.query(
      `SELECT action_category, COUNT(*) as action_count
       FROM user_action_log
       WHERE user_id = $1 AND DATE(action_time) >= $2::date AND DATE(action_time) <= $3::date
       GROUP BY action_category
       ORDER BY action_count DESC`,
      [userId, startDate, endDate]
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
