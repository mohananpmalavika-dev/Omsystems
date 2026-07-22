/**
 * Analytics Phase 2 API Routes
 * Face Recognition, ANPR, Behavior Analysis, Protected Objects
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const faceWatchlistSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  listType: z.enum(["security", "vip", "staff", "blacklist", "missing-person"]),
  alertOnMatch: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
});

const facePersonSchema = z.object({
  externalId: z.string().optional(),
  fullName: z.string().min(1).max(255),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const anprWatchlistSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  listType: z.enum(["alert", "stolen", "wanted", "vip", "staff", "blacklist"]),
  alertOnMatch: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
  alertAuthorities: z.boolean().default(false),
});

const anprPlateSchema = z.object({
  plateNumber: z.string().min(2).max(20),
  countryCode: z.string().length(2).default("IN"),
  regionCode: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehicleType: z.enum(["car", "motorcycle", "bus", "truck", "other"]).optional(),
  ownerName: z.string().optional(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const protectedObjectSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  objectType: z.string(),
  zone: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  alertOnRemoval: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
  removalThresholdSeconds: z.number().int().min(5).max(600).default(30),
});

export async function registerAnalyticsPhase2Routes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // ==================== Face Recognition ====================

  /**
   * List face watchlists
   */
  app.get("/v1/analytics/face-watchlists", async (request, reply) => {
    const decision = await store.checkAccess(
      request.currentUser,
      "face:view",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const watchlists = await store.pool.query(
      `SELECT id, name, description, list_type, enabled, alert_on_match,
              alert_severity, created_at
       FROM face_watchlists
       WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY name ASC`,
      [request.currentUser.tenantId],
    );

    return { data: watchlists.rows };
  });

  /**
   * Create face watchlist
   */
  app.post("/v1/analytics/face-watchlists", async (request, reply) => {
    const decision = await store.checkAccess(
      request.currentUser,
      "face:manage-watchlist",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = faceWatchlistSchema.parse(request.body);

    const result = await store.pool.query(
      `INSERT INTO face_watchlists
        (tenant_id, name, description, list_type, alert_on_match,
         alert_severity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, list_type, created_at`,
      [
        request.currentUser.tenantId,
        body.name,
        body.description,
        body.listType,
        body.alertOnMatch,
        body.alertSeverity,
        request.currentUser.id,
      ],
    );

    return { data: result.rows[0] };
  });

  /**
   * List persons in watchlist
   */
  app.get(
    "/v1/analytics/face-watchlists/:watchlistId/persons",
    async (request, reply) => {
      const { watchlistId } = z
        .object({ watchlistId: z.string().uuid() })
        .parse(request.params);

      const decision = await store.checkAccess(
        request.currentUser,
        "face:view",
        null,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const persons = await store.pool.query(
        `SELECT p.id, p.external_id, p.full_name, p.date_of_birth, p.gender,
                p.notes, p.enrolled_at, p.last_seen_at, p.match_count,
                COUNT(e.id) as embedding_count
         FROM face_watchlist_persons p
         LEFT JOIN face_embeddings e ON e.person_id = p.id
         WHERE p.watchlist_id = $1 AND p.archived_at IS NULL
         GROUP BY p.id
         ORDER BY p.full_name ASC`,
        [watchlistId],
      );

      return { data: persons.rows };
    },
  );

  /**
   * Enrol person in face watchlist
   */
  app.post(
    "/v1/analytics/face-watchlists/:watchlistId/persons",
    async (request, reply) => {
      const { watchlistId } = z
        .object({ watchlistId: z.string().uuid() })
        .parse(request.params);

      const decision = await store.checkAccess(
        request.currentUser,
        "face:enrol",
        null,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = facePersonSchema.parse(request.body);

      // TODO: Process face images and extract embeddings
      // This would typically involve:
      // 1. Upload face images
      // 2. Detect faces in images
      // 3. Extract face embeddings
      // 4. Store embeddings in face_embeddings table

      const result = await store.pool.query(
        `INSERT INTO face_watchlist_persons
          (tenant_id, watchlist_id, external_id, full_name, date_of_birth,
           gender, notes, metadata, enrolled_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, full_name, enrolled_at`,
        [
          request.currentUser.tenantId,
          watchlistId,
          body.externalId,
          body.fullName,
          body.dateOfBirth,
          body.gender,
          body.notes,
          body.metadata,
          request.currentUser.id,
        ],
      );

      // Log audit trail
      await store.pool.query(
        `INSERT INTO analytics_audit_log
          (tenant_id, user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, 'face_enrol', 'face_watchlist_person', $3, $4)`,
        [
          request.currentUser.tenantId,
          request.currentUser.id,
          result.rows[0]!.id,
          JSON.stringify({ watchlistId, personName: body.fullName }),
        ],
      );

      return { data: result.rows[0] };
    },
  );

  /**
   * Search face recognition events
   */
  app.get("/v1/analytics/face-events", async (request, reply) => {
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().uuid().optional(),
        watchlistId: z.string().uuid().optional(),
        personId: z.string().uuid().optional(),
        minSimilarity: z.coerce.number().min(0).max(1).default(0.6),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
      })
      .parse(request.query);

    const decision = await store.checkAccess(
      request.currentUser,
      "face:view",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const conditions = ["fe.tenant_id = $1", "fe.similarity_score >= $2"];
    const params: any[] = [request.currentUser.tenantId, query.minSimilarity];
    let paramIndex = 3;

    if (query.from) {
      conditions.push(`fe.occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`fe.occurred_at < $${paramIndex++}`);
      params.push(query.to);
    }
    if (query.cameraId) {
      conditions.push(`fe.camera_id = $${paramIndex++}`);
      params.push(query.cameraId);
    }
    if (query.watchlistId) {
      conditions.push(`fe.watchlist_id = $${paramIndex++}`);
      params.push(query.watchlistId);
    }
    if (query.personId) {
      conditions.push(`fe.person_id = $${paramIndex++}`);
      params.push(query.personId);
    }

    const events = await store.pool.query(
      `SELECT fe.id, fe.camera_id, fe.watchlist_id, fe.person_id,
              fe.similarity_score, fe.face_quality, fe.age_estimate,
              fe.gender_estimate, fe.wearing_mask, fe.snapshot_reference,
              fe.occurred_at, p.full_name as person_name,
              w.name as watchlist_name, c.name as camera_name
       FROM face_recognition_events fe
       LEFT JOIN face_watchlist_persons p ON p.id = fe.person_id
       LEFT JOIN face_watchlists w ON w.id = fe.watchlist_id
       LEFT JOIN cameras c ON c.id = fe.camera_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY fe.occurred_at DESC
       LIMIT $${paramIndex}`,
      [...params, query.limit],
    );

    // Log audit trail for face searches
    await store.pool.query(
      `INSERT INTO analytics_audit_log
        (tenant_id, user_id, action, details)
       VALUES ($1, $2, 'face_search', $3)`,
      [
        request.currentUser.tenantId,
        request.currentUser.id,
        JSON.stringify(query),
      ],
    );

    return { data: events.rows };
  });

  // ==================== ANPR ====================

  /**
   * List ANPR watchlists
   */
  app.get("/v1/analytics/anpr-watchlists", async (request, reply) => {
    const decision = await store.checkAccess(
      request.currentUser,
      "anpr:view",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const watchlists = await store.pool.query(
      `SELECT id, name, description, list_type, enabled, alert_on_match,
              alert_severity, alert_authorities, created_at
       FROM anpr_watchlists
       WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY name ASC`,
      [request.currentUser.tenantId],
    );

    return { data: watchlists.rows };
  });

  /**
   * Create ANPR watchlist
   */
  app.post("/v1/analytics/anpr-watchlists", async (request, reply) => {
    const decision = await store.checkAccess(
      request.currentUser,
      "anpr:manage-watchlist",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = anprWatchlistSchema.parse(request.body);

    const result = await store.pool.query(
      `INSERT INTO anpr_watchlists
        (tenant_id, name, description, list_type, alert_on_match,
         alert_severity, alert_authorities, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, list_type, created_at`,
      [
        request.currentUser.tenantId,
        body.name,
        body.description,
        body.listType,
        body.alertOnMatch,
        body.alertSeverity,
        body.alertAuthorities,
        request.currentUser.id,
      ],
    );

    return { data: result.rows[0] };
  });

  /**
   * Add plate to watchlist
   */
  app.post(
    "/v1/analytics/anpr-watchlists/:watchlistId/plates",
    async (request, reply) => {
      const { watchlistId } = z
        .object({ watchlistId: z.string().uuid() })
        .parse(request.params);

      const decision = await store.checkAccess(
        request.currentUser,
        "anpr:manage-watchlist",
        null,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = anprPlateSchema.parse(request.body);

      const result = await store.pool.query(
        `INSERT INTO anpr_watchlist_plates
          (tenant_id, watchlist_id, plate_number, country_code, region_code,
           vehicle_make, vehicle_model, vehicle_color, vehicle_type,
           owner_name, reason, notes, expires_at, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, plate_number, added_at`,
        [
          request.currentUser.tenantId,
          watchlistId,
          body.plateNumber.toUpperCase(),
          body.countryCode,
          body.regionCode,
          body.vehicleMake,
          body.vehicleModel,
          body.vehicleColor,
          body.vehicleType,
          body.ownerName,
          body.reason,
          body.notes,
          body.expiresAt,
          request.currentUser.id,
        ],
      );

      return { data: result.rows[0] };
    },
  );

  /**
   * Search ANPR events
   */
  app.get("/v1/analytics/anpr-events", async (request, reply) => {
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().uuid().optional(),
        plateNumber: z.string().optional(),
        watchlistId: z.string().uuid().optional(),
        entryDirection: z.enum(["entry", "exit", "unknown"]).optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
        justification: z.string().optional(), // Required for searches in some jurisdictions
      })
      .parse(request.query);

    const decision = await store.checkAccess(
      request.currentUser,
      "anpr:search",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const conditions = ["ae.tenant_id = $1"];
    const params: any[] = [request.currentUser.tenantId];
    let paramIndex = 2;

    if (query.from) {
      conditions.push(`ae.occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`ae.occurred_at < $${paramIndex++}`);
      params.push(query.to);
    }
    if (query.cameraId) {
      conditions.push(`ae.camera_id = $${paramIndex++}`);
      params.push(query.cameraId);
    }
    if (query.plateNumber) {
      conditions.push(`ae.plate_number ILIKE $${paramIndex++}`);
      params.push(`%${query.plateNumber.toUpperCase()}%`);
    }
    if (query.watchlistId) {
      conditions.push(`ae.watchlist_id = $${paramIndex++}`);
      params.push(query.watchlistId);
    }
    if (query.entryDirection) {
      conditions.push(`ae.entry_direction = $${paramIndex++}`);
      params.push(query.entryDirection);
    }

    const events = await store.pool.query(
      `SELECT ae.id, ae.camera_id, ae.plate_number, ae.plate_confidence,
              ae.country_code, ae.vehicle_type, ae.vehicle_color,
              ae.entry_direction, ae.snapshot_reference, ae.occurred_at,
              w.name as watchlist_name, wp.reason as watchlist_reason,
              c.name as camera_name
       FROM anpr_events ae
       LEFT JOIN anpr_watchlist_plates wp ON wp.id = ae.plate_id
       LEFT JOIN anpr_watchlists w ON w.id = ae.watchlist_id
       LEFT JOIN cameras c ON c.id = ae.camera_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ae.occurred_at DESC
       LIMIT $${paramIndex}`,
      [...params, query.limit],
    );

    // Log audit trail for ANPR searches
    await store.pool.query(
      `INSERT INTO analytics_audit_log
        (tenant_id, user_id, action, details, justification)
       VALUES ($1, $2, 'anpr_search', $3, $4)`,
      [
        request.currentUser.tenantId,
        request.currentUser.id,
        JSON.stringify(query),
        query.justification,
      ],
    );

    return { data: events.rows };
  });

  /**
   * Get vehicle session (entry/exit pairing)
   */
  app.get(
    "/v1/analytics/anpr-sessions/:plateNumber",
    async (request, reply) => {
      const { plateNumber } = z
        .object({ plateNumber: z.string() })
        .parse(request.params);

      const decision = await store.checkAccess(
        request.currentUser,
        "anpr:view",
        null,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const sessions = await store.pool.query(
        `SELECT vs.id, vs.plate_number, vs.entry_at, vs.exit_at,
                vs.duration_seconds, vs.status,
                ec.name as entry_camera_name, xc.name as exit_camera_name
         FROM anpr_vehicle_sessions vs
         LEFT JOIN cameras ec ON ec.id = vs.entry_camera_id
         LEFT JOIN cameras xc ON xc.id = vs.exit_camera_id
         WHERE vs.tenant_id = $1 AND vs.plate_number ILIKE $2
         ORDER BY vs.entry_at DESC
         LIMIT 50`,
        [request.currentUser.tenantId, plateNumber.toUpperCase()],
      );

      return { data: sessions.rows };
    },
  );

  // ==================== Protected Objects ====================

  /**
   * List protected objects for a camera
   */
  app.get(
    "/v1/cameras/:cameraId/protected-objects",
    async (request, reply) => {
      const { cameraId } = z
        .object({ cameraId: z.string().uuid() })
        .parse(request.params);

      const decision = await store.checkCameraAccess(
        request.currentUser.id,
        cameraId,
        "protected-objects:manage",
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const objects = await store.pool.query(
        `SELECT id, name, description, object_type, zone, alert_on_removal,
                alert_severity, removal_threshold_seconds, created_at,
                last_verified_at
         FROM protected_objects
         WHERE camera_id = $1 AND archived_at IS NULL
         ORDER BY name ASC`,
        [cameraId],
      );

      return { data: objects.rows };
    },
  );

  /**
   * Register protected object
   */
  app.post(
    "/v1/cameras/:cameraId/protected-objects",
    async (request, reply) => {
      const { cameraId } = z
        .object({ cameraId: z.string().uuid() })
        .parse(request.params);

      const decision = await store.checkCameraAccess(
        request.currentUser.id,
        cameraId,
        "protected-objects:manage",
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = protectedObjectSchema.parse(request.body);

      const result = await store.pool.query(
        `INSERT INTO protected_objects
          (tenant_id, camera_id, name, description, object_type, zone,
           alert_on_removal, alert_severity, removal_threshold_seconds,
           created_by, last_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         RETURNING id, name, created_at`,
        [
          request.currentUser.tenantId,
          cameraId,
          body.name,
          body.description,
          body.objectType,
          JSON.stringify(body.zone),
          body.alertOnRemoval,
          body.alertSeverity,
          body.removalThresholdSeconds,
          request.currentUser.id,
        ],
      );

      return { data: result.rows[0] };
    },
  );

  /**
   * Get behavior events
   */
  app.get("/v1/analytics/behavior-events", async (request, reply) => {
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().uuid().optional(),
        behaviorType: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
      })
      .parse(request.query);

    const decision = await store.checkAccess(
      request.currentUser,
      "behavior:view",
      null,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const conditions = ["be.tenant_id = $1"];
    const params: any[] = [request.currentUser.tenantId];
    let paramIndex = 2;

    if (query.from) {
      conditions.push(`be.occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`be.occurred_at < $${paramIndex++}`);
      params.push(query.to);
    }
    if (query.cameraId) {
      conditions.push(`be.camera_id = $${paramIndex++}`);
      params.push(query.cameraId);
    }
    if (query.behaviorType) {
      conditions.push(`be.behavior_type = $${paramIndex++}`);
      params.push(query.behaviorType);
    }

    const events = await store.pool.query(
      `SELECT be.id, be.camera_id, be.behavior_type, be.confidence,
              be.track_id, be.person_count, be.duration_seconds,
              be.speed_pixels_per_second, be.snapshot_reference,
              be.occurred_at, c.name as camera_name
       FROM behavior_events be
       LEFT JOIN cameras c ON c.id = be.camera_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY be.occurred_at DESC
       LIMIT $${paramIndex}`,
      [...params, query.limit],
    );

    return { data: events.rows };
  });
}
