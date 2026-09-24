/**
 * MindSense API Routes
 * 
 * Emotional intelligence and de-escalation coaching endpoints:
 * - Real-time emotional state monitoring
 * - Behavioral intent recognition
 * - Threat assessment
 * - De-escalation coaching recommendations
 * - Micro-expression analysis
 * - Stress and deception indicators
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { MindSenseDeEscalationService } from "../services/mindsense-deescalation.service.js";

// Request validation schemas
const emotionalStateQuerySchema = z.object({
  cameraIds: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  minStressLevel: z.number().min(0).max(1).optional(),
  emotions: z.array(z.string()).optional(),
  includeTimeline: z.boolean().default(false),
});

const personEmotionalProfileSchema = z.object({
  cameraId: z.string().min(1),
  personTrackId: z.string().min(1),
  includeHistory: z.boolean().default(true),
  includeMicroExpressions: z.boolean().default(true),
});

const coachingRequestSchema = z.object({
  cameraId: z.string().min(1),
  personTrackId: z.string().min(1),
  situationType: z.enum([
    "aggressive-customer",
    "distressed-person",
    "suspicious-behavior",
    "verbal-conflict",
    "medical-emergency",
    "theft-confrontation",
    "unauthorized-access",
    "crowd-control",
    "mental-health-crisis",
    "domestic-dispute",
  ]),
  currentPhase: z.enum([
    "assessment",
    "approach",
    "engagement",
    "resolution",
    "monitoring",
    "handoff",
  ]).optional(),
});

const threatAssessmentQuerySchema = z.object({
  cameraIds: z.array(z.string()).optional(),
  minThreatScore: z.number().min(0).max(1).default(0.6),
  threatLevels: z.array(z.enum(["low", "medium", "high", "critical"])).optional(),
  includeTrajectory: z.boolean().default(false),
});

const emotionalHeatmapSchema = z.object({
  branchId: z.string().optional(),
  cameraIds: z.array(z.string()).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  emotion: z.string().optional(),
  resolution: z.enum(["high", "medium", "low"]).default("medium"),
});

const microExpressionQuerySchema = z.object({
  cameraId: z.string().min(1),
  personTrackId: z.string().min(1),
  minDuration: z.number().min(40).max(500).optional(),
  emotions: z.array(z.string()).optional(),
});

export async function registerMindSenseRoutes(app: FastifyInstance, pool: Pool) {
  const deescalationService = new MindSenseDeEscalationService(pool);

  /**
   * GET /api/v1/mindsense/emotional-states
   * 
   * Query current emotional states across cameras
   * Real-time monitoring of emotions, stress, and deception
   */
  app.get("/api/v1/mindsense/emotional-states", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const query = emotionalStateQuerySchema.parse(request.query);

      // Build SQL query
      let sql = `
        SELECT 
          es.id,
          es.camera_id,
          c.name as camera_name,
          es.person_track_id,
          es.emotion,
          es.confidence,
          es.valence,
          es.arousal,
          es.intensity,
          es.stress_score,
          es.deception_score,
          es.timestamp,
          es.action_units,
          es.micro_expressions
        FROM mindsense_emotional_states es
        JOIN cameras c ON es.camera_id = c.id
        WHERE c.tenant_id = $1
      `;

      const params: any[] = [user.tenantId];
      let paramIndex = 2;

      if (query.cameraIds && query.cameraIds.length > 0) {
        sql += ` AND es.camera_id = ANY($${paramIndex})`;
        params.push(query.cameraIds);
        paramIndex++;
      }

      if (query.startTime) {
        sql += ` AND es.timestamp >= $${paramIndex}`;
        params.push(query.startTime);
        paramIndex++;
      }

      if (query.endTime) {
        sql += ` AND es.timestamp <= $${paramIndex}`;
        params.push(query.endTime);
        paramIndex++;
      }

      if (query.minStressLevel !== undefined) {
        sql += ` AND es.stress_score >= $${paramIndex}`;
        params.push(query.minStressLevel);
        paramIndex++;
      }

      if (query.emotions && query.emotions.length > 0) {
        sql += ` AND es.emotion = ANY($${paramIndex})`;
        params.push(query.emotions);
        paramIndex++;
      }

      sql += ` ORDER BY es.timestamp DESC LIMIT 100`;

      const { rows } = await pool.query(sql, params);

      return {
        success: true,
        data: {
          emotionalStates: rows.map(row => ({
            id: row.id,
            cameraId: row.camera_id,
            cameraName: row.camera_name,
            personTrackId: row.person_track_id,
            emotion: row.emotion,
            confidence: parseFloat(row.confidence),
            valence: parseFloat(row.valence),
            arousal: parseFloat(row.arousal),
            intensity: parseFloat(row.intensity),
            stressScore: parseFloat(row.stress_score),
            deceptionScore: parseFloat(row.deception_score),
            timestamp: row.timestamp,
            actionUnits: row.action_units,
            microExpressions: query.includeMicroExpressions ? row.micro_expressions : undefined,
          })),
          count: rows.length,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to query emotional states");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/person/:trackId/emotional-profile
   * 
   * Get detailed emotional profile for a specific person
   * Includes timeline, micro-expressions, and behavioral patterns
   */
  app.get("/api/v1/mindsense/person/:trackId/emotional-profile", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const { trackId } = request.params as { trackId: string };
      const query = z.object({
        cameraId: z.string().min(1),
        includeHistory: z.string().transform(v => v === "true").default("true"),
        includeMicroExpressions: z.string().transform(v => v === "true").default("true"),
      }).parse(request.query);

      // Get current emotional profile
      const { rows: profileRows } = await pool.query(
        `SELECT 
          ep.*,
          c.name as camera_name
        FROM mindsense_emotional_profiles ep
        JOIN cameras c ON ep.camera_id = c.id
        WHERE ep.person_track_id = $1 
          AND ep.camera_id = $2
          AND c.tenant_id = $3
        ORDER BY ep.last_seen DESC
        LIMIT 1`,
        [trackId, query.cameraId, user.tenantId]
      );

      if (profileRows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: "profile_not_found",
        });
      }

      const profile = profileRows[0];

      // Get emotional timeline if requested
      let timeline = [];
      if (query.includeHistory) {
        const { rows: timelineRows } = await pool.query(
          `SELECT * FROM mindsense_emotional_timeline
          WHERE person_track_id = $1
          ORDER BY timestamp DESC
          LIMIT 100`,
          [trackId]
        );
        timeline = timelineRows;
      }

      // Get micro-expressions if requested
      let microExpressions = [];
      if (query.includeMicroExpressions) {
        const { rows: microRows } = await pool.query(
          `SELECT * FROM mindsense_micro_expressions
          WHERE person_track_id = $1
          ORDER BY start_time DESC
          LIMIT 50`,
          [trackId]
        );
        microExpressions = microRows;
      }

      return {
        success: true,
        data: {
          personTrackId: profile.person_track_id,
          cameraId: profile.camera_id,
          cameraName: profile.camera_name,
          currentEmotion: {
            emotion: profile.current_emotion,
            confidence: parseFloat(profile.emotion_confidence),
            valence: parseFloat(profile.valence),
            arousal: parseFloat(profile.arousal),
            intensity: parseFloat(profile.intensity),
          },
          stressIndicators: profile.stress_indicators,
          deceptionIndicators: profile.deception_indicators,
          dominantEmotion: profile.dominant_emotion,
          emotionDistribution: profile.emotion_distribution,
          averageValence: parseFloat(profile.average_valence),
          averageArousal: parseFloat(profile.average_arousal),
          emotionalStability: parseFloat(profile.emotional_stability),
          firstSeen: profile.first_seen,
          lastSeen: profile.last_seen,
          frameCount: profile.frame_count,
          timeline: timeline.map(t => ({
            timestamp: t.timestamp,
            emotion: t.emotion,
            confidence: parseFloat(t.confidence),
            valence: parseFloat(t.valence),
            arousal: parseFloat(t.arousal),
            intensity: parseFloat(t.intensity),
            isMicroExpression: t.is_micro_expression,
          })),
          microExpressions: microExpressions.map(me => ({
            id: me.id,
            startTime: me.start_time,
            endTime: me.end_time,
            duration: me.duration,
            emotion: me.emotion,
            confidence: parseFloat(me.confidence),
            maskedBy: me.masked_by,
            isGenuine: me.is_genuine,
          })),
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to get emotional profile");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/threat-assessment
   * 
   * Get current threat assessments across cameras
   * Real-time monitoring of behavioral threats
   */
  app.get("/api/v1/mindsense/threat-assessment", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const query = threatAssessmentQuerySchema.parse(request.query);

      let sql = `
        SELECT 
          ta.id,
          ta.camera_id,
          c.name as camera_name,
          ta.person_track_id,
          ta.intent,
          ta.confidence,
          ta.threat_level,
          ta.threat_score,
          ta.indicators,
          ta.recommended_action,
          ta.monitoring_priority,
          ta.alert_security,
          ta.timestamp,
          ta.trajectory
        FROM mindsense_threat_assessments ta
        JOIN cameras c ON ta.camera_id = c.id
        WHERE c.tenant_id = $1
          AND ta.threat_score >= $2
      `;

      const params: any[] = [user.tenantId, query.minThreatScore];
      let paramIndex = 3;

      if (query.cameraIds && query.cameraIds.length > 0) {
        sql += ` AND ta.camera_id = ANY($${paramIndex})`;
        params.push(query.cameraIds);
        paramIndex++;
      }

      if (query.threatLevels && query.threatLevels.length > 0) {
        sql += ` AND ta.threat_level = ANY($${paramIndex})`;
        params.push(query.threatLevels);
        paramIndex++;
      }

      sql += ` ORDER BY ta.threat_score DESC, ta.timestamp DESC LIMIT 50`;

      const { rows } = await pool.query(sql, params);

      return {
        success: true,
        data: {
          threats: rows.map(row => ({
            id: row.id,
            cameraId: row.camera_id,
            cameraName: row.camera_name,
            personTrackId: row.person_track_id,
            intent: row.intent,
            confidence: parseFloat(row.confidence),
            threatLevel: row.threat_level,
            threatScore: parseFloat(row.threat_score),
            indicators: row.indicators,
            recommendedAction: row.recommended_action,
            monitoringPriority: row.monitoring_priority,
            alertSecurity: row.alert_security,
            timestamp: row.timestamp,
            trajectory: query.includeTrajectory ? row.trajectory : undefined,
          })),
          count: rows.length,
          summary: {
            critical: rows.filter(r => r.threat_level === "critical").length,
            high: rows.filter(r => r.threat_level === "high").length,
            medium: rows.filter(r => r.threat_level === "medium").length,
          },
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to query threat assessments");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * POST /api/v1/mindsense/coaching/recommendation
   * 
   * Get real-time de-escalation coaching recommendation
   * Provides situation-aware guidance for security staff
   */
  app.post("/api/v1/mindsense/coaching/recommendation", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = coachingRequestSchema.parse(request.body);

      // Verify camera access
      const { rows: cameras } = await pool.query(
        "SELECT id FROM cameras WHERE id = $1 AND tenant_id = $2",
        [body.cameraId, user.tenantId]
      );

      if (cameras.length === 0) {
        return reply.code(404).send({
          success: false,
          error: "camera_not_found",
        });
      }

      // Get emotional state
      const { rows: emotionalStates } = await pool.query(
        `SELECT * FROM mindsense_emotional_states
        WHERE camera_id = $1 AND person_track_id = $2
        ORDER BY timestamp DESC LIMIT 1`,
        [body.cameraId, body.personTrackId]
      );

      if (emotionalStates.length === 0) {
        return reply.code(404).send({
          success: false,
          error: "emotional_state_not_found",
          message: "No emotional data available for this person",
        });
      }

      const emotionalState = emotionalStates[0];

      // Get threat assessment
      const { rows: threats } = await pool.query(
        `SELECT * FROM mindsense_threat_assessments
        WHERE camera_id = $1 AND person_track_id = $2
        ORDER BY timestamp DESC LIMIT 1`,
        [body.cameraId, body.personTrackId]
      );

      const threatAssessment = threats[0] || {
        intent: "benign",
        threat_level: "none",
        threat_score: 0,
        indicators: {},
      };

      // Get coaching recommendation
      const recommendation = await deescalationService.getCoachingRecommendation({
        cameraId: body.cameraId,
        personTrackId: body.personTrackId,
        situationType: body.situationType,
        emotionalState: {
          emotion: emotionalState.emotion,
          stressLevel: parseFloat(emotionalState.stress_score),
          deceptionScore: parseFloat(emotionalState.deception_score),
          arousal: parseFloat(emotionalState.arousal),
          valence: parseFloat(emotionalState.valence),
        },
        behaviorContext: {
          intent: threatAssessment.intent,
          threatLevel: threatAssessment.threat_level,
          threatScore: parseFloat(threatAssessment.threat_score),
          indicators: threatAssessment.indicators,
        },
        securityStaffId: user.id,
      });

      return {
        success: true,
        data: recommendation,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to generate coaching recommendation");
      return reply.code(500).send({
        success: false,
        error: "coaching_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/coaching/playbooks
   * 
   * Get all available de-escalation playbooks
   */
  app.get("/api/v1/mindsense/coaching/playbooks", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const playbooks = deescalationService.getAllPlaybooks();

      return {
        success: true,
        data: {
          playbooks: playbooks.map(p => ({
            id: p.id,
            name: p.name,
            situationType: p.situationType,
            description: p.description,
            phases: p.phases,
            culturalConsiderations: p.culturalConsiderations,
            emergencyContacts: p.emergencyContacts,
          })),
          count: playbooks.length,
        },
      };
    } catch (error) {
      app.log.error({ error }, "[MindSense] Failed to get playbooks");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/coaching/techniques
   * 
   * Get all available de-escalation techniques
   */
  app.get("/api/v1/mindsense/coaching/techniques", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const techniques = deescalationService.getAllTechniques();

      return {
        success: true,
        data: {
          techniques: techniques.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            whenToUse: t.whenToUse,
            howToExecute: t.howToExecute,
            warnings: t.warnings,
            examples: t.examples,
            successRate: t.successRate,
          })),
          count: techniques.length,
        },
      };
    } catch (error) {
      app.log.error({ error }, "[MindSense] Failed to get techniques");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * POST /api/v1/mindsense/heatmap/emotional
   * 
   * Generate emotional heat map for location analysis
   */
  app.post("/api/v1/mindsense/heatmap/emotional", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = emotionalHeatmapSchema.parse(request.body);

      // Query emotional states for heatmap generation
      let sql = `
        SELECT 
          es.camera_id,
          c.name as camera_name,
          c.location_x,
          c.location_y,
          es.emotion,
          es.stress_score,
          COUNT(*) as occurrence_count,
          AVG(es.stress_score) as avg_stress,
          AVG(es.arousal) as avg_arousal,
          AVG(es.valence) as avg_valence
        FROM mindsense_emotional_states es
        JOIN cameras c ON es.camera_id = c.id
        WHERE c.tenant_id = $1
          AND es.timestamp >= $2
          AND es.timestamp <= $3
      `;

      const params: any[] = [user.tenantId, body.startTime, body.endTime];
      let paramIndex = 4;

      if (body.cameraIds && body.cameraIds.length > 0) {
        sql += ` AND es.camera_id = ANY($${paramIndex})`;
        params.push(body.cameraIds);
        paramIndex++;
      }

      if (body.emotion) {
        sql += ` AND es.emotion = $${paramIndex}`;
        params.push(body.emotion);
        paramIndex++;
      }

      sql += `
        GROUP BY es.camera_id, c.name, c.location_x, c.location_y, es.emotion
        ORDER BY avg_stress DESC
      `;

      const { rows } = await pool.query(sql, params);

      // Generate heatmap data structure
      const heatmap = rows.map(row => ({
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        location: {
          x: parseFloat(row.location_x),
          y: parseFloat(row.location_y),
        },
        emotion: row.emotion,
        occurrenceCount: parseInt(row.occurrence_count),
        avgStress: parseFloat(row.avg_stress),
        avgArousal: parseFloat(row.avg_arousal),
        avgValence: parseFloat(row.avg_valence),
        intensity: parseFloat(row.avg_stress) * parseInt(row.occurrence_count) / 100,
      }));

      return {
        success: true,
        data: {
          heatmap,
          timeRange: {
            start: body.startTime,
            end: body.endTime,
          },
          summary: {
            totalDataPoints: heatmap.reduce((sum, h) => sum + h.occurrenceCount, 0),
            highStressZones: heatmap.filter(h => h.avgStress > 0.7).length,
            cameras: heatmap.length,
          },
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to generate emotional heatmap");
      return reply.code(500).send({
        success: false,
        error: "heatmap_failed",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/analytics/stress-hotspots
   * 
   * Identify stress hotspots - zones with consistently high stress levels
   */
  app.get("/api/v1/mindsense/analytics/stress-hotspots", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const query = z.object({
        startTime: z.string().datetime().optional(),
        endTime: z.string().datetime().optional(),
        minStressThreshold: z.string().transform(v => parseFloat(v)).default("0.6"),
        limit: z.string().transform(v => parseInt(v)).default("10"),
      }).parse(request.query);

      const sql = `
        SELECT 
          es.camera_id,
          c.name as camera_name,
          c.zone_name,
          COUNT(*) as high_stress_count,
          AVG(es.stress_score) as avg_stress_score,
          MAX(es.stress_score) as peak_stress_score,
          COUNT(DISTINCT es.person_track_id) as unique_persons,
          ARRAY_AGG(DISTINCT es.emotion) as emotions_observed
        FROM mindsense_emotional_states es
        JOIN cameras c ON es.camera_id = c.id
        WHERE c.tenant_id = $1
          AND es.stress_score >= $2
          ${query.startTime ? "AND es.timestamp >= $3" : ""}
          ${query.endTime ? `AND es.timestamp <= $${query.startTime ? 4 : 3}` : ""}
        GROUP BY es.camera_id, c.name, c.zone_name
        HAVING COUNT(*) >= 5
        ORDER BY avg_stress_score DESC, high_stress_count DESC
        LIMIT $${query.startTime && query.endTime ? 5 : query.startTime || query.endTime ? 4 : 3}
      `;

      const params: any[] = [user.tenantId, query.minStressThreshold];
      if (query.startTime) params.push(query.startTime);
      if (query.endTime) params.push(query.endTime);
      params.push(query.limit);

      const { rows } = await pool.query(sql, params);

      return {
        success: true,
        data: {
          hotspots: rows.map(row => ({
            cameraId: row.camera_id,
            cameraName: row.camera_name,
            zoneName: row.zone_name,
            highStressCount: parseInt(row.high_stress_count),
            avgStressScore: parseFloat(row.avg_stress_score),
            peakStressScore: parseFloat(row.peak_stress_score),
            uniquePersons: parseInt(row.unique_persons),
            emotionsObserved: row.emotions_observed,
            severity: parseFloat(row.avg_stress_score) > 0.8 ? "critical" : 
                     parseFloat(row.avg_stress_score) > 0.7 ? "high" : "medium",
          })),
          count: rows.length,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to identify stress hotspots");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  /**
   * GET /api/v1/mindsense/micro-expressions
   * 
   * Query micro-expressions for deception analysis
   */
  app.get("/api/v1/mindsense/micro-expressions", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const query = microExpressionQuerySchema.parse(request.query);

      const { rows } = await pool.query(
        `SELECT 
          me.*,
          c.name as camera_name
        FROM mindsense_micro_expressions me
        JOIN mindsense_emotional_profiles ep ON me.person_track_id = ep.person_track_id
        JOIN cameras c ON ep.camera_id = c.id
        WHERE c.tenant_id = $1
          AND me.person_track_id = $2
          AND ep.camera_id = $3
          ${query.minDuration ? "AND me.duration >= $4" : ""}
          ${query.emotions && query.emotions.length > 0 ? `AND me.emotion = ANY($${query.minDuration ? 5 : 4})` : ""}
        ORDER BY me.start_time DESC
        LIMIT 50`,
        [
          user.tenantId,
          query.personTrackId,
          query.cameraId,
          ...(query.minDuration ? [query.minDuration] : []),
          ...(query.emotions && query.emotions.length > 0 ? [query.emotions] : []),
        ]
      );

      return {
        success: true,
        data: {
          microExpressions: rows.map(row => ({
            id: row.id,
            personTrackId: row.person_track_id,
            startTime: row.start_time,
            endTime: row.end_time,
            duration: row.duration,
            emotion: row.emotion,
            confidence: parseFloat(row.confidence),
            maskedBy: row.masked_by,
            isGenuine: row.is_genuine,
            actionUnits: row.action_units,
          })),
          count: rows.length,
          analysis: {
            totalMicroExpressions: rows.length,
            genuine: rows.filter(r => r.is_genuine).length,
            masked: rows.filter(r => !r.is_genuine).length,
            avgDuration: rows.length > 0 
              ? rows.reduce((sum, r) => sum + r.duration, 0) / rows.length 
              : 0,
          },
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[MindSense] Failed to query micro-expressions");
      return reply.code(500).send({
        success: false,
        error: "query_failed",
      });
    }
  });

  app.log.info("[MindSense] Routes registered successfully");
}
