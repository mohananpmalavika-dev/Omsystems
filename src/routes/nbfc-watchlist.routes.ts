import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

export interface NbfcWatchlistRouteOptions {
  pool: Pool;
}

const watchlistEntrySchema = z.object({
  personId: z.string().uuid().optional(),
  fullName: z.string().min(1).max(200),
  employeeCode: z.string().max(100).optional(),
  designation: z.string().max(200).optional(),
  watchlistType: z.enum(["authorized", "blacklist", "vip", "visitor"]),
  status: z.enum(["active", "expired", "suspended"]).default("active"),
  branchIds: z.array(z.string().uuid()).default([]),
  areaAccess: z.array(z.enum(["vault", "cash_counter", "atm", "locker", "branch_entry"])).default([]),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }).optional(),
  reason: z.string(),
  faceEnrolled: z.boolean().default(false),
  notes: z.string().optional(),
});

const detectionSchema = z.object({
  watchlistEntryId: z.string().uuid(),
  cameraId: z.string().uuid(),
  cameraName: z.string().max(200),
  branchId: z.string().uuid().optional(),
  branchName: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1),
  snapshotPath: z.string().optional(),
});

export async function registerNbfcWatchlistRoutes(
  app: FastifyInstance,
  options: NbfcWatchlistRouteOptions
) {
  const { pool } = options;

  function getUser(request: FastifyRequest) {
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) throw new Error("authenticated_user_required");
    return { tenantId: user.tenantId, userId: user.id, role: user.role };
  }

  // ============================================================================
  // Watchlist Entries API
  // ============================================================================

  // List watchlist entries
  app.get("/v1/watchlist/nbfc", async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = z.object({
      branchId: z.string().uuid().optional(),
      type: z.enum(["authorized", "blacklist", "vip", "visitor", "all"]).default("all"),
      status: z.enum(["active", "expired", "suspended", "all"]).default("active"),
      search: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(request.query);

    let sql = `
      SELECT 
        w.*,
        COUNT(DISTINCT d.id) as total_detections,
        COUNT(DISTINCT CASE WHEN d.detected_at > NOW() - INTERVAL '24 hours' THEN d.id END) as detections_24h,
        MAX(d.detected_at) as last_detected_at,
        (SELECT json_build_object(
          'timestamp', MAX(d2.detected_at),
          'cameraName', MAX(d2.camera_name),
          'branchName', MAX(d2.branch_name),
          'confidence', MAX(d2.confidence)
        )
        FROM nbfc_watchlist_detections d2
        WHERE d2.watchlist_entry_id = w.id
        GROUP BY d2.watchlist_entry_id
        ) as last_detection
      FROM nbfc_watchlist_entries w
      LEFT JOIN nbfc_watchlist_detections d ON w.id = d.watchlist_entry_id
      WHERE w.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (query.type !== "all") {
      sql += ` AND w.watchlist_type = $${paramIndex++}`;
      params.push(query.type);
    }

    if (query.status !== "all") {
      sql += ` AND w.status = $${paramIndex++}`;
      params.push(query.status);
    }

    if (query.search) {
      sql += ` AND (w.full_name ILIKE $${paramIndex} OR w.employee_code ILIKE $${paramIndex})`;
      params.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.branchId) {
      sql += ` AND (
        w.branch_ids = '[]'::jsonb 
        OR w.branch_ids @> $${paramIndex}::jsonb
      )`;
      params.push(JSON.stringify([query.branchId]));
      paramIndex++;
    }

    sql += ` GROUP BY w.id ORDER BY w.created_at DESC LIMIT $${paramIndex}`;
    params.push(query.limit);

    const result = await pool.query(sql, params);

    const data = result.rows.map(row => ({
      id: row.id,
      personId: row.person_id,
      fullName: row.full_name,
      employeeCode: row.employee_code,
      designation: row.designation,
      watchlistType: row.watchlist_type,
      status: row.status,
      branchIds: row.branch_ids,
      areaAccess: row.area_access,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      addedBy: row.added_by,
      addedAt: row.added_at,
      reason: row.reason,
      faceEnrolled: row.face_enrolled,
      faceEmbeddingId: row.face_embedding_id,
      notes: row.notes,
      detectionCount24h: parseInt(row.detections_24h || 0),
      lastDetected: row.last_detection || undefined,
    }));

    // Calculate summary
    const summary = {
      totalEntries: data.length,
      authorizedPersons: data.filter(d => d.watchlistType === "authorized").length,
      blacklistedPersons: data.filter(d => d.watchlistType === "blacklist").length,
      vipPersons: data.filter(d => d.watchlistType === "vip").length,
      visitors: data.filter(d => d.watchlistType === "visitor").length,
      activeEntries: data.filter(d => d.status === "active").length,
      expiredEntries: data.filter(d => d.status === "expired").length,
      recentDetections24h: data.reduce((sum, d) => sum + d.detectionCount24h, 0),
    };

    return reply.send({
      success: true,
      data,
      count: data.length,
      summary,
    });
  });

  // Get single watchlist entry
  app.get("/v1/watchlist/nbfc/:id", async (request, reply) => {
    const { tenantId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const result = await pool.query(
      `SELECT 
        w.*,
        COUNT(DISTINCT d.id) as total_detections,
        COUNT(DISTINCT CASE WHEN d.detected_at > NOW() - INTERVAL '24 hours' THEN d.id END) as detections_24h
      FROM nbfc_watchlist_entries w
      LEFT JOIN nbfc_watchlist_detections d ON w.id = d.watchlist_entry_id
      WHERE w.id = $1 AND w.tenant_id = $2
      GROUP BY w.id`,
      [params.id, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "entry_not_found" });
    }

    const row = result.rows[0];
    return reply.send({
      success: true,
      data: {
        id: row.id,
        personId: row.person_id,
        fullName: row.full_name,
        employeeCode: row.employee_code,
        designation: row.designation,
        watchlistType: row.watchlist_type,
        status: row.status,
        branchIds: row.branch_ids,
        areaAccess: row.area_access,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        addedBy: row.added_by,
        addedAt: row.added_at,
        reason: row.reason,
        faceEnrolled: row.face_enrolled,
        faceEmbeddingId: row.face_embedding_id,
        notes: row.notes,
        detectionCount24h: parseInt(row.detections_24h || 0),
        totalDetections: parseInt(row.total_detections || 0),
      },
    });
  });

  // Create watchlist entry
  app.post("/v1/watchlist/nbfc", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const body = watchlistEntrySchema.parse(request.body);

    // Validate face enrollment requirement
    if (body.watchlistType === "blacklist" && !body.faceEnrolled) {
      return reply.code(400).send({
        error: "face_enrollment_required",
        message: "Blacklist entries require face enrollment for detection",
      });
    }

    const result = await pool.query(
      `INSERT INTO nbfc_watchlist_entries (
        tenant_id, person_id, full_name, employee_code, designation,
        watchlist_type, status, branch_ids, area_access,
        valid_from, valid_until, added_by, reason, face_enrolled, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        tenantId,
        body.personId,
        body.fullName,
        body.employeeCode,
        body.designation,
        body.watchlistType,
        body.status,
        JSON.stringify(body.branchIds),
        JSON.stringify(body.areaAccess),
        body.validFrom,
        body.validUntil,
        userId,
        body.reason,
        body.faceEnrolled,
        body.notes,
      ]
    );

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // Update watchlist entry
  app.patch("/v1/watchlist/nbfc/:id", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      status: z.enum(["active", "expired", "suspended"]).optional(),
      branchIds: z.array(z.string().uuid()).optional(),
      areaAccess: z.array(z.enum(["vault", "cash_counter", "atm", "locker", "branch_entry"])).optional(),
      validUntil: z.string().datetime({ offset: true }).optional(),
      notes: z.string().optional(),
      faceEnrolled: z.boolean().optional(),
    }).parse(request.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
    }
    if (body.branchIds !== undefined) {
      updates.push(`branch_ids = $${paramIndex++}`);
      values.push(JSON.stringify(body.branchIds));
    }
    if (body.areaAccess !== undefined) {
      updates.push(`area_access = $${paramIndex++}`);
      values.push(JSON.stringify(body.areaAccess));
    }
    if (body.validUntil !== undefined) {
      updates.push(`valid_until = $${paramIndex++}`);
      values.push(body.validUntil);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(body.notes);
    }
    if (body.faceEnrolled !== undefined) {
      updates.push(`face_enrolled = $${paramIndex++}`);
      values.push(body.faceEnrolled);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "no_updates_provided" });
    }

    values.push(tenantId, params.id);
    const result = await pool.query(
      `UPDATE nbfc_watchlist_entries 
       SET ${updates.join(", ")}
       WHERE tenant_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "entry_not_found" });
    }

    return reply.send({
      success: true,
      data: result.rows[0],
    });
  });

  // Delete watchlist entry
  app.delete("/v1/watchlist/nbfc/:id", async (request, reply) => {
    const { tenantId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const result = await pool.query(
      `DELETE FROM nbfc_watchlist_entries
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [params.id, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "entry_not_found" });
    }

    return reply.send({
      success: true,
      message: "Watchlist entry deleted",
    });
  });

  // ============================================================================
  // Detections API
  // ============================================================================

  // Get detections for entry
  app.get("/v1/watchlist/nbfc/:id/detections", async (request, reply) => {
    const { tenantId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    // Verify entry belongs to tenant
    const entryCheck = await pool.query(
      `SELECT id FROM nbfc_watchlist_entries WHERE id = $1 AND tenant_id = $2`,
      [params.id, tenantId]
    );

    if (entryCheck.rows.length === 0) {
      return reply.code(404).send({ error: "entry_not_found" });
    }

    const result = await pool.query(
      `SELECT * FROM nbfc_watchlist_detections
       WHERE watchlist_entry_id = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
      [params.id, query.limit]
    );

    return reply.send({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        branchId: row.branch_id,
        branchName: row.branch_name,
        detectedAt: row.detected_at,
        confidence: parseFloat(row.confidence || 0),
        snapshotPath: row.snapshot_path,
      })),
      count: result.rows.length,
    });
  });

  // Record detection
  app.post("/v1/watchlist/nbfc/detections", async (request, reply) => {
    const { tenantId } = getUser(request);
    const body = detectionSchema.parse(request.body);

    // Verify entry belongs to tenant and is active
    const entryCheck = await pool.query(
      `SELECT id, watchlist_type, status FROM nbfc_watchlist_entries 
       WHERE id = $1 AND tenant_id = $2`,
      [body.watchlistEntryId, tenantId]
    );

    if (entryCheck.rows.length === 0) {
      return reply.code(404).send({ error: "entry_not_found" });
    }

    const entry = entryCheck.rows[0];

    const result = await pool.query(
      `INSERT INTO nbfc_watchlist_detections (
        tenant_id, watchlist_entry_id, camera_id, camera_name,
        branch_id, branch_name, confidence, snapshot_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        tenantId,
        body.watchlistEntryId,
        body.cameraId,
        body.cameraName,
        body.branchId,
        body.branchName,
        body.confidence,
        body.snapshotPath,
      ]
    );

    // If blacklist detection, create alert
    if (entry.watchlist_type === "blacklist" && entry.status === "active") {
      // TODO: Integrate with alerts system
      app.log.warn({
        watchlistId: body.watchlistEntryId,
        cameraId: body.cameraId,
        branchId: body.branchId,
      }, "Blacklist person detected - alert should be created");
    }

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
      alert: entry.watchlist_type === "blacklist",
    });
  });

  // ============================================================================
  // Background Jobs
  // ============================================================================

  // Check for expired entries
  app.post("/v1/watchlist/nbfc/check-expired", async (request, reply) => {
    const { tenantId } = getUser(request);

    const result = await pool.query(
      `UPDATE nbfc_watchlist_entries
       SET status = 'expired'
       WHERE tenant_id = $1
         AND status = 'active'
         AND valid_until IS NOT NULL
         AND valid_until < NOW()
       RETURNING id, full_name, watchlist_type`,
      [tenantId]
    );

    return reply.send({
      success: true,
      expiredCount: result.rows.length,
      entries: result.rows,
    });
  });

  app.log.info("[NbfcWatchlist] Routes registered");
}
