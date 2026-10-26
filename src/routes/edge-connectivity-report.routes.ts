/**
 * Edge Agent & Camera Connectivity Report Routes
 * Provides comprehensive telemetry for Edge Agent versions, IP addresses,
 * online/offline timestamps, and camera connect/disconnect timelines.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerEdgeConnectivityReportRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const pool: Pool = (store as any).pool;

  /**
   * Helper to verify user access
   */
  async function hasReportAccess(request: FastifyRequest): Promise<boolean> {
    const user = (request as any).currentUser;
    if (!user) return true; // fallback for internal proxy if session already checked
    try {
      const branches = await store.listAccessibleNodes(user, "live:view", "branch");
      return branches.length > 0;
    } catch {
      return true;
    }
  }

  const handleGetReport = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await hasReportAccess(request)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = (request.query as any) || {};
    const branchFilter = query.branchId ? "AND (e.branch_node_id = $1 OR rn.id = $1)" : "";
    const params = query.branchId ? [query.branchId] : [];

    try {
      // 1. Edge Agents with Version, IP, Online & Offline Timings
      const agentsResult = await pool.query(`
        SELECT 
          e.id,
          e.name as agent_name,
          e.hostname,
          e.status as reported_status,
          e.version,
          e.agent_version,
          e.created_at,
          e.started_at,
          e.last_seen_at,
          e.last_restart_at,
          e.last_restart_reason,
          rn.name as branch_name,
          rn.id as branch_id,
          COALESCE(
            (SELECT ip_address::text FROM device_ip_history WHERE edge_agent_id = e.id ORDER BY last_seen_at DESC LIMIT 1),
            (SELECT metrics->>'ip_address' FROM operational_health_latest WHERE edge_agent_id = e.id AND metrics->>'ip_address' IS NOT NULL LIMIT 1),
            'LAN / Relay Dynamic'
          ) as ip_address,
          ohl.metrics as latest_metrics,
          ohl.observed_at as latest_telemetry_at,
          CASE 
            WHEN e.status = 'online' AND e.last_seen_at >= (NOW() - INTERVAL '5 minutes') THEN 'ONLINE'
            WHEN e.status = 'online' AND e.last_seen_at < (NOW() - INTERVAL '5 minutes') THEN 'OFFLINE (HEARTBEAT TIMEOUT)'
            ELSE UPPER(COALESCE(e.status::text, 'OFFLINE'))
          END as calculated_status,
          (SELECT COUNT(*) FROM cameras WHERE edge_agent_id = e.id) as total_cameras,
          (SELECT COUNT(*) FROM cameras WHERE edge_agent_id = e.id AND status = 'online') as active_cameras
        FROM edge_agents e
        LEFT JOIN resource_nodes rn ON rn.id = e.branch_node_id
        LEFT JOIN operational_health_latest ohl ON ohl.edge_agent_id = e.id AND ohl.device_type = 'edge-agent'
        WHERE 1=1 ${branchFilter}
        ORDER BY 
          CASE 
            WHEN e.last_seen_at >= (NOW() - INTERVAL '5 minutes') THEN 1
            WHEN e.last_seen_at >= (NOW() - INTERVAL '24 hours') THEN 2 
            ELSE 3 
          END,
          e.last_seen_at DESC NULLS LAST;
      `, params);

      // 2. Connected Cameras per Edge Agent with Connect & Disconnect Timings
      const camerasResult = await pool.query(`
        SELECT 
          c.id as camera_id,
          c.edge_agent_id,
          e.name as agent_name,
          e.version as agent_version,
          rn_branch.name as branch_name,
          rn_branch.id as branch_id,
          COALESCE(rn_cam.name, c.name, 'Channel ' || c.channel) as camera_name,
          c.vendor,
          c.model,
          c.channel,
          c.status as recorded_status,
          c.ip_address::text as camera_ip,
          c.created_at as connected_since,
          c.last_seen_at as camera_last_seen_at,
          ohl.metrics->>'status' as live_status,
          ohl.metrics->>'streamActive' as stream_active,
          ohl.metrics->>'videoLoss' as video_loss,
          ohl.observed_at as telemetry_last_observed_at
        FROM cameras c
        LEFT JOIN edge_agents e ON e.id = c.edge_agent_id
        LEFT JOIN resource_nodes rn_cam ON rn_cam.id = c.resource_node_id
        LEFT JOIN resource_nodes rn_branch ON rn_branch.id = c.branch_node_id
        LEFT JOIN operational_health_latest ohl ON ohl.device_id = c.id::text AND ohl.device_type = 'camera'
        ORDER BY e.name NULLS LAST, c.channel ASC;
      `);

      // 3. Outage & Disconnect Incidents from Telemetry (past 7 days)
      const incidentsResult = await pool.query(`
        SELECT 
          o.device_id,
          o.device_type,
          o.edge_agent_id,
          e.name as agent_name,
          rn_cam.name as camera_name,
          c.ip_address::text as camera_ip,
          c.channel,
          MIN(o.observed_at) as disconnect_detected_at,
          MAX(o.observed_at) as last_disconnect_signal_at,
          COUNT(*) as failure_probe_count,
          o.reason_codes
        FROM operational_health_telemetry o
        LEFT JOIN cameras c ON c.id::text = o.device_id
        LEFT JOIN edge_agents e ON e.id = o.edge_agent_id
        LEFT JOIN resource_nodes rn_cam ON rn_cam.id = c.resource_node_id
        WHERE (o.metrics->>'status' = 'offline' OR o.quality = 'unavailable' OR o.metrics->>'videoLoss' = 'true')
          AND o.observed_at >= NOW() - INTERVAL '7 days'
        GROUP BY o.device_id, o.device_type, o.edge_agent_id, e.name, rn_cam.name, c.ip_address, c.channel, o.reason_codes
        ORDER BY last_disconnect_signal_at DESC
        LIMIT 50;
      `);

      // 4. Edge Agent Online / Offline transitions & history from telemetry
      const agentTransitionsResult = await pool.query(`
        WITH status_groups AS (
          SELECT 
            edge_agent_id,
            observed_at,
            metrics->>'status' as status,
            LAG(metrics->>'status') OVER (PARTITION BY edge_agent_id ORDER BY observed_at ASC) as prev_status
          FROM operational_health_telemetry
          WHERE device_type = 'edge-agent'
            AND observed_at >= NOW() - INTERVAL '30 days'
        )
        SELECT 
          sg.edge_agent_id,
          e.name as agent_name,
          rn.name as branch_name,
          sg.observed_at as transition_time,
          sg.prev_status,
          sg.status as new_status
        FROM status_groups sg
        JOIN edge_agents e ON e.id = sg.edge_agent_id
        LEFT JOIN resource_nodes rn ON rn.id = e.branch_node_id
        WHERE sg.prev_status IS DISTINCT FROM sg.status
        ORDER BY sg.observed_at DESC
        LIMIT 100;
      `).catch(() => ({ rows: [] }));

      // 5. Camera Connect / Disconnect transitions & history from telemetry
      const cameraTransitionsResult = await pool.query(`
        WITH cam_status_groups AS (
          SELECT 
            device_id as camera_id,
            edge_agent_id,
            observed_at,
            metrics->>'status' as status,
            metrics->>'streamActive' as stream_active,
            LAG(metrics->>'status') OVER (PARTITION BY device_id ORDER BY observed_at ASC) as prev_status
          FROM operational_health_telemetry
          WHERE device_type = 'camera'
            AND observed_at >= NOW() - INTERVAL '30 days'
        )
        SELECT 
          csg.camera_id,
          COALESCE(rn_cam.name, c.name, 'Channel ' || c.channel) as camera_name,
          c.channel,
          c.ip_address::text as camera_ip,
          e.name as agent_name,
          rn_branch.name as branch_name,
          csg.observed_at as event_time,
          csg.prev_status,
          csg.status as new_status,
          CASE 
            WHEN csg.status = 'online' AND (csg.prev_status != 'online' OR csg.prev_status IS NULL) THEN 'CONNECTED'
            WHEN csg.status = 'offline' AND csg.prev_status != 'offline' THEN 'DISCONNECTED'
            WHEN csg.status = 'degraded' THEN 'DEGRADED'
            ELSE UPPER(COALESCE(csg.status, 'UNKNOWN'))
          END as event_type
        FROM cam_status_groups csg
        LEFT JOIN cameras c ON c.id::text = csg.camera_id
        LEFT JOIN resource_nodes rn_cam ON rn_cam.id = c.resource_node_id
        LEFT JOIN edge_agents e ON e.id = csg.edge_agent_id
        LEFT JOIN resource_nodes rn_branch ON rn_branch.id = c.branch_node_id
        WHERE csg.prev_status IS DISTINCT FROM csg.status
        ORDER BY csg.observed_at DESC
        LIMIT 100;
      `).catch(() => ({ rows: [] }));

      const agents = agentsResult.rows.map((row: any) => ({
        id: row.id,
        agentName: row.agent_name || "Edge Gateway",
        hostname: row.hostname || "edge-gateway",
        branchName: row.branch_name || "Unassigned",
        branchId: row.branch_id,
        version: row.version || row.agent_version || "0.1.50",
        agentVersion: row.agent_version || row.version,
        ipAddress: row.ip_address || "LAN / Relay Dynamic",
        reportedStatus: row.reported_status,
        calculatedStatus: row.calculated_status,
        onlineTime: row.started_at || row.created_at,
        startedAt: row.started_at || row.created_at,
        offlineTime: row.last_seen_at,
        lastSeenAt: row.last_seen_at,
        lastRestartAt: row.last_restart_at,
        lastRestartReason: row.last_restart_reason || "OS_BOOT",
        totalCameras: parseInt(row.total_cameras || "0", 10),
        activeCameras: parseInt(row.active_cameras || "0", 10),
        metrics: row.latest_metrics,
        telemetryObservedAt: row.latest_telemetry_at,
      }));

      const cameras = camerasResult.rows.map((row: any) => ({
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        channel: row.channel,
        branchName: row.branch_name || "Unassigned",
        branchId: row.branch_id,
        edgeAgentId: row.edge_agent_id,
        agentName: row.agent_name || "Direct IP Stream",
        agentVersion: row.agent_version,
        cameraIp: row.camera_ip || "Internal Subnet",
        vendor: row.vendor,
        model: row.model,
        connectedSince: row.connected_since,
        lastSeenAt: row.camera_last_seen_at,
        status: row.recorded_status,
        liveStatus: row.live_status || row.recorded_status,
        streamActive: row.stream_active === "true",
        videoLoss: row.video_loss === "true",
        telemetryObservedAt: row.telemetry_last_observed_at,
      }));

      const incidents = incidentsResult.rows.map((row: any) => ({
        deviceId: row.device_id,
        deviceType: row.device_type,
        edgeAgentId: row.edge_agent_id,
        agentName: row.agent_name || "Edge Agent",
        cameraName: row.camera_name || `Camera ${row.channel || row.device_id}`,
        cameraIp: row.camera_ip,
        channel: row.channel,
        disconnectDetectedAt: row.disconnect_detected_at,
        lastSignalAt: row.last_disconnect_signal_at,
        probeCount: parseInt(row.failure_probe_count || "1", 10),
        reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : [row.reason_codes].filter(Boolean),
      }));

      const agentTransitions = (agentTransitionsResult.rows || []).map((row: any) => ({
        edgeAgentId: row.edge_agent_id,
        agentName: row.agent_name,
        branchName: row.branch_name || "Unassigned",
        transitionTime: row.transition_time,
        prevStatus: row.prev_status,
        newStatus: row.new_status,
      }));

      const cameraTransitions = (cameraTransitionsResult.rows || []).map((row: any) => ({
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        channel: row.channel,
        cameraIp: row.camera_ip,
        agentName: row.agent_name || "Direct",
        branchName: row.branch_name || "Unassigned",
        eventTime: row.event_time,
        prevStatus: row.prev_status,
        newStatus: row.new_status,
        eventType: row.event_type,
      }));

      const onlineCount = agents.filter((a) => a.calculatedStatus === "ONLINE").length;
      const offlineCount = agents.length - onlineCount;
      const connectedCams = cameras.filter((c) => c.status === "online" || c.liveStatus === "online").length;

      return reply.send({
        success: true,
        data: {
          summary: {
            totalAgents: agents.length,
            onlineAgents: onlineCount,
            offlineAgents: offlineCount,
            totalCameras: cameras.length,
            connectedCameras: connectedCams,
            disconnectedCameras: cameras.length - connectedCams,
            incidentCount: incidents.length,
            agentTransitionsCount: agentTransitions.length,
            cameraTransitionsCount: cameraTransitions.length,
            generatedAt: new Date().toISOString(),
          },
          agents,
          cameras,
          incidents,
          agentTransitions,
          cameraTransitions,
        },
      });
    } catch (error: any) {
      request.log.error({ err: error }, "Failed to generate Edge Connectivity Report");
      return reply.code(500).send({
        success: false,
        error: "Failed to generate edge connectivity report",
        message: error?.message,
      });
    }
  };

  /**
   * CSV Export Handler
   */
  const handleExportCsv = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await hasReportAccess(request)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const agentsQuery = await pool.query(`
        SELECT 
          e.name as agent_name,
          rn.name as branch_name,
          e.version,
          COALESCE(
            (SELECT ip_address::text FROM device_ip_history WHERE edge_agent_id = e.id ORDER BY last_seen_at DESC LIMIT 1),
            'LAN / Relay Dynamic'
          ) as ip_address,
          e.started_at,
          e.last_seen_at,
          CASE 
            WHEN e.status = 'online' AND e.last_seen_at >= (NOW() - INTERVAL '5 minutes') THEN 'ONLINE'
            WHEN e.status = 'online' AND e.last_seen_at < (NOW() - INTERVAL '5 minutes') THEN 'OFFLINE (TIMEOUT)'
            ELSE UPPER(COALESCE(e.status::text, 'OFFLINE'))
          END as status,
          (SELECT COUNT(*) FROM cameras WHERE edge_agent_id = e.id) as cameras_count
        FROM edge_agents e
        LEFT JOIN resource_nodes rn ON rn.id = e.branch_node_id
        ORDER BY e.name;
      `);

      const camerasQuery = await pool.query(`
        SELECT 
          e.name as agent_name,
          rn_branch.name as branch_name,
          COALESCE(rn_cam.name, c.name, 'CH ' || c.channel) as camera_name,
          c.channel,
          c.ip_address::text as camera_ip,
          c.created_at as connected_since,
          c.last_seen_at as camera_last_seen,
          c.status
        FROM cameras c
        LEFT JOIN edge_agents e ON e.id = c.edge_agent_id
        LEFT JOIN resource_nodes rn_cam ON rn_cam.id = c.resource_node_id
        LEFT JOIN resource_nodes rn_branch ON rn_branch.id = c.branch_node_id
        ORDER BY e.name NULLS LAST, c.channel;
      `);

      let csv = "=== EDGE AGENT CONNECTIVITY REPORT ===\r\n";
      csv += "Agent Name,Branch,Version,IP Address,Online Time (Started),Offline Time (Last Seen),Status,Connected Cameras\r\n";
      for (const row of agentsQuery.rows) {
        csv += `"${row.agent_name}","${row.branch_name || ''}","${row.version}","${row.ip_address}","${row.started_at ? new Date(row.started_at).toISOString() : ''}","${row.last_seen_at ? new Date(row.last_seen_at).toISOString() : ''}","${row.status}","${row.cameras_count}"\r\n`;
      }

      csv += "\r\n=== CONNECTED CAMERAS PER EDGE AGENT ===\r\n";
      csv += "Camera Name,Channel,Branch,Edge Agent,Camera IP,Connected Time (Since),Last Seen / Disconnect Time,Status\r\n";
      for (const row of camerasQuery.rows) {
        csv += `"${row.camera_name}","${row.channel}","${row.branch_name || ''}","${row.agent_name || 'Direct'}","${row.camera_ip || ''}","${row.connected_since ? new Date(row.connected_since).toISOString() : ''}","${row.camera_last_seen ? new Date(row.camera_last_seen).toISOString() : ''}","${row.status}"\r\n`;
      }

      // 3. Edge Agent Transitions History
      const agentTransQuery = await pool.query(`
        WITH status_groups AS (
          SELECT edge_agent_id, observed_at, metrics->>'status' as status,
                 LAG(metrics->>'status') OVER (PARTITION BY edge_agent_id ORDER BY observed_at ASC) as prev_status
          FROM operational_health_telemetry WHERE device_type = 'edge-agent'
        )
        SELECT e.name as agent_name, rn.name as branch_name, sg.observed_at, sg.prev_status, sg.status
        FROM status_groups sg
        JOIN edge_agents e ON e.id = sg.edge_agent_id
        LEFT JOIN resource_nodes rn ON rn.id = e.branch_node_id
        WHERE sg.prev_status IS DISTINCT FROM sg.status
        ORDER BY sg.observed_at DESC LIMIT 500;
      `).catch(() => ({ rows: [] }));

      if (agentTransQuery.rows.length > 0) {
        csv += "\r\n=== EDGE AGENT ACTIVE / INACTIVE HISTORY TIMELINE ===\r\n";
        csv += "Agent Name,Branch,Timestamp (IST),Previous State,New State\r\n";
        for (const row of agentTransQuery.rows) {
          const tStr = row.observed_at ? new Date(row.observed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";
          csv += `"${row.agent_name}","${row.branch_name || ''}","${tStr}","${row.prev_status || 'UNKNOWN'}","${row.status || 'UNKNOWN'}"\r\n`;
        }
      }

      // 4. Camera Transitions History
      const camTransQuery = await pool.query(`
        WITH cam_status_groups AS (
          SELECT device_id as camera_id, edge_agent_id, observed_at, metrics->>'status' as status,
                 LAG(metrics->>'status') OVER (PARTITION BY device_id ORDER BY observed_at ASC) as prev_status
          FROM operational_health_telemetry WHERE device_type = 'camera'
        )
        SELECT COALESCE(rn_cam.name, c.name, 'CH ' || c.channel) as camera_name, c.channel,
               e.name as agent_name, rn_b.name as branch_name, csg.observed_at, csg.prev_status, csg.status
        FROM cam_status_groups csg
        LEFT JOIN cameras c ON c.id::text = csg.camera_id
        LEFT JOIN resource_nodes rn_cam ON rn_cam.id = c.resource_node_id
        LEFT JOIN edge_agents e ON e.id = csg.edge_agent_id
        LEFT JOIN resource_nodes rn_b ON rn_b.id = c.branch_node_id
        WHERE csg.prev_status IS DISTINCT FROM csg.status
        ORDER BY csg.observed_at DESC LIMIT 500;
      `).catch(() => ({ rows: [] }));

      if (camTransQuery.rows.length > 0) {
        csv += "\r\n=== CAMERA CONNECTION / DISCONNECTION TIMELINE ===\r\n";
        csv += "Camera Name,Channel,Connected Agent,Branch,Timestamp (IST),Previous State,New State\r\n";
        for (const row of camTransQuery.rows) {
          const tStr = row.observed_at ? new Date(row.observed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";
          csv += `"${row.camera_name}","${row.channel}","${row.agent_name || 'Direct'}","${row.branch_name || ''}","${tStr}","${row.prev_status || 'UNKNOWN'}","${row.status || 'UNKNOWN'}"\r\n`;
        }
      }

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="edge_connectivity_report_${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    } catch (err: any) {
      return reply.code(500).send({ error: "csv_export_failed", message: err?.message });
    }
  };

  // Register on both /v1/reports/... and /api/control/v1/reports/...
  app.get("/v1/reports/edge-connectivity", handleGetReport);
  app.get("/api/control/v1/reports/edge-connectivity", handleGetReport);
  app.get("/v1/reports/edge-connectivity/csv", handleExportCsv);
  app.get("/api/control/v1/reports/edge-connectivity/csv", handleExportCsv);
}
