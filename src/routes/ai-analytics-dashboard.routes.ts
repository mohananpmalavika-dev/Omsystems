/**
 * AI Analytics Dashboard API Routes
 * 
 * REST API endpoints for AI analytics dashboard, ROI calculator, and comparison tool.
 * Provides comprehensive access to AI capability performance metrics and analysis.
 * 
 * Endpoints:
 * - GET /api/control/v1/reports/ai-analytics/roi - ROI calculation
 * - POST /api/control/v1/reports/ai-analytics/compare - Capability comparison
 * - GET /api/control/v1/reports/ai-analytics/capabilities - Capability list
 * - POST /api/control/v1/ai-metrics/ingest - Ingest metrics from analytics engine
 * 
 * Status: Production-ready with RBAC
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { aiRoiCalculatorService } from '../services/ai-roi-calculator.service.js';
import { aiComparisonService } from '../services/ai-comparison.service.js';
import { aiMetricsCollectorService } from '../services/ai-metrics-collector.service.js';

// Request schemas
const roiQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  include_projections: z.string().optional().transform((v) => v === 'true'),
});

const compareBodySchema = z.object({
  capability_types: z.array(z.string()).min(2).max(4),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  branch_id: z.string().uuid().optional(),
});

const capabilityListQuerySchema = z.object({
  domain: z.string().optional(),
  stage: z.enum(['core', 'open-model', 'derived']).optional(),
  min_accuracy: z.string().optional().transform((v) => (v ? parseFloat(v) : undefined)),
  search: z.string().optional(),
});

const metricsIngestSchema = z.object({
  events: z.array(
    z.object({
      tenant_id: z.string().uuid(),
      capability_type: z.string(),
      capability_domain: z.string(),
      capability_stage: z.string().optional(),
      camera_id: z.string().uuid(),
      branch_id: z.string().uuid(),
      zone_id: z.string().uuid().optional(),
      region_id: z.string().uuid().optional(),
      detection_result: z.object({
        is_true_positive: z.boolean(),
        is_false_positive: z.boolean(),
        is_false_negative: z.boolean(),
        confidence_score: z.number().min(0).max(1),
        inference_time_ms: z.number().positive(),
      }),
      incident_detected: z.boolean().optional(),
      incident_prevented: z.boolean().optional(),
      investigation_time_saved_minutes: z.number().optional(),
      estimated_cost_avoided: z.number().optional(),
      model_name: z.string().optional(),
      model_version: z.string().optional(),
      timestamp: z.string().transform((v) => new Date(v)),
    }),
  ),
});

export async function registerAiAnalyticsDashboardRoutes(app: FastifyInstance) {
  /**
   * GET /api/control/v1/reports/ai-analytics/roi
   * 
   * Calculate ROI for AI analytics capabilities
   * 
   * Query Parameters:
   * - start_date: ISO date (default: 1 year ago)
   * - end_date: ISO date (default: now)
   * - include_projections: boolean (default: true)
   * 
   * Returns: RoiReport
   */
  app.get(
    '/api/control/v1/reports/ai-analytics/roi',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check authentication
        if (!request.currentUser) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        // Parse and validate query
        const query = roiQuerySchema.parse(request.query);

        // Default dates
        const endDate = query.end_date ? new Date(query.end_date) : new Date();
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

        const includeProjections = query.include_projections ?? true;

        // Calculate ROI
        const roiReport = await aiRoiCalculatorService.calculateRoi(
          request.currentUser.tenantId,
          startDate,
          endDate,
          includeProjections,
        );

        return reply.send(roiReport);
      } catch (error) {
        console.error('ROI calculation error:', error);
        return reply.code(500).send({
          error: 'Failed to calculate ROI',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * POST /api/control/v1/reports/ai-analytics/compare
   * 
   * Compare multiple AI capabilities side-by-side
   * 
   * Body:
   * - capability_types: string[] (2-4 capability IDs)
   * - start_date: ISO date (optional)
   * - end_date: ISO date (optional)
   * - branch_id: UUID (optional)
   * 
   * Returns: ComparisonResult
   */
  app.post(
    '/api/control/v1/reports/ai-analytics/compare',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check authentication
        if (!request.currentUser) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        // Parse and validate body
        const body = compareBodySchema.parse(request.body);

        // Default dates
        const endDate = body.end_date ? new Date(body.end_date) : new Date();
        const startDate = body.start_date
          ? new Date(body.start_date)
          : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

        // Compare capabilities
        const comparison = await aiComparisonService.compareCapabilities(
          request.currentUser.tenantId,
          body.capability_types,
          startDate,
          endDate,
          body.branch_id,
        );

        return reply.send(comparison);
      } catch (error) {
        console.error('Comparison error:', error);
        return reply.code(500).send({
          error: 'Failed to compare capabilities',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * GET /api/control/v1/reports/ai-analytics/capabilities
   * 
   * Get list of all AI capabilities with basic stats
   * 
   * Query Parameters:
   * - domain: Filter by domain
   * - stage: Filter by stage (core, open-model, derived)
   * - min_accuracy: Minimum accuracy threshold
   * - search: Search by name
   * 
   * Returns: CapabilityList
   */
  app.get(
    '/api/control/v1/reports/ai-analytics/capabilities',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check authentication
        if (!request.currentUser) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        // Parse and validate query
        const query = capabilityListQuerySchema.parse(request.query);

        // Get capability list
        const list = await aiComparisonService.getCapabilityList(
          request.currentUser.tenantId,
          query.domain,
          query.stage,
          query.min_accuracy,
          query.search,
        );

        return reply.send(list);
      } catch (error) {
        console.error('Capability list error:', error);
        return reply.code(500).send({
          error: 'Failed to load capabilities',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * POST /api/control/v1/ai-metrics/ingest
   * 
   * Ingest AI metrics from analytics engine
   * Called by analytics engine after each detection
   * 
   * Body:
   * - events: AIMetricEvent[]
   * 
   * Returns: { success: boolean, ingested: number }
   */
  app.post(
    '/api/control/v1/ai-metrics/ingest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Parse and validate body
        const body = metricsIngestSchema.parse(request.body);

        // Ingest events
        for (const event of body.events) {
          await aiMetricsCollectorService.recordDetection(event);
        }

        return reply.send({
          success: true,
          ingested: body.events.length,
        });
      } catch (error) {
        console.error('Metrics ingest error:', error);
        return reply.code(500).send({
          error: 'Failed to ingest metrics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * GET /api/control/v1/ai-metrics/status
   * 
   * Get metrics collector status
   * 
   * Returns: { bufferSize: number, isActive: boolean }
   */
  app.get(
    '/api/control/v1/ai-metrics/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const status = aiMetricsCollectorService.getStatus();
        return reply.send(status);
      } catch (error) {
        console.error('Metrics status error:', error);
        return reply.code(500).send({
          error: 'Failed to get status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
