/**
 * Face Recognition API Routes (Production-Ready)
 * Provides complete face watchlist, enrollment, matching, and review endpoints
 * Implements BFSI compliance with consent, liveness, and human-in-the-loop review
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { FaceRecognitionService } from "../face/face-recognition.service.js";
import { FaceEnrollmentService } from "../face/face-enrollment.service.js";
import { FaceSearchService } from "../face/face-search.service.js";
import type { FaceRecognitionGovernanceService } from "../../../src/banking/governance/face-recognition-governance.service.js";

// ============================================================================
// Schema Definitions
// ============================================================================

const watchlistCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  listType: z.enum(["security", "vip", "staff", "blacklist", "missing-person"]).default("security"),
  alertOnMatch: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
  matchThreshold: z.number().min(0.40).max(0.95).default(0.70),
  reviewThreshold: z.number().min(0.40).max(0.95).default(0.60),
  minimumMargin: z.number().min(0.01).max(0.30).default(0.05),
  minimumQuality: z.number().min(0.30).max(0.95).default(0.55),
  temporalConfirmationFrames: z.number().int().min(1).max(20).default(3),
  temporalWindowSeconds: z.number().int().min(1).max(30).default(2),
});

const watchlistUpdateSchema = watchlistCreateSchema.partial();

const personEnrollSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  externalId: z.string().trim().max(100).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  metadata: z.record(z.unknown()).default({}),
  // Accept either base64 images or embedding vector
  images: z.array(z.string()).min(1).max(10).optional(),
  embedding: z.array(z.number()).length(512).optional(),
}).refine((data) => data.images || data.embedding, {
  message: "Either images or embedding must be provided",
});

const personUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const faceMatchSchema = z.object({
  embedding: z.array(z.number()).length(512),
  minSimilarity: z.number().min(0.50).max(0.99).default(0.70),
  watchlistIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const faceEventCreateSchema = z.object({
  cameraId: z.string().uuid(),
  watchlistId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  similarityScore: z.number().min(0).max(1),
  faceBbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }),
  faceQuality: z.number().min(0).max(1).optional(),
  ageEstimate: z.number().int().min(0).max(150).optional(),
  genderEstimate: z.enum(["male", "female"]).optional(),
  wearingMask: z.boolean().optional(),
  snapshotReference: z.string().trim().max(2000).optional(),
  occurredAt: z.string().datetime(),
  livenessScore: z.number().min(0).max(1).optional(),
});

const reviewDecisionSchema = z.object({
  decision: z.enum(["confirmed", "rejected", "unsure"]),
  notes: z.string().trim().max(2000).optional(),
});

const consentRecordSchema = z.object({
  personId: z.string().uuid(),
  role: z.enum(["EMPLOYEE", "CUSTOMER", "VENDOR", "SECURITY_STAFF"]),
  documentReference: z.string().trim().min(1).max(500),
  consentExpiryAt: z.string().datetime(),
});

// ============================================================================
// Face Recognition Routes Registration
// ============================================================================

export async function registerFaceRecognitionRoutes(
  app: FastifyInstance,
  db: Pool,
  recognitionService: FaceRecognitionService,
  enrollmentService: FaceEnrollmentService,
  searchService: FaceSearchService,
  governanceService: FaceRecognitionGovernanceService,
) {
  // Helper: Get tenant ID from request
  const getTenantId = (request: any): string => {
    return request.headers["x-tenant-id"] || request.currentUser?.tenantId || request.currentUser?.nodeId;
  };

  // Helper: Get user ID from request
  const getUserId = (request: any): string => {
    return request.currentUser?.id || request.headers["x-user-id"] || "system";
  };

  // ============================================================================
  // Watchlist Management
  // ============================================================================

  /**
   * GET /v1/analytics/face-watchlists
   * List all watchlists for tenant
   */
  app.get("/v1/analytics/face-watchlists", async (request, reply) => {
    const tenantId = getTenantId(request);
    
    const result = await db.query(
      `
      SELECT 
        w.id, w.name, w.description, w.list_type, w.enabled,
        w.alert_on_match, w.alert_severity,
        w.match_threshold, w.review_threshold, w.minimum_margin,
        w.minimum_quality, w.temporal_confirmation_frames, w.temporal_window_seconds,
        w.created_at, w.updated_at,
        COUNT(DISTINCT p.id) FILTER (WHERE p.archived_at IS NULL) as person_count,
        MAX(p.last_seen_at) as last_match_at
      FROM face_watchlists w
      LEFT JOIN face_watchlist_persons p ON p.watchlist_id = w.id AND p.archived_at IS NULL
      WHERE w.tenant_id = $1 AND w.archived_at IS NULL
      GROUP BY w.id
      ORDER BY w.created_at DESC
      `,
      [tenantId],
    );

    return reply.send({
      data: result.rows,
      count: result.rows.length,
    });
  });

  /**
   * POST /v1/analytics/face-watchlists
   * Create new watchlist
   */
  app.post("/v1/analytics/face-watchlists", async (request, reply) => {
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const body = watchlistCreateSchema.parse(request.body);

    const result = await db.query(
      `
      INSERT INTO face_watchlists (
        tenant_id, name, description, list_type, enabled,
        alert_on_match, alert_severity,
        match_threshold, review_threshold, minimum_margin,
        minimum_quality, temporal_confirmation_frames, temporal_window_seconds,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        tenantId,
        body.name,
        body.description || null,
        body.listType,
        true,
        body.alertOnMatch,
        body.alertSeverity,
        body.matchThreshold,
        body.reviewThreshold,
        body.minimumMargin,
        body.minimumQuality,
        body.temporalConfirmationFrames,
        body.temporalWindowSeconds,
        userId,
      ],
    );

    return reply.code(201).send({
      data: result.rows[0],
    });
  });

  /**
   * GET /v1/analytics/face-watchlists/:watchlistId
   * Get watchlist details
   */
  app.get("/v1/analytics/face-watchlists/:watchlistId", async (request, reply) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);

    const result = await db.query(
      `
      SELECT 
        w.*,
        COUNT(DISTINCT p.id) FILTER (WHERE p.archived_at IS NULL) as person_count,
        COUNT(DISTINCT e.id) as total_embeddings,
        MAX(p.last_seen_at) as last_match_at
      FROM face_watchlists w
      LEFT JOIN face_watchlist_persons p ON p.watchlist_id = w.id AND p.archived_at IS NULL
      LEFT JOIN face_embeddings e ON e.person_id = p.id
      WHERE w.id = $1 AND w.tenant_id = $2 AND w.archived_at IS NULL
      GROUP BY w.id
      `,
      [watchlistId, tenantId],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "watchlist_not_found" });
    }

    return reply.send({ data: result.rows[0] });
  });

  /**
   * PATCH /v1/analytics/face-watchlists/:watchlistId
   * Update watchlist
   */
  app.patch("/v1/analytics/face-watchlists/:watchlistId", async (request, reply) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);
    const body = watchlistUpdateSchema.parse(request.body);

    const updates: string[] = [];
    const values: any[] = [watchlistId, tenantId];
    let paramCount = 2;

    if (body.name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${++paramCount}`);
      values.push(body.description);
    }
    if (body.listType !== undefined) {
      updates.push(`list_type = $${++paramCount}`);
      values.push(body.listType);
    }
    if (body.alertOnMatch !== undefined) {
      updates.push(`alert_on_match = $${++paramCount}`);
      values.push(body.alertOnMatch);
    }
    if (body.alertSeverity !== undefined) {
      updates.push(`alert_severity = $${++paramCount}`);
      values.push(body.alertSeverity);
    }
    if (body.matchThreshold !== undefined) {
      updates.push(`match_threshold = $${++paramCount}`);
      values.push(body.matchThreshold);
    }
    if (body.reviewThreshold !== undefined) {
      updates.push(`review_threshold = $${++paramCount}`);
      values.push(body.reviewThreshold);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "no_updates_provided" });
    }

    updates.push(`updated_at = NOW()`);

    const result = await db.query(
      `
      UPDATE face_watchlists 
      SET ${updates.join(", ")}
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
      RETURNING *
      `,
      values,
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "watchlist_not_found" });
    }

    return reply.send({ data: result.rows[0] });
  });

  /**
   * DELETE /v1/analytics/face-watchlists/:watchlistId
   * Archive watchlist (soft delete)
   */
  app.delete("/v1/analytics/face-watchlists/:watchlistId", async (request, reply) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);

    const result = await db.query(
      `
      UPDATE face_watchlists 
      SET archived_at = NOW(), enabled = false
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
      RETURNING id
      `,
      [watchlistId, tenantId],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "watchlist_not_found" });
    }

    return reply.code(204).send();
  });

  // ============================================================================
  // Person Enrollment
  // ============================================================================

  /**
   * GET /v1/analytics/face-watchlists/:watchlistId/persons
   * List persons in watchlist
   */
  app.get("/v1/analytics/face-watchlists/:watchlistId/persons", async (request, reply) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);

    const result = await db.query(
      `
      SELECT 
        p.*,
        COUNT(DISTINCT e.id) as embedding_count,
        MAX(e.quality_score) as best_quality
      FROM face_watchlist_persons p
      LEFT JOIN face_embeddings e ON e.person_id = p.id
      WHERE p.watchlist_id = $1 AND p.tenant_id = $2 AND p.archived_at IS NULL
      GROUP BY p.id
      ORDER BY p.enrolled_at DESC
      `,
      [watchlistId, tenantId],
    );

    return reply.send({
      data: result.rows,
      count: result.rows.length,
    });
  });

  /**
   * POST /v1/analytics/face-watchlists/:watchlistId/persons
   * Enroll person in watchlist
   */
  app.post("/v1/analytics/face-watchlists/:watchlistId/persons", async (request, reply) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const body = personEnrollSchema.parse(request.body);

    // If embedding is provided directly (for testing/migration)
    if (body.embedding) {
      const personResult = await db.query(
        `
        INSERT INTO face_watchlist_persons (
          tenant_id, watchlist_id, external_id, full_name,
          date_of_birth, gender, notes, metadata, enrolled_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [
          tenantId,
          watchlistId,
          body.externalId || null,
          body.fullName,
          body.dateOfBirth || null,
          body.gender || null,
          body.notes || null,
          JSON.stringify(body.metadata),
          userId,
        ],
      );

      const personId = personResult.rows[0].id;

      // Store embedding
      await db.query(
        `
        INSERT INTO face_embeddings (
          tenant_id, person_id, embedding, quality_score,
          model_name, model_version
        ) VALUES ($1, $2, $3::vector, $4, $5, $6)
        `,
        [
          tenantId,
          personId,
          `[${body.embedding.join(",")}]`,
          1.0,
          recognitionService.getConfig().modelName,
          recognitionService.getConfig().modelVersion,
        ],
      );

      return reply.code(201).send({
        data: personResult.rows[0],
        embeddingCount: 1,
      });
    }

    // Use enrollment service for image-based enrollment
    if (body.images) {
      const imageBuffers = body.images.map((img) => Buffer.from(img, "base64"));

      const enrollmentResult = await enrollmentService.enrollPerson({
        tenantId,
        watchlistId,
        displayName: body.fullName,
        externalId: body.externalId,
        images: imageBuffers,
        metadata: {
          ...body.metadata,
          dateOfBirth: body.dateOfBirth,
          gender: body.gender,
          notes: body.notes,
        },
        actorId: userId,
      });

      // Fetch created person
      const personResult = await db.query(
        "SELECT * FROM face_watchlist_persons WHERE id = $1",
        [enrollmentResult.personId],
      );

      return reply.code(201).send({
        data: personResult.rows[0],
        enrollment: {
          acceptedImages: enrollmentResult.acceptedImages,
          rejectedImages: enrollmentResult.rejectedImages,
          failures: enrollmentResult.failures,
        },
      });
    }

    return reply.code(400).send({ error: "either_images_or_embedding_required" });
  });

  /**
   * GET /v1/analytics/face-watchlists/:watchlistId/persons/:personId
   * Get person details
   */
  app.get("/v1/analytics/face-watchlists/:watchlistId/persons/:personId", async (request, reply) => {
    const { watchlistId, personId } = z.object({
      watchlistId: z.string().uuid(),
      personId: z.string().uuid(),
    }).parse(request.params);
    const tenantId = getTenantId(request);

    const result = await db.query(
      `
      SELECT 
        p.*,
        w.name as watchlist_name,
        w.list_type as watchlist_type,
        COUNT(DISTINCT e.id) as embedding_count,
        COUNT(DISTINCT r.id) as recognition_count
      FROM face_watchlist_persons p
      JOIN face_watchlists w ON w.id = p.watchlist_id
      LEFT JOIN face_embeddings e ON e.person_id = p.id
      LEFT JOIN face_recognition_events r ON r.person_id = p.id
      WHERE p.id = $1 AND p.watchlist_id = $2 AND p.tenant_id = $3 AND p.archived_at IS NULL
      GROUP BY p.id, w.id
      `,
      [personId, watchlistId, tenantId],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "person_not_found" });
    }

    return reply.send({ data: result.rows[0] });
  });

  /**
   * PATCH /v1/analytics/face-watchlists/:watchlistId/persons/:personId
   * Update person details
   */
  app.patch("/v1/analytics/face-watchlists/:watchlistId/persons/:personId", async (request, reply) => {
    const { watchlistId, personId } = z.object({
      watchlistId: z.string().uuid(),
      personId: z.string().uuid(),
    }).parse(request.params);
    const tenantId = getTenantId(request);
    const body = personUpdateSchema.parse(request.body);

    const updates: string[] = [];
    const values: any[] = [personId, watchlistId, tenantId];
    let paramCount = 3;

    if (body.fullName !== undefined) {
      updates.push(`full_name = $${++paramCount}`);
      values.push(body.fullName);
    }
    if (body.dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${++paramCount}`);
      values.push(body.dateOfBirth);
    }
    if (body.gender !== undefined) {
      updates.push(`gender = $${++paramCount}`);
      values.push(body.gender);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${++paramCount}`);
      values.push(body.notes);
    }
    if (body.metadata !== undefined) {
      updates.push(`metadata = $${++paramCount}`);
      values.push(JSON.stringify(body.metadata));
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "no_updates_provided" });
    }

    const result = await db.query(
      `
      UPDATE face_watchlist_persons 
      SET ${updates.join(", ")}
      WHERE id = $1 AND watchlist_id = $2 AND tenant_id = $3 AND archived_at IS NULL
      RETURNING *
      `,
      values,
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "person_not_found" });
    }

    return reply.send({ data: result.rows[0] });
  });

  /**
   * DELETE /v1/analytics/face-watchlists/:watchlistId/persons/:personId
   * Archive person (soft delete)
   */
  app.delete("/v1/analytics/face-watchlists/:watchlistId/persons/:personId", async (request, reply) => {
    const { watchlistId, personId } = z.object({
      watchlistId: z.string().uuid(),
      personId: z.string().uuid(),
    }).parse(request.params);
    const tenantId = getTenantId(request);

    const result = await db.query(
      `
      UPDATE face_watchlist_persons 
      SET archived_at = NOW()
      WHERE id = $1 AND watchlist_id = $2 AND tenant_id = $3 AND archived_at IS NULL
      RETURNING id
      `,
      [personId, watchlistId, tenantId],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "person_not_found" });
    }

    return reply.code(204).send();
  });

  // ============================================================================
  // Face Matching & Search
  // ============================================================================

  /**
   * POST /v1/analytics/face-match
   * Match face embedding against watchlists
   */
  app.post("/v1/analytics/face-match", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = faceMatchSchema.parse(request.body);

    const candidates = await searchService.searchPersons({
      tenantId,
      embedding: new Float32Array(body.embedding),
      threshold: body.minSimilarity,
      watchlistIds: body.watchlistIds,
      limit: body.limit,
    });

    const bestMatch = candidates.length > 0 ? candidates[0] : null;

    return reply.send({
      data: {
        matched: candidates.length > 0,
        bestMatch: bestMatch
          ? {
              personId: bestMatch.personId,
              personName: bestMatch.displayName,
              watchlistId: bestMatch.watchlistId,
              watchlistName: bestMatch.watchlistName,
              similarity: bestMatch.bestSimilarity,
              confidence: bestMatch.supportingEmbeddings,
              meanSimilarity: bestMatch.meanTopKSimilarity,
            }
          : null,
        allCandidates: candidates.map((c) => ({
          personId: c.personId,
          personName: c.displayName,
          watchlistId: c.watchlistId,
          watchlistName: c.watchlistName,
          similarity: c.bestSimilarity,
        })),
        count: candidates.length,
      },
    });
  });

  // ============================================================================
  // Face Recognition Events
  // ============================================================================

  /**
   * POST /v1/analytics/face-events
   * Record face recognition event
   */
  app.post("/v1/analytics/face-events", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = faceEventCreateSchema.parse(request.body);

    // BFSI Governance validation
    if (body.personId || body.watchlistId) {
      // Get camera metadata for branchId
      let branchId = "default";
      try {
        const cameraResult = await db.query(
          "SELECT branch_id FROM cameras WHERE id = $1 AND tenant_id = $2",
          [body.cameraId, tenantId]
        );
        if (cameraResult.rows[0]?.branch_id) {
          branchId = cameraResult.rows[0].branch_id;
        }
      } catch (err) {
        app.log.warn({ err, cameraId: body.cameraId }, "Failed to fetch camera branch");
      }

      // Get temporal confirmation count from recent events
      let observationCount = 1;
      if (body.personId) {
        try {
          const recentEventsResult = await db.query(
            `
            SELECT COUNT(*) as count
            FROM face_recognition_events
            WHERE person_id = $1 
              AND camera_id = $2 
              AND occurred_at >= $3
            `,
            [body.personId, body.cameraId, new Date(Date.parse(body.occurredAt) - 5000)] // 5 second window
          );
          observationCount = Math.max(1, parseInt(recentEventsResult.rows[0]?.count || "1"));
        } catch (err) {
          app.log.warn({ err, personId: body.personId }, "Failed to count recent observations");
        }
      }

      // Validate biometric observation
      const validation = governanceService.validateBiometricObservation({
        cameraId: body.cameraId,
        branchId,
        tenantId,
        embedding: [], // Embedding not stored in event record for privacy
        livenessScore: body.livenessScore || 0.0,
        observationCount,
        observedAt: new Date(body.occurredAt),
        matchedPersonId: body.personId,
        isWatchlistMatch: !!body.watchlistId,
      });

      if (!validation.accepted) {
        // Log rejection for audit
        await db.query(
          `
          INSERT INTO face_governance_audit (
            tenant_id, camera_id, branch_id, person_id,
            validation_result, rejection_reason, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [tenantId, body.cameraId, branchId, body.personId || null, "REJECTED", validation.reason, body.occurredAt]
        ).catch(err => app.log.warn({ err }, "Failed to log governance audit"));

        return reply.code(400).send({
          error: "governance_validation_failed",
          reason: validation.reason,
          observationCount,
          livenessScore: body.livenessScore,
        });
      }

      // Log acceptance for audit
      await db.query(
        `
        INSERT INTO face_governance_audit (
          tenant_id, camera_id, branch_id, person_id,
          validation_result, liveness_score, observation_count, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [tenantId, body.cameraId, branchId, body.personId || null, "ACCEPTED", body.livenessScore || null, observationCount, body.occurredAt]
      ).catch(err => app.log.warn({ err }, "Failed to log governance audit"));
    }

    const result = await db.query(
      `
      INSERT INTO face_recognition_events (
        tenant_id, camera_id, watchlist_id, person_id,
        similarity_score, face_bbox, face_quality,
        age_estimate, gender_estimate, wearing_mask,
        snapshot_reference, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
      `,
      [
        tenantId,
        body.cameraId,
        body.watchlistId || null,
        body.personId || null,
        body.similarityScore,
        JSON.stringify(body.faceBbox),
        body.faceQuality || null,
        body.ageEstimate || null,
        body.genderEstimate || null,
        body.wearingMask || null,
        body.snapshotReference || null,
        body.occurredAt,
      ],
    );

    // Update person last_seen_at and match_count
    if (body.personId) {
      await db.query(
        `
        UPDATE face_watchlist_persons 
        SET last_seen_at = $1, match_count = match_count + 1
        WHERE id = $2
        `,
        [body.occurredAt, body.personId],
      );
    }

    return reply.code(201).send({
      data: {
        ...result.rows[0],
        reviewStatus: "pending",
      },
    });
  });

  /**
   * GET /v1/analytics/face-events
   * List face recognition events
   */
  app.get("/v1/analytics/face-events", async (request, reply) => {
    const tenantId = getTenantId(request);
    const query = z.object({
      cameraId: z.string().uuid().optional(),
      watchlistId: z.string().uuid().optional(),
      personId: z.string().uuid().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);

    const conditions: string[] = ["e.tenant_id = $1"];
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (query.cameraId) {
      conditions.push(`e.camera_id = $${++paramCount}`);
      values.push(query.cameraId);
    }
    if (query.watchlistId) {
      conditions.push(`e.watchlist_id = $${++paramCount}`);
      values.push(query.watchlistId);
    }
    if (query.personId) {
      conditions.push(`e.person_id = $${++paramCount}`);
      values.push(query.personId);
    }
    if (query.startDate) {
      conditions.push(`e.occurred_at >= $${++paramCount}`);
      values.push(query.startDate);
    }
    if (query.endDate) {
      conditions.push(`e.occurred_at <= $${++paramCount}`);
      values.push(query.endDate);
    }

    const result = await db.query(
      `
      SELECT 
        e.*,
        p.full_name as person_name,
        w.name as watchlist_name,
        c.name as camera_name,
        COALESCE(r.decision, 'pending') as review_status
      FROM face_recognition_events e
      LEFT JOIN face_watchlist_persons p ON p.id = e.person_id
      LEFT JOIN face_watchlists w ON w.id = e.watchlist_id
      LEFT JOIN cameras c ON c.id = e.camera_id
      LEFT JOIN face_match_reviews r ON r.recognition_event_id = e.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.occurred_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
      `,
      [...values, query.limit, query.offset],
    );

    return reply.send({
      data: result.rows,
      count: result.rows.length,
      limit: query.limit,
      offset: query.offset,
    });
  });

  /**
   * POST /v1/analytics/face-events/:eventId/reviews
   * Submit human review for face match
   */
  app.post("/v1/analytics/face-events/:eventId/reviews", async (request, reply) => {
    const { eventId } = z.object({ eventId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const body = reviewDecisionSchema.parse(request.body);

    // Verify event exists and belongs to tenant
    const eventCheck = await db.query(
      "SELECT id FROM face_recognition_events WHERE id = $1 AND tenant_id = $2",
      [eventId, tenantId],
    );

    if (eventCheck.rows.length === 0) {
      return reply.code(404).send({ error: "event_not_found" });
    }

    const result = await db.query(
      `
      INSERT INTO face_match_reviews (
        tenant_id, recognition_event_id, reviewer_id, decision, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [tenantId, eventId, userId, body.decision, body.notes || null],
    );

    // Record governance review
    governanceService.completeHumanReview(
      eventId,
      body.decision === "confirmed" ? "CONFIRMED_GENUINE" : "REJECTED_FALSE_POSITIVE",
      userId,
      body.notes || "",
    );

    return reply.code(201).send({
      data: {
        ...result.rows[0],
        status: body.decision,
      },
    });
  });

  // ============================================================================
  // Biometric Consent Management (BFSI Compliance)
  // ============================================================================

  /**
   * POST /v1/analytics/face/consent
   * Register biometric consent
   */
  app.post("/v1/analytics/face/consent", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = consentRecordSchema.parse(request.body);

    // Get person details
    let personName = "Unknown";
    try {
      const personResult = await db.query(
        "SELECT full_name FROM face_watchlist_persons WHERE id = $1 AND tenant_id = $2",
        [body.personId, tenantId]
      );
      if (personResult.rows[0]?.full_name) {
        personName = personResult.rows[0].full_name;
      }
    } catch (err) {
      app.log.warn({ err, personId: body.personId }, "Failed to fetch person name for consent");
    }

    // Register consent in governance service
    governanceService.registerConsent({
      personId: body.personId,
      tenantId,
      branchId: "default", // Branch-agnostic consent
      personName,
      role: body.role,
      consentSignedAt: new Date(),
      consentExpiryAt: new Date(body.consentExpiryAt),
      documentReference: body.documentReference,
      status: "ACTIVE",
    });

    // Store consent record in database
    try {
      await db.query(
        `
        INSERT INTO face_biometric_consent (
          tenant_id, person_id, person_name, role,
          consent_signed_at, consent_expiry_at, document_reference, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, person_id) 
        DO UPDATE SET 
          consent_signed_at = EXCLUDED.consent_signed_at,
          consent_expiry_at = EXCLUDED.consent_expiry_at,
          document_reference = EXCLUDED.document_reference,
          status = EXCLUDED.status,
          updated_at = NOW()
        `,
        [tenantId, body.personId, personName, body.role, new Date(), body.consentExpiryAt, body.documentReference, "ACTIVE"]
      );
    } catch (err) {
      app.log.error({ err }, "Failed to store consent record in database");
      throw new Error("consent_storage_failed");
    }

    return reply.code(201).send({
      data: {
        personId: body.personId,
        status: "registered",
        expiresAt: body.consentExpiryAt,
      },
    });
  });

  /**
   * GET /v1/analytics/face/consent/:personId
   * Check consent status
   */
  app.get("/v1/analytics/face/consent/:personId", async (request, reply) => {
    const { personId } = z.object({ personId: z.string().uuid() }).parse(request.params);

    const hasConsent = governanceService.hasActiveConsent(personId);

    return reply.send({
      data: {
        personId,
        hasActiveConsent: hasConsent,
      },
    });
  });

  app.log.info("Face Recognition API routes registered successfully");
}
