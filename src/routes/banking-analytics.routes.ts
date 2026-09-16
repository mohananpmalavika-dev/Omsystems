import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

export interface BankingAnalyticsRouteOptions {
  pool: any;
}

interface AuthenticatedRequest extends FastifyRequest {
  currentUser?: {
    id: string;
    tenantId: string;
    role: string;
  };
}

export function registerBankingAnalyticsRoutes(
  app: FastifyInstance,
  options: BankingAnalyticsRouteOptions
) {
  const { pool } = options;

  function requireAuth(request: AuthenticatedRequest) {
    if (!request.currentUser?.tenantId) {
      throw new Error("authentication_required");
    }
    return request.currentUser;
  }

  // Get comprehensive banking analytics dashboard data
  app.get("/api/banking/analytics", async (request: AuthenticatedRequest, reply) => {
    try {
      const user = requireAuth(request);
      const query = request.query as {
        branchId?: string;
        period?: string;
        startDate?: string;
        endDate?: string;
      };

      const period = query.period || "today";
      const now = new Date();
      let startDate: Date;
      let endDate = now;

      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "custom":
          startDate = query.startDate ? new Date(query.startDate) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
          endDate = query.endDate ? new Date(query.endDate) : now;
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      }

      // Get active AI rules for banking analytics
      const rulesQuery = `
        SELECT 
          id, name, detector_type, state, severity, actions,
          (SELECT COUNT(*) FROM nbfc_rule_state WHERE rule_id = r.id AND current_status = 'ACTIVE_ALERTING') as active_alerts,
          (SELECT COUNT(*) FROM nbfc_rule_state WHERE rule_id = r.id AND last_triggered_at >= $2) as triggers_in_period
        FROM nbfc_analytics_rules r
        WHERE tenant_id = $1
          AND enabled = true
          AND state IN ('ACTIVE', 'SHADOW')
          AND detector_type IN ('person', 'queue', 'crowd-density', 'anpr', 'zone', 'tailgating')
          ${query.branchId ? "AND ($3 = ANY(branch_ids) OR branch_ids = '{}'::jsonb)" : ""}
        ORDER BY severity DESC, name
      `;
      const rulesParams = query.branchId 
        ? [user.tenantId, startDate, query.branchId]
        : [user.tenantId, startDate];
      
      const rulesResult = await pool.query(rulesQuery, rulesParams);

      // Get cash counter analytics from real alerts and cameras
      const cashCounterQuery = `
        WITH counter_cameras AS (
          SELECT 
            c.id,
            c.name,
            c.branch_id,
            c.status,
            b.name as branch_name,
            CASE 
              WHEN c.status = 'online' THEN true
              ELSE false
            END as is_active
          FROM cameras c
          JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1
            AND c.name ~* 'counter|cash|teller'
            ${query.branchId ? "AND c.branch_id = $2" : ""}
        ),
        counter_alerts AS (
          SELECT 
            a.camera_id,
            a.severity,
            a.status,
            a.created_at
          FROM alerts a
          WHERE a.tenant_id = $1
            AND a.created_at >= $3
            AND a.alert_type IN ('crowd_density', 'queue_length', 'person_count', 'unattended_counter')
            ${query.branchId ? "AND a.branch_id = $2" : ""}
        )
        SELECT 
          COUNT(DISTINCT cc.id) FILTER (WHERE cc.is_active) as active_counters,
          COUNT(DISTINCT ca.camera_id) FILTER (WHERE ca.severity IN ('HIGH', 'CRITICAL') AND ca.status = 'open') as counters_with_alerts,
          COUNT(*) FILTER (WHERE ca.severity = 'CRITICAL') as critical_alerts_today,
          COUNT(*) FILTER (WHERE ca.created_at >= NOW() - INTERVAL '1 hour') as alerts_last_hour
        FROM counter_cameras cc
        LEFT JOIN counter_alerts ca ON ca.camera_id = cc.id
      `;
      const cashCounterParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      
      const cashCounterResult = await pool.query(cashCounterQuery, cashCounterParams);

      // Get vault and locker security analytics
      const vaultQuery = `
        WITH vault_zones AS (
          SELECT 
            z.id,
            z.name,
            z.camera_id,
            z.branch_id,
            z.type,
            z.enabled
          FROM nbfc_analytics_zones z
          WHERE z.tenant_id = $1
            AND z.type IN ('LOCKER', 'STRONG_ROOM', 'RESTRICTED_AREA')
            AND z.enabled = true
            ${query.branchId ? "AND z.branch_id = $2" : ""}
        ),
        vault_rules AS (
          SELECT 
            r.id,
            r.name,
            r.zone_id,
            s.current_status,
            s.last_triggered_at,
            s.entity_key
          FROM nbfc_analytics_rules r
          LEFT JOIN nbfc_rule_state s ON s.rule_id = r.id
          WHERE r.tenant_id = $1
            AND r.enabled = true
            AND r.detector_type IN ('person', 'zone')
            AND (r.zone_id IN (SELECT id FROM vault_zones) OR r.name ~* 'vault|locker|strong')
            ${query.branchId ? "AND ($2 = ANY(r.branch_ids) OR r.branch_ids = '{}'::jsonb)" : ""}
        ),
        vault_alerts AS (
          SELECT 
            a.severity,
            a.status,
            a.created_at,
            a.branch_id
          FROM alerts a
          WHERE a.tenant_id = $1
            AND a.created_at >= $3
            AND (a.alert_type ~* 'vault|locker|occupancy|after.hours' OR a.zone_type IN ('LOCKER', 'STRONG_ROOM'))
            ${query.branchId ? "AND a.branch_id = $2" : ""}
        )
        SELECT 
          COUNT(DISTINCT vz.id) as total_vault_zones,
          COUNT(DISTINCT vr.id) as active_vault_rules,
          COUNT(DISTINCT vr.entity_key) FILTER (WHERE vr.current_status = 'ACTIVE_ALERTING') as zones_in_alert,
          COUNT(*) FILTER (WHERE va.severity = 'CRITICAL' AND va.status = 'open') as critical_vault_alerts,
          COUNT(*) FILTER (WHERE va.created_at >= NOW() - INTERVAL '1 hour') as vault_alerts_last_hour,
          MAX(vr.last_triggered_at) as last_vault_trigger
        FROM vault_zones vz
        LEFT JOIN vault_rules vr ON vr.zone_id = vz.id
        LEFT JOIN vault_alerts va ON va.branch_id = vz.branch_id
      `;
      const vaultParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      
      const vaultResult = await pool.query(vaultQuery, vaultParams);

      // Get queue and customer service analytics
      const queueQuery = `
        WITH queue_alerts AS (
          SELECT 
            a.camera_id,
            a.severity,
            a.status,
            a.created_at,
            a.metadata
          FROM alerts a
          WHERE a.tenant_id = $1
            AND a.created_at >= $2
            AND a.alert_type IN ('queue_length', 'queue_wait_time', 'crowd_density')
            ${query.branchId ? "AND a.branch_id = $3" : ""}
        ),
        queue_rules AS (
          SELECT 
            r.id,
            r.condition,
            s.current_metrics
          FROM nbfc_analytics_rules r
          LEFT JOIN nbfc_rule_state s ON s.rule_id = r.id
          WHERE r.tenant_id = $1
            AND r.enabled = true
            AND r.detector_type IN ('queue', 'crowd-density')
            AND s.last_evaluated_at >= NOW() - INTERVAL '5 minutes'
            ${query.branchId ? "AND ($3 = ANY(r.branch_ids) OR r.branch_ids = '{}'::jsonb)" : ""}
        )
        SELECT 
          COUNT(DISTINCT qa.camera_id) as cameras_with_queues,
          COUNT(*) FILTER (WHERE qa.severity IN ('HIGH', 'CRITICAL')) as queue_sla_breaches,
          COUNT(*) FILTER (WHERE qa.status = 'open') as active_queue_alerts,
          AVG(CAST(qa.metadata->>'queue_length' AS INTEGER)) FILTER (WHERE qa.metadata->>'queue_length' IS NOT NULL) as avg_queue_length,
          AVG(CAST(qa.metadata->>'wait_time_seconds' AS INTEGER)) FILTER (WHERE qa.metadata->>'wait_time_seconds' IS NOT NULL) as avg_wait_seconds,
          MAX(CAST(qa.metadata->>'queue_length' AS INTEGER)) FILTER (WHERE qa.metadata->>'queue_length' IS NOT NULL) as peak_queue_length
        FROM queue_alerts qa
      `;
      const queueParams = query.branchId 
        ? [user.tenantId, startDate, query.branchId]
        : [user.tenantId, startDate];
      
      const queueResult = await pool.query(queueQuery, queueParams);

      // Get ATM area analytics
      const atmQuery = `
        WITH atm_cameras AS (
          SELECT 
            c.id,
            c.name,
            c.branch_id,
            c.status
          FROM cameras c
          WHERE c.tenant_id = $1
            AND c.name ~* 'atm|kiosk'
            ${query.branchId ? "AND c.branch_id = $2" : ""}
        ),
        atm_alerts AS (
          SELECT 
            a.camera_id,
            a.severity,
            a.status,
            a.alert_type,
            a.created_at
          FROM alerts a
          WHERE a.tenant_id = $1
            AND a.created_at >= $3
            AND (a.alert_type ~* 'atm|tamper|loiter' OR a.zone_type = 'ATM_AREA')
            ${query.branchId ? "AND a.branch_id = $2" : ""}
        )
        SELECT 
          COUNT(DISTINCT ac.id) as total_atm_cameras,
          COUNT(DISTINCT ac.id) FILTER (WHERE ac.status = 'online') as online_atm_cameras,
          COUNT(*) FILTER (WHERE aa.severity = 'CRITICAL' AND aa.status = 'open') as critical_atm_alerts,
          COUNT(*) FILTER (WHERE aa.alert_type ~* 'tamper') as tampering_incidents,
          COUNT(*) FILTER (WHERE aa.alert_type ~* 'loiter') as loitering_incidents
        FROM atm_cameras ac
        LEFT JOIN atm_alerts aa ON aa.camera_id = ac.id
      `;
      const atmParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      
      const atmResult = await pool.query(atmQuery, atmParams);

      // Get overall branch security posture
      const postureQuery = `
        WITH branch_cameras AS (
          SELECT 
            branch_id,
            COUNT(*) as total_cameras,
            COUNT(*) FILTER (WHERE status = 'online') as online_cameras,
            COUNT(*) FILTER (WHERE status = 'offline') as offline_cameras
          FROM cameras
          WHERE tenant_id = $1
            ${query.branchId ? "AND branch_id = $2" : ""}
          GROUP BY branch_id
        ),
        branch_alerts AS (
          SELECT 
            branch_id,
            COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status = 'open') as critical_open,
            COUNT(*) FILTER (WHERE severity = 'HIGH' AND status = 'open') as high_open,
            COUNT(*) FILTER (WHERE created_at >= $3) as total_in_period
          FROM alerts
          WHERE tenant_id = $1
            ${query.branchId ? "AND branch_id = $2" : ""}
          GROUP BY branch_id
        )
        SELECT 
          COALESCE(SUM(bc.total_cameras), 0) as total_cameras,
          COALESCE(SUM(bc.online_cameras), 0) as online_cameras,
          COALESCE(SUM(bc.offline_cameras), 0) as offline_cameras,
          COALESCE(SUM(ba.critical_open), 0) as critical_alerts,
          COALESCE(SUM(ba.high_open), 0) as high_alerts,
          COALESCE(SUM(ba.total_in_period), 0) as total_alerts_period,
          ROUND(AVG(CASE WHEN bc.total_cameras > 0 THEN (bc.online_cameras::float / bc.total_cameras * 100) ELSE 0 END), 1) as avg_camera_availability
        FROM branch_cameras bc
        LEFT JOIN branch_alerts ba ON ba.branch_id = bc.branch_id
      `;
      const postureParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      
      const postureResult = await pool.query(postureQuery, postureParams);

      const cashCounter = cashCounterResult.rows[0] || {};
      const vault = vaultResult.rows[0] || {};
      const queue = queueResult.rows[0] || {};
      const atm = atmResult.rows[0] || {};
      const posture = postureResult.rows[0] || {};

      return reply.send({
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        branchId: query.branchId || null,
        
        cashCounterAnalytics: {
          activeCounters: parseInt(cashCounter.active_counters) || 0,
          countersWithAlerts: parseInt(cashCounter.counters_with_alerts) || 0,
          criticalAlertsToday: parseInt(cashCounter.critical_alerts_today) || 0,
          alertsLastHour: parseInt(cashCounter.alerts_last_hour) || 0,
        },

        vaultSecurity: {
          totalVaultZones: parseInt(vault.total_vault_zones) || 0,
          activeVaultRules: parseInt(vault.active_vault_rules) || 0,
          zonesInAlert: parseInt(vault.zones_in_alert) || 0,
          criticalVaultAlerts: parseInt(vault.critical_vault_alerts) || 0,
          vaultAlertsLastHour: parseInt(vault.vault_alerts_last_hour) || 0,
          lastVaultTrigger: vault.last_vault_trigger || null,
        },

        queueAnalytics: {
          camerasWithQueues: parseInt(queue.cameras_with_queues) || 0,
          queueSlaBreaches: parseInt(queue.queue_sla_breaches) || 0,
          activeQueueAlerts: parseInt(queue.active_queue_alerts) || 0,
          avgQueueLength: parseFloat(queue.avg_queue_length) || 0,
          avgWaitSeconds: parseFloat(queue.avg_wait_seconds) || 0,
          peakQueueLength: parseInt(queue.peak_queue_length) || 0,
        },

        atmAnalytics: {
          totalAtmCameras: parseInt(atm.total_atm_cameras) || 0,
          onlineAtmCameras: parseInt(atm.online_atm_cameras) || 0,
          criticalAtmAlerts: parseInt(atm.critical_atm_alerts) || 0,
          tamperingIncidents: parseInt(atm.tampering_incidents) || 0,
          loiteringIncidents: parseInt(atm.loitering_incidents) || 0,
        },

        securityPosture: {
          totalCameras: parseInt(posture.total_cameras) || 0,
          onlineCameras: parseInt(posture.online_cameras) || 0,
          offlineCameras: parseInt(posture.offline_cameras) || 0,
          criticalAlerts: parseInt(posture.critical_alerts) || 0,
          highAlerts: parseInt(posture.high_alerts) || 0,
          totalAlertsInPeriod: parseInt(posture.total_alerts_period) || 0,
          avgCameraAvailability: parseFloat(posture.avg_camera_availability) || 0,
        },

        activeRules: rulesResult.rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          detectorType: row.detector_type,
          state: row.state,
          severity: row.severity,
          actions: row.actions,
          activeAlerts: parseInt(row.active_alerts) || 0,
          triggersInPeriod: parseInt(row.triggers_in_period) || 0,
        })),

        generatedAt: new Date().toISOString(),
      });

    } catch (error: any) {
      app.log.error({ error, tenantId: request.currentUser?.tenantId }, "Failed to get banking analytics");
      return reply.code(500).send({
        error: "banking_analytics_error",
        message: error.message || "Failed to retrieve banking analytics",
      });
    }
  });

  // Get real-time cash counter status
  app.get("/api/banking/cash-counters/realtime", async (request: AuthenticatedRequest, reply) => {
    try {
      const user = requireAuth(request);
      const query = request.query as { branchId?: string };

      const countersQuery = `
        WITH counter_cameras AS (
          SELECT 
            c.id,
            c.name,
            c.branch_id,
            c.status,
            c.last_seen_at,
            b.name as branch_name
          FROM cameras c
          JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1
            AND c.name ~* 'counter|cash|teller'
            ${query.branchId ? "AND c.branch_id = $2" : ""}
        ),
        latest_metrics AS (
          SELECT 
            rule_id,
            entity_key,
            current_status,
            current_metrics,
            last_evaluated_at,
            last_triggered_at
          FROM nbfc_rule_state
          WHERE last_evaluated_at >= NOW() - INTERVAL '10 minutes'
        )
        SELECT 
          cc.*,
          lm.current_status,
          lm.current_metrics,
          lm.last_evaluated_at,
          lm.last_triggered_at
        FROM counter_cameras cc
        LEFT JOIN latest_metrics lm ON lm.entity_key = cc.id
        ORDER BY cc.branch_name, cc.name
      `;

      const params = query.branchId ? [user.tenantId, query.branchId] : [user.tenantId];
      const result = await pool.query(countersQuery, params);

      return reply.send({
        counters: result.rows.map((row: any) => ({
          cameraId: row.id,
          cameraName: row.name,
          branchId: row.branch_id,
          branchName: row.branch_name,
          status: row.status,
          lastSeenAt: row.last_seen_at,
          ruleStatus: row.current_status || 'IDLE',
          currentMetrics: row.current_metrics || {},
          lastEvaluatedAt: row.last_evaluated_at,
          lastTriggeredAt: row.last_triggered_at,
        })),
        totalCounters: result.rows.length,
        activeCounters: result.rows.filter((r: any) => r.status === 'online').length,
        generatedAt: new Date().toISOString(),
      });

    } catch (error: any) {
      app.log.error({ error }, "Failed to get real-time cash counter status");
      return reply.code(500).send({ error: "realtime_status_error", message: error.message });
    }
  });
}
