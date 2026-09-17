import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

export interface AnprLogisticsRouteOptions {
  pool: Pool;
}

const sessionSchema = z.object({
  branchId: z.string().uuid(),
  vehiclePlate: z.string().min(1).max(50),
  vehicleType: z.enum(["cash_van", "armored", "service", "unknown"]).default("cash_van"),
  scheduledArrival: z.string().datetime({ offset: true }),
  authorized: z.boolean().default(false),
  provider: z.string().max(200).optional(),
});

const detectionSchema = z.object({
  sessionId: z.string().uuid(),
  cameraId: z.string().uuid(),
  cameraName: z.string().max(200),
  location: z.string().max(200),
  confidence: z.number().min(0).max(1),
  snapshotPath: z.string().optional(),
});

const violationSchema = z.object({
  sessionId: z.string().uuid(),
  violationCode: z.string().max(100),
  violationName: z.string().max(200).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  message: z.string(),
});

export async function registerAnprLogisticsRoutes(
  app: FastifyInstance,
  options: AnprLogisticsRouteOptions
) {
  const { pool } = options;

  function getUser(request: FastifyRequest) {
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) throw new Error("authenticated_user_required");
    return { tenantId: user.tenantId, userId: user.id, role: user.role };
  }

  // ============================================================================
  // Sessions API
  // ============================================================================

  // List ANPR sessions
  app.get("/v1/logistics/anpr-sessions", async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = z.object({
      branchId: z.string().uuid().optional(),
      status: z.string().optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    let sql = `
      SELECT 
        s.*,
        (SELECT json_agg(json_build_object(
          'cameraId', d.camera_id,
          'cameraName', d.camera_name,
          'location', d.location,
          'timestamp', d.detected_at,
          'confidence', d.confidence
        ) ORDER BY d.detected_at DESC)
        FROM anpr_detection_points d WHERE d.session_id = s.id
        ) as detection_points,
        (SELECT json_agg(json_build_object(
          'code', v.violation_code,
          'name', v.violation_name,
          'severity', v.severity,
          'message', v.message,
          'timestamp', v.detected_at
        ))
        FROM anpr_logistics_violations v 
        WHERE v.session_id = s.id AND v.resolved = false
        ) as violations
      FROM anpr_logistics_sessions s
      WHERE s.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (query.branchId) {
      sql += ` AND s.branch_id = $${paramIndex++}`;
      params.push(query.branchId);
    }

    if (query.status) {
      sql += ` AND s.status = $${paramIndex++}`;
      params.push(query.status);
    }

    if (query.from) {
      sql += ` AND s.scheduled_arrival >= $${paramIndex++}`;
      params.push(query.from);
    }

    if (query.to) {
      sql += ` AND s.scheduled_arrival <= $${paramIndex++}`;
      params.push(query.to);
    }

    sql += ` ORDER BY s.scheduled_arrival DESC LIMIT $${paramIndex}`;
    params.push(query.limit);

    const result = await pool.query(sql, params);

    // Calculate summary
    const summary = {
      activeSessions: result.rows.filter(r => ["on_route", "overdue"].includes(r.status)).length,
      completedSessions: result.rows.filter(r => r.status === "departed").length,
      compliantSessions: result.rows.filter(r => r.route_compliance === "compliant").length,
      suspiciousSessions: result.rows.filter(r => r.route_compliance === "route_deviation").length,
      nonCompliantSessions: result.rows.filter(r => r.route_compliance === "unauthorized_stop").length,
      totalViolations: result.rows.reduce((sum, r) => sum + (r.violations?.length || 0), 0),
      criticalViolations: result.rows.reduce((sum, r) => 
        sum + (r.violations?.filter((v: any) => v.severity === "critical").length || 0), 0),
      highViolations: result.rows.reduce((sum, r) => 
        sum + (r.violations?.filter((v: any) => v.severity === "high").length || 0), 0),
    };

    return reply.send({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        sessionId: row.id,
        vehiclePlate: row.vehicle_plate,
        vehicleType: row.vehicle_type,
        branchId: row.branch_id,
        branchName: row.branch_name || "Unknown Branch",
        status: row.status,
        routeCompliance: row.route_compliance,
        scheduledArrival: row.scheduled_arrival,
        actualArrival: row.actual_arrival,
        departureTime: row.departure_time,
        dwellTimeMinutes: row.dwell_time_minutes,
        authorized: row.authorized,
        provider: row.provider,
        confidence: parseFloat(row.confidence || 0),
        detectionPoints: row.detection_points || [],
        violations: row.violations || [],
        evidenceAvailable: row.actual_arrival ? ["arrival_snapshot", "departure_snapshot"] : [],
      })),
      count: result.rows.length,
      summary,
    });
  });

  // Get session summary
  app.get("/v1/logistics/anpr-sessions/summary", async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = z.object({
      branchId: z.string().uuid().optional(),
    }).parse(request.query);

    let sql = `
      SELECT 
        COUNT(*) as total_vehicles,
        COUNT(*) FILTER (WHERE status IN ('on_route', 'overdue')) as on_route,
        COUNT(*) FILTER (WHERE status = 'arrived') as arrived,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
        COUNT(*) FILTER (WHERE route_compliance = 'compliant') as compliant_routes,
        COUNT(*) FILTER (WHERE route_compliance = 'route_deviation') as route_deviations,
        COUNT(*) FILTER (WHERE route_compliance = 'unauthorized_stop') as unauthorized_stops,
        AVG(dwell_time_minutes) FILTER (WHERE dwell_time_minutes IS NOT NULL) as avg_dwell_time
      FROM anpr_logistics_sessions
      WHERE tenant_id = $1
        AND scheduled_arrival > NOW() - INTERVAL '24 hours'
    `;
    const params: any[] = [tenantId];

    if (query.branchId) {
      sql += ` AND branch_id = $2`;
      params.push(query.branchId);
    }

    const result = await pool.query(sql, params);
    const row = result.rows[0];

    return reply.send({
      success: true,
      data: {
        totalVehicles: parseInt(row.total_vehicles || 0),
        onRoute: parseInt(row.on_route || 0),
        arrived: parseInt(row.arrived || 0),
        overdue: parseInt(row.overdue || 0),
        compliantRoutes: parseInt(row.compliant_routes || 0),
        routeDeviations: parseInt(row.route_deviations || 0),
        unauthorizedStops: parseInt(row.unauthorized_stops || 0),
        avgDwellTimeMinutes: parseFloat(row.avg_dwell_time || 0),
      },
    });
  });

  // Create session
  app.post("/v1/logistics/anpr-sessions", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const body = sessionSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO anpr_logistics_sessions (
        tenant_id, branch_id, vehicle_plate, vehicle_type, 
        scheduled_arrival, authorized, provider
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tenantId,
        body.branchId,
        body.vehiclePlate,
        body.vehicleType,
        body.scheduledArrival,
        body.authorized,
        body.provider,
      ]
    );

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // Update session status
  app.patch("/v1/logistics/anpr-sessions/:id", async (request, reply) => {
    const { tenantId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      status: z.enum(["on_route", "arrived", "departed", "overdue", "unknown"]).optional(),
      routeCompliance: z.enum(["compliant", "delayed", "route_deviation", "unauthorized_stop"]).optional(),
      actualArrival: z.string().datetime({ offset: true }).optional(),
      departureTime: z.string().datetime({ offset: true }).optional(),
    }).parse(request.body);

    // Calculate dwell time if both arrival and departure are present
    let dwellTime = null;
    if (body.actualArrival && body.departureTime) {
      const arrival = new Date(body.actualArrival);
      const departure = new Date(body.departureTime);
      dwellTime = Math.round((departure.getTime() - arrival.getTime()) / 60000); // minutes
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
    }
    if (body.routeCompliance) {
      updates.push(`route_compliance = $${paramIndex++}`);
      values.push(body.routeCompliance);
    }
    if (body.actualArrival) {
      updates.push(`actual_arrival = $${paramIndex++}`);
      values.push(body.actualArrival);
    }
    if (body.departureTime) {
      updates.push(`departure_time = $${paramIndex++}`);
      values.push(body.departureTime);
    }
    if (dwellTime !== null) {
      updates.push(`dwell_time_minutes = $${paramIndex++}`);
      values.push(dwellTime);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "no_updates_provided" });
    }

    values.push(tenantId, params.id);
    const result = await pool.query(
      `UPDATE anpr_logistics_sessions 
       SET ${updates.join(", ")}
       WHERE tenant_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    return reply.send({
      success: true,
      data: result.rows[0],
    });
  });

  // ============================================================================
  // Detection Points API
  // ============================================================================

  // Add detection point
  app.post("/v1/logistics/anpr-detections", async (request, reply) => {
    const { tenantId } = getUser(request);
    const body = detectionSchema.parse(request.body);

    // Verify session belongs to tenant
    const sessionCheck = await pool.query(
      `SELECT id FROM anpr_logistics_sessions WHERE id = $1 AND tenant_id = $2`,
      [body.sessionId, tenantId]
    );

    if (sessionCheck.rows.length === 0) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const result = await pool.query(
      `INSERT INTO anpr_detection_points (
        session_id, camera_id, camera_name, location, confidence, snapshot_path
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        body.sessionId,
        body.cameraId,
        body.cameraName,
        body.location,
        body.confidence,
        body.snapshotPath,
      ]
    );

    // Auto-update session confidence to highest detection
    await pool.query(
      `UPDATE anpr_logistics_sessions 
       SET confidence = GREATEST(confidence, $1)
       WHERE id = $2`,
      [body.confidence, body.sessionId]
    );

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // ============================================================================
  // Violations API
  // ============================================================================

  // Report violation
  app.post("/v1/logistics/anpr-violations", async (request, reply) => {
    const { tenantId } = getUser(request);
    const body = violationSchema.parse(request.body);

    // Verify session belongs to tenant
    const sessionCheck = await pool.query(
      `SELECT id, route_compliance FROM anpr_logistics_sessions WHERE id = $1 AND tenant_id = $2`,
      [body.sessionId, tenantId]
    );

    if (sessionCheck.rows.length === 0) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const result = await pool.query(
      `INSERT INTO anpr_logistics_violations (
        session_id, violation_code, violation_name, severity, message
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        body.sessionId,
        body.violationCode,
        body.violationName,
        body.severity,
        body.message,
      ]
    );

    // Auto-update session route compliance on violations
    if (sessionCheck.rows[0].route_compliance === "compliant") {
      let newCompliance = "delayed";
      if (body.violationCode.includes("ROUTE_DEVIATION")) {
        newCompliance = "route_deviation";
      } else if (body.violationCode.includes("UNAUTHORIZED_STOP")) {
        newCompliance = "unauthorized_stop";
      }

      await pool.query(
        `UPDATE anpr_logistics_sessions 
         SET route_compliance = $1
         WHERE id = $2`,
        [newCompliance, body.sessionId]
      );
    }

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // ============================================================================
  // Background Jobs (should be called by scheduler)
  // ============================================================================

  // Check for overdue sessions
  app.post("/v1/logistics/check-overdue", async (request, reply) => {
    const { tenantId } = getUser(request);

    const result = await pool.query(
      `UPDATE anpr_logistics_sessions 
       SET status = 'overdue',
           route_compliance = 'delayed'
       WHERE tenant_id = $1
         AND status = 'on_route'
         AND scheduled_arrival < NOW()
         AND scheduled_arrival > NOW() - INTERVAL '24 hours'
       RETURNING id, vehicle_plate, branch_id`,
      [tenantId]
    );

    // Create violations for overdue sessions
    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO anpr_logistics_violations (
          session_id, violation_code, violation_name, severity, message, detected_at
        ) VALUES ($1, 'SCHEDULE_DELAY', 'Schedule delay', 'high', 
                  'Vehicle is past scheduled arrival time', NOW())
        ON CONFLICT DO NOTHING`,
        [row.id]
      );
    }

    return reply.send({
      success: true,
      overdueCount: result.rows.length,
      sessions: result.rows,
    });
  });

  app.log.info("[AnprLogistics] Routes registered");
}
