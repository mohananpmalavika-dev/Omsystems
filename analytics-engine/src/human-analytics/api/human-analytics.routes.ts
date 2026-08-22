/**
 * Human Analytics API Routes
 * REST API endpoints for human/behavior analytics operations
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

// Request schemas
const tenantIdHeader = z.object({
  "x-tenant-id": z.string().uuid(),
});

const cameraIdParam = z.object({
  cameraId: z.string().min(1),
});

const trackingQueryParams = z.object({
  cameraId: z.string().optional(),
  status: z.enum(["tentative", "confirmed", "lost", "completed"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const journeyQueryParams = z.object({
  status: z.enum(["active", "completed", "ambiguous"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  cameraId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const journeyIdParam = z.object({
  journeyId: z.string().uuid(),
});

const crossingQueryParams = z.object({
  cameraId: z.string().optional(),
  gateId: z.string().uuid().optional(),
  direction: z.enum(["entry", "exit"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const occupancyQueryParams = z.object({
  zoneId: z.string(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  intervalMinutes: z.coerce.number().int().positive().optional().default(5),
});

const behaviorQueryParams = z.object({
  cameraId: z.string().optional(),
  eventType: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  reviewStatus: z.enum(["unreviewed", "confirmed", "rejected"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const reviewEventBody = z.object({
  status: z.enum(["confirmed", "rejected"]),
  notes: z.string().optional(),
});

const createGateBody = z.object({
  cameraId: z.string().min(1),
  name: z.string().min(1),
  lineStart: z.object({
    x: z.number(),
    y: z.number(),
  }),
  lineEnd: z.object({
    x: z.number(),
    y: z.number(),
  }),
  entrySide: z.enum(["positive", "negative"]),
  allowedDirection: z.enum(["both", "entry", "exit"]),
  minimumTrackAgeMs: z.number().int().positive().optional().default(1000),
  cooldownMs: z.number().int().positive().optional().default(5000),
});

const createTransitionBody = z.object({
  fromCameraId: z.string().min(1),
  toCameraId: z.string().min(1),
  minimumTravelSeconds: z.number().int().positive(),
  maximumTravelSeconds: z.number().int().positive(),
  probability: z.number().min(0).max(1).optional().default(0.5),
  fromGateId: z.string().uuid().optional(),
  toGateId: z.string().uuid().optional(),
});

const manualCorrectionBody = z.object({
  zoneId: z.string().min(1),
  delta: z.number().int(),
  reason: z.string().min(1),
});

/**
 * Register Human Analytics API routes
 */
export async function registerHumanAnalyticsRoutes(
  app: FastifyInstance,
  pool: Pool,
): Promise<void> {
  // =========================================================================
  // Tracking Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/tracks
   * Get active person tracks
   */
  app.get<{ Querystring: z.infer<typeof trackingQueryParams> }>(
    "/api/human-analytics/tracks",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const query = trackingQueryParams.parse(request.query);

        // TODO: Implement database query for tracks
        // For now, return empty array
        return reply.send({
          tracks: [],
          total: 0,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting tracks");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/human-analytics/tracks/:cameraId
   * Get tracks for specific camera
   */
  app.get<{
    Params: z.infer<typeof cameraIdParam>;
    Querystring: z.infer<typeof trackingQueryParams>;
  }>(
    "/api/human-analytics/tracks/:cameraId",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const params = cameraIdParam.parse(request.params);
        const query = trackingQueryParams.parse(request.query);

        // TODO: Implement camera-specific track query
        return reply.send({
          cameraId: params.cameraId,
          tracks: [],
          total: 0,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting camera tracks");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // =========================================================================
  // Journey Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/journeys
   * Get cross-camera person journeys
   */
  app.get<{ Querystring: z.infer<typeof journeyQueryParams> }>(
    "/api/human-analytics/journeys",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const query = journeyQueryParams.parse(request.query);

        const conditions: string[] = ["tenant_id = $1"];
        const params: any[] = [headers["x-tenant-id"]];
        let paramIndex = 2;

        if (query.status) {
          conditions.push(`status = $${paramIndex++}`);
          params.push(query.status);
        }

        if (query.fromDate) {
          conditions.push(`started_at >= $${paramIndex++}`);
          params.push(query.fromDate);
        }

        if (query.toDate) {
          conditions.push(`started_at <= $${paramIndex++}`);
          params.push(query.toDate);
        }

        const sql = `
          SELECT 
            j.*,
            json_agg(
              json_build_object(
                'appearanceId', l.appearance_id,
                'cameraId', l.camera_id,
                'enteredAt', l.entered_at,
                'exitedAt', l.exited_at,
                'transitionConfidence', l.transition_confidence,
                'transitionReasons', l.transition_reasons,
                'sequenceOrder', l.sequence_order
              ) ORDER BY l.sequence_order
            ) as appearances
          FROM person_journeys j
          LEFT JOIN journey_appearance_links l ON j.id = l.journey_id
          WHERE ${conditions.join(" AND ")}
          GROUP BY j.id
          ORDER BY j.started_at DESC
          LIMIT $${paramIndex}
        `;

        params.push(query.limit);

        const result = await pool.query(sql, params);

        return reply.send({
          journeys: result.rows,
          total: result.rowCount || 0,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting journeys");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/human-analytics/journeys/:journeyId
   * Get specific journey details
   */
  app.get<{ Params: z.infer<typeof journeyIdParam> }>(
    "/api/human-analytics/journeys/:journeyId",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const params = journeyIdParam.parse(request.params);

        const sql = `
          SELECT 
            j.*,
            json_agg(
              json_build_object(
                'appearanceId', l.appearance_id,
                'cameraId', l.camera_id,
                'enteredAt', l.entered_at,
                'exitedAt', l.exited_at,
                'transitionConfidence', l.transition_confidence,
                'transitionReasons', l.transition_reasons,
                'sequenceOrder', l.sequence_order
              ) ORDER BY l.sequence_order
            ) as appearances
          FROM person_journeys j
          LEFT JOIN journey_appearance_links l ON j.id = l.journey_id
          WHERE j.id = $1 AND j.tenant_id = $2
          GROUP BY j.id
        `;

        const result = await pool.query(sql, [
          params.journeyId,
          headers["x-tenant-id"],
        ]);

        if (result.rowCount === 0) {
          return reply.code(404).send({
            error: "not_found",
            message: `Journey ${params.journeyId} not found`,
          });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting journey");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // =========================================================================
  // Crossing Events Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/crossings
   * Get line crossing events
   */
  app.get<{ Querystring: z.infer<typeof crossingQueryParams> }>(
    "/api/human-analytics/crossings",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const query = crossingQueryParams.parse(request.query);

        const conditions: string[] = ["tenant_id = $1"];
        const params: any[] = [headers["x-tenant-id"]];
        let paramIndex = 2;

        if (query.cameraId) {
          conditions.push(`camera_id = $${paramIndex++}`);
          params.push(query.cameraId);
        }

        if (query.gateId) {
          conditions.push(`gate_id = $${paramIndex++}`);
          params.push(query.gateId);
        }

        if (query.direction) {
          conditions.push(`direction = $${paramIndex++}`);
          params.push(query.direction);
        }

        if (query.fromDate) {
          conditions.push(`crossed_at >= $${paramIndex++}`);
          params.push(query.fromDate);
        }

        if (query.toDate) {
          conditions.push(`crossed_at <= $${paramIndex++}`);
          params.push(query.toDate);
        }

        const sql = `
          SELECT *
          FROM crossing_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY crossed_at DESC
          LIMIT $${paramIndex}
        `;

        params.push(query.limit);

        const result = await pool.query(sql, params);

        return reply.send({
          crossings: result.rows,
          total: result.rowCount || 0,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting crossings");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // =========================================================================
  // Occupancy Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/occupancy/:zoneId
   * Get current occupancy for a zone
   */
  app.get<{ Params: { zoneId: string } }>(
    "/api/human-analytics/occupancy/:zoneId",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const { zoneId } = request.params;

        const sql = `
          SELECT 
            zone_id,
            SUM(delta) as occupancy,
            MAX(timestamp) as last_updated,
            COUNT(*) as event_count
          FROM occupancy_ledger l
          JOIN sites s ON l.site_id = s.id
          WHERE s.tenant_id = $1 AND l.zone_id = $2
          GROUP BY zone_id
        `;

        const result = await pool.query(sql, [headers["x-tenant-id"], zoneId]);

        if (result.rowCount === 0) {
          return reply.send({
            zoneId,
            occupancy: 0,
            confidence: 0,
            lastUpdated: null,
          });
        }

        return reply.send({
          ...result.rows[0],
          confidence: 0.7, // TODO: Calculate actual confidence
        });
      } catch (error) {
        request.log.error({ err: error }, "Error getting occupancy");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/human-analytics/occupancy/:zoneId/history
   * Get occupancy history
   */
  app.get<{
    Params: { zoneId: string };
    Querystring: z.infer<typeof occupancyQueryParams>;
  }>(
    "/api/human-analytics/occupancy/:zoneId/history",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const { zoneId } = request.params;
        const query = occupancyQueryParams.parse(request.query);

        // TODO: Implement occupancy history calculation
        return reply.send({
          zoneId,
          history: [],
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting occupancy history");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * POST /api/human-analytics/occupancy/:zoneId/correction
   * Add manual occupancy correction
   */
  app.post<{
    Params: { zoneId: string };
    Body: z.infer<typeof manualCorrectionBody>;
  }>(
    "/api/human-analytics/occupancy/:zoneId/correction",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const { zoneId } = request.params;
        const body = manualCorrectionBody.parse(request.body);

        // TODO: Add manual correction to occupancy ledger
        return reply.send({
          success: true,
          message: "Manual correction added",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error adding manual correction");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // =========================================================================
  // Behavior Events Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/behavior-events
   * Get behavior events (fighting, panic, etc.)
   */
  app.get<{ Querystring: z.infer<typeof behaviorQueryParams> }>(
    "/api/human-analytics/behavior-events",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const query = behaviorQueryParams.parse(request.query);

        const conditions: string[] = ["tenant_id = $1"];
        const params: any[] = [headers["x-tenant-id"]];
        let paramIndex = 2;

        if (query.cameraId) {
          conditions.push(`camera_id = $${paramIndex++}`);
          params.push(query.cameraId);
        }

        if (query.eventType) {
          conditions.push(`event_type = $${paramIndex++}`);
          params.push(query.eventType);
        }

        if (query.severity) {
          conditions.push(`severity = $${paramIndex++}`);
          params.push(query.severity);
        }

        if (query.reviewStatus) {
          conditions.push(`review_status = $${paramIndex++}`);
          params.push(query.reviewStatus);
        }

        if (query.fromDate) {
          conditions.push(`started_at >= $${paramIndex++}`);
          params.push(query.fromDate);
        }

        if (query.toDate) {
          conditions.push(`started_at <= $${paramIndex++}`);
          params.push(query.toDate);
        }

        const sql = `
          SELECT *
          FROM behavior_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY started_at DESC
          LIMIT $${paramIndex}
        `;

        params.push(query.limit);

        const result = await pool.query(sql, params);

        return reply.send({
          events: result.rows,
          total: result.rowCount || 0,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error getting behavior events");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * PATCH /api/human-analytics/behavior-events/:eventId/review
   * Review a behavior event
   */
  app.patch<{
    Params: { eventId: string };
    Body: z.infer<typeof reviewEventBody>;
  }>(
    "/api/human-analytics/behavior-events/:eventId/review",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const { eventId } = request.params;
        const body = reviewEventBody.parse(request.body);

        const sql = `
          UPDATE behavior_events
          SET 
            review_status = $1,
            review_notes = $2,
            reviewed_at = NOW(),
            reviewed_by = $3
          WHERE id = $4 AND tenant_id = $5
          RETURNING *
        `;

        const result = await pool.query(sql, [
          body.status,
          body.notes || null,
          request.headers["x-user-id"] || "system",
          eventId,
          headers["x-tenant-id"],
        ]);

        if (result.rowCount === 0) {
          return reply.code(404).send({
            error: "not_found",
            message: `Event ${eventId} not found`,
          });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error reviewing event");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // =========================================================================
  // Configuration Endpoints
  // =========================================================================

  /**
   * GET /api/human-analytics/gates
   * Get counting gates
   */
  app.get("/api/human-analytics/gates", async (request, reply) => {
    try {
      const headers = tenantIdHeader.parse(request.headers);

      const sql = `
        SELECT *
        FROM counting_gates
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY camera_id, name
      `;

      const result = await pool.query(sql, [headers["x-tenant-id"]]);

      return reply.send({
        gates: result.rows,
        total: result.rowCount || 0,
      });
    } catch (error) {
      request.log.error({ err: error }, "Error getting gates");
      return reply.code(500).send({
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/human-analytics/gates
   * Create counting gate
   */
  app.post<{ Body: z.infer<typeof createGateBody> }>(
    "/api/human-analytics/gates",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const body = createGateBody.parse(request.body);

        const sql = `
          INSERT INTO counting_gates (
            tenant_id, camera_id, name,
            line_start_x, line_start_y, line_end_x, line_end_y,
            entry_side, allowed_direction,
            minimum_track_age_ms, cooldown_ms
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `;

        const result = await pool.query(sql, [
          headers["x-tenant-id"],
          body.cameraId,
          body.name,
          body.lineStart.x,
          body.lineStart.y,
          body.lineEnd.x,
          body.lineEnd.y,
          body.entrySide,
          body.allowedDirection,
          body.minimumTrackAgeMs,
          body.cooldownMs,
        ]);

        return reply.code(201).send(result.rows[0]);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error creating gate");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/human-analytics/transitions
   * Get camera transitions
   */
  app.get("/api/human-analytics/transitions", async (request, reply) => {
    try {
      const headers = tenantIdHeader.parse(request.headers);

      const sql = `
        SELECT *
        FROM camera_transitions
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY from_camera_id, to_camera_id
      `;

      const result = await pool.query(sql, [headers["x-tenant-id"]]);

      return reply.send({
        transitions: result.rows,
        total: result.rowCount || 0,
      });
    } catch (error) {
      request.log.error({ err: error }, "Error getting transitions");
      return reply.code(500).send({
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/human-analytics/transitions
   * Create camera transition
   */
  app.post<{ Body: z.infer<typeof createTransitionBody> }>(
    "/api/human-analytics/transitions",
    async (request, reply) => {
      try {
        const headers = tenantIdHeader.parse(request.headers);
        const body = createTransitionBody.parse(request.body);

        const sql = `
          INSERT INTO camera_transitions (
            tenant_id, from_camera_id, to_camera_id,
            minimum_travel_seconds, maximum_travel_seconds,
            probability, from_gate_id, to_gate_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;

        const result = await pool.query(sql, [
          headers["x-tenant-id"],
          body.fromCameraId,
          body.toCameraId,
          body.minimumTravelSeconds,
          body.maximumTravelSeconds,
          body.probability,
          body.fromGateId || null,
          body.toGateId || null,
        ]);

        return reply.code(201).send(result.rows[0]);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "validation_error",
            details: error.errors,
          });
        }

        request.log.error({ err: error }, "Error creating transition");
        return reply.code(500).send({
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/human-analytics/capabilities
   * Get analytics capabilities status
   */
  app.get("/api/human-analytics/capabilities", async (request, reply) => {
    try {
      const { getCapabilityRegistry } = await import("../capability-status.js");
      const registry = getCapabilityRegistry();

      const capabilities = registry.getAllCapabilities();
      const summary = registry.getHealthSummary();

      return reply.send({
        capabilities,
        summary,
      });
    } catch (error) {
      request.log.error({ err: error }, "Error getting capabilities");
      return reply.code(500).send({
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
