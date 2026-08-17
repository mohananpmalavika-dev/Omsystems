import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  socOperatorAnalyticsService,
  SocOperatorAnalyticsService,
} from '../services/soc-operator-analytics.service.js';
import type { SocAnalyticsFilter } from '../domain/soc-analytics.types.js';

export async function registerSocAnalyticsRoutes(
  app: FastifyInstance,
  service: SocOperatorAnalyticsService = socOperatorAnalyticsService
) {
  // Helper to extract query filters
  const extractFilter = (req: FastifyRequest): SocAnalyticsFilter => {
    const q = req.query as any;
    return {
      branchId: q.branchId,
      regionId: q.regionId,
      operatorId: q.operatorId,
      shift: q.shift,
      alertType: q.alertType,
      priority: q.priority,
      startDate: q.startDate,
      endDate: q.endDate,
    };
  };

  // 1. Fleetwide Executive SOC Summary
  app.get('/v1/analytics/soc/summary', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const period = (req.query as any)?.period || 'LAST_30_DAYS';
    const summary = await service.getDashboardSummary(period, filter);
    return { success: true, data: summary };
  });

  // 2. Metrics by Branch
  app.get('/v1/analytics/soc/by-branch', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const branches = await service.getMetricsByBranch(filter);
    return { success: true, count: branches.length, data: branches };
  });

  // 3. Metrics by Region
  app.get('/v1/analytics/soc/by-region', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const regions = await service.getMetricsByRegion(filter);
    return { success: true, count: regions.length, data: regions };
  });

  // 4. Metrics by Operator
  app.get('/v1/analytics/soc/by-operator', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const operators = await service.getMetricsByOperator(filter);
    return { success: true, count: operators.length, data: operators };
  });

  // 5. Metrics by Shift
  app.get('/v1/analytics/soc/by-shift', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const shifts = await service.getMetricsByShift(filter);
    return { success: true, count: shifts.length, data: shifts };
  });

  // 6. Metrics by Alert Type / Detector
  app.get('/v1/analytics/soc/by-alert-type', async (req: FastifyRequest) => {
    const filter = extractFilter(req);
    const alertTypes = await service.getMetricsByAlertType(filter);
    return { success: true, count: alertTypes.length, data: alertTypes };
  });

  // 7. Ingest Incident Lifecycle Record
  app.post('/v1/analytics/soc/incident-event', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      incidentId: z.string().min(1),
      priority: z.enum(['P1', 'P2', 'P3']),
      alertType: z.enum([
        'VAULT_INTRUSION',
        'LINE_CROSSING',
        'CROWD_LOITERING',
        'CAMERA_TAMPER',
        'ANPR_BLACKLIST',
        'CASH_VAN_DELAY',
        'RECORDER_OFFLINE',
        'CAMERA_OFFLINE',
        'UNAUTHORIZED_ACCESS',
      ]),
      branchId: z.string().min(1),
      regionId: z.string().min(1),
      stateId: z.string().min(1),
      operatorId: z.string().min(1),
      shift: z.enum(['MORNING', 'EVENING', 'NIGHT']),
      triggeredAt: z.string().datetime(),
      acknowledgedAt: z.string().datetime().optional(),
      investigationStartedAt: z.string().datetime().optional(),
      resolvedAt: z.string().datetime().optional(),
      isEscalated: z.boolean().default(false),
      isFalsePositive: z.boolean().default(false),
      isRepeatIncident: z.boolean().default(false),
      isSlaBreached: z.boolean().default(false),
      isSopCompliant: z.boolean().default(true),
    });

    const body = schema.parse(req.body);
    await service.recordIncidentLifecycle({
      ...body,
      triggeredAt: new Date(body.triggeredAt),
      acknowledgedAt: body.acknowledgedAt ? new Date(body.acknowledgedAt) : undefined,
      investigationStartedAt: body.investigationStartedAt ? new Date(body.investigationStartedAt) : undefined,
      resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : undefined,
    });

    return reply.code(201).send({ success: true, message: 'Incident lifecycle record ingested' });
  });
}
