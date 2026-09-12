/**
 * Fastify REST API Routes for Crowd Density & Queue Length Detection (analytics.crowd)
 * 
 * Production endpoints for branch hall spatial density estimation, counter queue depth tracking,
 * real-time frame observation ingestion, threshold breach incidents, and operator review actions.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { CrowdService } from '../analytics/crowd/crowd-service.js';

export async function registerCrowdAnalyticsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const crowdService = new CrowdService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // ============================================================================
  // 1. ZONES CRUD
  // ============================================================================

  const listZonesQuerySchema = z.object({
    branchId: z.string().optional(),
  });

  app.get('/v1/analytics/crowd/zones', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listZonesQuerySchema.parse(request.query);
      const zones = await crowdService.listZones(tenantId, query.branchId);
      return reply.send({ success: true, data: zones });
    } catch (error) {
      request.log.error({ error }, 'Failed to list crowd zones');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  const zoneBodySchema = z.object({
    id: z.string().optional(),
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    zoneName: z.string().min(2),
    zoneType: z.enum([
      'branch_hall',
      'waiting_lounge',
      'atm_vestibule',
      'teller_area',
      'kiosk_zone',
      'entrance_foyer',
      'corridor',
    ]),
    polygon: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    areaSqm: z.number().positive().default(50.0),
    nominalCapacity: z.number().int().min(1).default(20),
    warningCapacity: z.number().int().min(1).default(35),
    maxCapacity: z.number().int().min(1).default(50),
    enabled: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/v1/analytics/crowd/zones', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = zoneBodySchema.parse(request.body);

      if (body.id) {
        const updated = await crowdService.updateZone(body.id, tenantId, {
          branch_id: body.branchId || null,
          camera_id: body.cameraId || null,
          zone_name: body.zoneName,
          zone_type: body.zoneType,
          polygon: body.polygon,
          area_sqm: body.areaSqm,
          nominal_capacity: body.nominalCapacity,
          warning_capacity: body.warningCapacity,
          max_capacity: body.maxCapacity,
          enabled: body.enabled,
          metadata: body.metadata || {},
        });
        if (!updated) {
          return reply.code(404).send({ success: false, error: 'Zone not found' });
        }
        return reply.send({ success: true, data: updated });
      }

      const created = await crowdService.createZone({
        tenant_id: tenantId,
        branch_id: body.branchId || null,
        camera_id: body.cameraId || null,
        zone_name: body.zoneName,
        zone_type: body.zoneType,
        polygon: body.polygon,
        area_sqm: body.areaSqm,
        nominal_capacity: body.nominalCapacity,
        warning_capacity: body.warningCapacity,
        max_capacity: body.maxCapacity,
        enabled: body.enabled,
        metadata: body.metadata || {},
      });

      return reply.code(201).send({ success: true, data: created });
    } catch (error) {
      request.log.error({ error }, 'Failed to upsert crowd zone');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.delete('/v1/analytics/crowd/zones/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const deleted = await crowdService.deleteZone(request.params.id, tenantId);
      if (!deleted) {
        return reply.code(404).send({ success: false, error: 'Zone not found' });
      }
      return reply.send({ success: true, data: { deleted: true } });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 2. COUNTER QUEUES CRUD
  // ============================================================================

  const listQueuesQuerySchema = z.object({
    branchId: z.string().optional(),
  });

  app.get('/v1/analytics/crowd/queues', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQueuesQuerySchema.parse(request.query);
      const queues = await crowdService.listCounterQueues(tenantId, query.branchId);
      return reply.send({ success: true, data: queues });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  const queueBodySchema = z.object({
    id: z.string().optional(),
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    counterNumber: z.string().min(1),
    counterName: z.string().min(2),
    counterType: z.enum([
      'cash_deposit',
      'cash_withdrawal',
      'general_teller',
      'forex_remittance',
      'loan_desk',
      'account_services',
      'customer_support',
    ]),
    queuePolygon: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    serviceStationPolygon: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    maxQueueLengthThreshold: z.number().int().min(1).default(5),
    maxWaitTimeSecondsThreshold: z.number().int().min(30).default(300),
    alertSeverity: z.enum(['P1', 'P2', 'P3']).default('P2'),
    enabled: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/v1/analytics/crowd/queues', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = queueBodySchema.parse(request.body);

      if (body.id) {
        const updated = await crowdService.updateCounterQueue(body.id, tenantId, {
          branch_id: body.branchId || null,
          camera_id: body.cameraId || null,
          counter_number: body.counterNumber,
          counter_name: body.counterName,
          counter_type: body.counterType,
          queue_polygon: body.queuePolygon,
          service_station_polygon: body.serviceStationPolygon,
          max_queue_length_threshold: body.maxQueueLengthThreshold,
          max_wait_time_seconds_threshold: body.maxWaitTimeSecondsThreshold,
          alert_severity: body.alertSeverity,
          enabled: body.enabled,
          metadata: body.metadata || {},
        });
        if (!updated) {
          return reply.code(404).send({ success: false, error: 'Counter queue not found' });
        }
        return reply.send({ success: true, data: updated });
      }

      const created = await crowdService.createCounterQueue({
        tenant_id: tenantId,
        branch_id: body.branchId || null,
        camera_id: body.cameraId || null,
        counter_number: body.counterNumber,
        counter_name: body.counterName,
        counter_type: body.counterType,
        queue_polygon: body.queuePolygon,
        service_station_polygon: body.serviceStationPolygon,
        max_queue_length_threshold: body.maxQueueLengthThreshold,
        max_wait_time_seconds_threshold: body.maxWaitTimeSecondsThreshold,
        alert_severity: body.alertSeverity,
        enabled: body.enabled,
        metadata: body.metadata || {},
      });

      return reply.code(201).send({ success: true, data: created });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.delete('/v1/analytics/crowd/queues/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const deleted = await crowdService.deleteCounterQueue(request.params.id, tenantId);
      if (!deleted) {
        return reply.code(404).send({ success: false, error: 'Counter queue not found' });
      }
      return reply.send({ success: true, data: { deleted: true } });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 3. LIVE ANALYSIS & OBSERVATION INGESTION
  // ============================================================================

  const analyzeFrameSchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
    persons: z.array(
      z.object({
        trackId: z.string(),
        boundingBox: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
        confidence: z.number().optional(),
        velocity: z.object({ x: z.number(), y: z.number() }).optional(),
      })
    ),
    snapshotUrl: z.string().optional(),
  });

  app.post('/v1/analytics/crowd/analyze-frame', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = analyzeFrameSchema.parse(request.body);

      const result = await crowdService.analyzeFrame({
        tenantId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        persons: body.persons,
        snapshotUrl: body.snapshotUrl,
      });

      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ error }, 'Frame crowd analysis failed');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 4. LIVE STATUS
  // ============================================================================

  const liveQuerySchema = z.object({
    branchId: z.string().optional(),
  });

  app.get('/v1/analytics/crowd/live', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = liveQuerySchema.parse(request.query);
      const live = await crowdService.getLiveStatus(tenantId, query.branchId);
      return reply.send({ success: true, data: live });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 5. HISTORICAL METRICS
  // ============================================================================

  const historyDensityQuerySchema = z.object({
    branchId: z.string().optional(),
    zoneId: z.string().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  });

  app.get('/v1/analytics/crowd/density-history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = historyDensityQuerySchema.parse(request.query);

      const data = await crowdService.getHistoricalDensity(
        tenantId,
        query.branchId,
        query.zoneId,
        query.fromDate ? new Date(query.fromDate) : undefined,
        query.toDate ? new Date(query.toDate) : undefined,
        query.limit
      );

      return reply.send({ success: true, data });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  const historyQueueQuerySchema = z.object({
    branchId: z.string().optional(),
    queueId: z.string().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  });

  app.get('/v1/analytics/crowd/queue-metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = historyQueueQuerySchema.parse(request.query);

      const data = await crowdService.getHistoricalQueueMetrics(
        tenantId,
        query.branchId,
        query.queueId,
        query.fromDate ? new Date(query.fromDate) : undefined,
        query.toDate ? new Date(query.toDate) : undefined,
        query.limit
      );

      return reply.send({ success: true, data });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 6. OPERATIONAL INCIDENTS & REVIEW
  // ============================================================================

  const listIncidentsQuerySchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    incidentType: z
      .enum([
        'crowd_density_exceeded',
        'queue_length_exceeded',
        'wait_time_sla_breach',
        'unattended_counter_with_queue',
        'stampede_risk_bottleneck',
      ])
      .optional(),
    severity: z.enum(['P1', 'P2', 'P3']).optional(),
    reviewStatus: z.enum(['pending', 'acknowledged', 'resolved', 'false_positive']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/crowd/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listIncidentsQuerySchema.parse(request.query);

      const result = await crowdService.listIncidents({
        tenantId,
        branchId: query.branchId,
        cameraId: query.cameraId,
        incidentType: query.incidentType,
        severity: query.severity,
        reviewStatus: query.reviewStatus,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        success: true,
        data: result.incidents,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.get('/v1/analytics/crowd/incidents/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const incident = await crowdService.getIncidentById(request.params.id, tenantId);
      if (!incident) {
        return reply.code(404).send({ success: false, error: 'Incident not found' });
      }
      return reply.send({ success: true, data: incident });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  const reviewBodySchema = z.object({
    reviewStatus: z.enum(['acknowledged', 'resolved', 'false_positive']),
    resolutionNotes: z.string().max(1000).optional(),
  });

  app.post('/v1/analytics/crowd/incidents/:id/review', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = reviewBodySchema.parse(request.body);

      const updated = await crowdService.reviewIncident(
        request.params.id,
        tenantId,
        body.reviewStatus,
        userId,
        body.resolutionNotes
      );

      if (!updated) {
        return reply.code(404).send({ success: false, error: 'Incident not found' });
      }

      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Review action failed',
      });
    }
  });

  // ============================================================================
  // 7. KPIS, STATS & RECOMMENDATIONS
  // ============================================================================

  const statsQuerySchema = z.object({
    branchId: z.string().optional(),
  });

  app.get('/v1/analytics/crowd/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = statsQuerySchema.parse(request.query);
      const stats = await crowdService.getStats(tenantId, query.branchId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.get('/v1/analytics/crowd/recommendations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = statsQuerySchema.parse(request.query);
      const live = await crowdService.getLiveStatus(tenantId, query.branchId);
      return reply.send({ success: true, data: live.recommendations });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // ============================================================================
  // 8. CONFIGURATION
  // ============================================================================

  app.get('/v1/analytics/crowd/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const config = await crowdService.getConfig(tenantId);
      if (!config) {
        return reply.send({
          success: true,
          data: {
            tenant_id: tenantId,
            branch_id: null,
            default_queue_threshold: 5,
            default_wait_time_threshold_seconds: 300,
            density_warning_percentage: 70,
            density_critical_percentage: 90,
            bottleneck_speed_threshold: 0.15,
            sla_target_compliance_percentage: 95.0,
            alert_cooldown_seconds: 60,
            auto_recommend_extra_counters: true,
            isDefault: true,
          },
        });
      }
      return reply.send({ success: true, data: config });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  const updateConfigSchema = z.object({
    branchId: z.string().optional(),
    defaultQueueThreshold: z.number().int().min(1).default(5),
    defaultWaitTimeThresholdSeconds: z.number().int().min(30).default(300),
    densityWarningPercentage: z.number().int().min(20).default(70),
    densityCriticalPercentage: z.number().int().min(30).default(90),
    bottleneckSpeedThreshold: z.number().min(0.01).default(0.15),
    slaTargetCompliancePercentage: z.number().min(50).max(100).default(95.0),
    alertCooldownSeconds: z.number().int().min(10).default(60),
    autoRecommendExtraCounters: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  });

  app.put('/v1/analytics/crowd/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = updateConfigSchema.parse(request.body);

      const config = await crowdService.upsertConfig({
        tenant_id: tenantId,
        branch_id: body.branchId || null,
        default_queue_threshold: body.defaultQueueThreshold,
        default_wait_time_threshold_seconds: body.defaultWaitTimeThresholdSeconds,
        density_warning_percentage: body.densityWarningPercentage,
        density_critical_percentage: body.densityCriticalPercentage,
        bottleneck_speed_threshold: body.bottleneckSpeedThreshold,
        sla_target_compliance_percentage: body.slaTargetCompliancePercentage,
        alert_cooldown_seconds: body.alertCooldownSeconds,
        auto_recommend_extra_counters: body.autoRecommendExtraCounters,
        metadata: body.metadata || {},
      });

      return reply.send({ success: true, data: config });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });
}
