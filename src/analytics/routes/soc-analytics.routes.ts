import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import type { Action } from '../../domain/models.js';
import {
  socOperatorAnalyticsService,
  SocOperatorAnalyticsService,
} from '../services/soc-operator-analytics.service.js';
import type {
  IncidentLifecycleRecord,
  SocAnalyticsFilter,
} from '../domain/soc-analytics.types.js';

const shiftSchema = z.enum(['MORNING', 'EVENING', 'NIGHT']);
const prioritySchema = z.enum(['P1', 'P2', 'P3']);
const alertTypeSchema = z.enum([
  'VAULT_INTRUSION',
  'LINE_CROSSING',
  'CROWD_LOITERING',
  'CAMERA_TAMPER',
  'ANPR_BLACKLIST',
  'CASH_VAN_DELAY',
  'RECORDER_OFFLINE',
  'CAMERA_OFFLINE',
  'UNAUTHORIZED_ACCESS',
]);
const socQuerySchema = z.object({
  period: z.enum([
    'LAST_24_HOURS', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'ALL_TIME', 'CUSTOM',
  ]).default('LAST_30_DAYS'),
  branchId: z.string().trim().min(1).max(200).optional(),
  regionId: z.string().trim().min(1).max(200).optional(),
  operatorId: z.string().trim().min(1).max(200).optional(),
  shift: shiftSchema.optional(),
  alertType: alertTypeSchema.optional(),
  priority: prioritySchema.optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && Date.parse(value.startDate) > Date.parse(value.endDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate' });
  }
  if (value.period === 'CUSTOM' && !value.startDate && !value.endDate) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'CUSTOM period requires a date boundary' });
  }
});

const incidentLifecycleSchema = z.object({
  incidentId: z.string().trim().min(1).max(200),
  priority: prioritySchema,
  alertType: alertTypeSchema,
  branchId: z.string().trim().min(1).max(200),
  regionId: z.string().trim().min(1).max(200),
  stateId: z.string().trim().min(1).max(100),
  operatorId: z.string().trim().min(1).max(200),
  operatorName: z.string().trim().min(1).max(200).optional(),
  operatorRole: z.enum(['SOC_OPERATOR', 'SOC_SUPERVISOR', 'CHIEF_SECURITY_OFFICER']).optional(),
  branchName: z.string().trim().min(1).max(200).optional(),
  regionName: z.string().trim().min(1).max(200).optional(),
  shift: shiftSchema,
  triggeredAt: z.string().datetime({ offset: true }),
  acknowledgedAt: z.string().datetime({ offset: true }).optional(),
  investigationStartedAt: z.string().datetime({ offset: true }).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  isEscalated: z.boolean().default(false),
  isFalsePositive: z.boolean().default(false),
  isRepeatIncident: z.boolean().default(false),
  isSlaBreached: z.boolean().default(false),
  isSopCompliant: z.boolean().default(true),
}).superRefine((value, context) => {
  const triggeredAt = Date.parse(value.triggeredAt);
  const acknowledgedAt = value.acknowledgedAt ? Date.parse(value.acknowledgedAt) : undefined;
  const investigationAt = value.investigationStartedAt ? Date.parse(value.investigationStartedAt) : undefined;
  const resolvedAt = value.resolvedAt ? Date.parse(value.resolvedAt) : undefined;
  if ([acknowledgedAt, investigationAt, resolvedAt].some((time) => time !== undefined && time < triggeredAt) ||
      (acknowledgedAt !== undefined && investigationAt !== undefined && investigationAt < acknowledgedAt)) {
    context.addIssue({
      code: 'custom', path: ['triggeredAt'], message: 'Lifecycle timestamps must be chronological',
    });
  }
});

export async function registerSocAnalyticsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  service: SocOperatorAnalyticsService = socOperatorAnalyticsService
) {
  const authorize = async (req: FastifyRequest, reply: FastifyReply, action: Action) => {
    const companies = await store.listAccessibleNodes(req.currentUser, action, 'company');
    if (companies.length > 0) return true;
    await reply.code(403).send({ success: false, error: 'forbidden' });
    return false;
  };

  // Helper to extract query filters
  const extractRequest = (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = socQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      void invalidRequest(reply, parsed.error);
      return undefined;
    }
    const q = parsed.data;
    const range = queryRange(q);
    const filter: SocAnalyticsFilter = {
      tenantId: req.currentUser.tenantId,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.regionId ? { regionId: q.regionId } : {}),
      ...(q.operatorId ? { operatorId: q.operatorId } : {}),
      ...(q.shift ? { shift: q.shift } : {}),
      ...(q.alertType ? { alertType: q.alertType } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(range.startDate ? { startDate: range.startDate } : {}),
      ...(range.endDate ? { endDate: range.endDate } : {}),
    };
    return { query: q, filter };
  };

  // 1. Fleetwide Executive SOC Summary
  app.get('/v1/analytics/soc/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const summary = await service.getDashboardSummary(context.query.period, context.filter);
    return { success: true, data: summary };
  });

  // 2. Metrics by Branch
  app.get('/v1/analytics/soc/by-branch', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const branches = await service.getMetricsByBranch(context.filter);
    return { success: true, count: branches.length, data: branches };
  });

  // 3. Metrics by Region
  app.get('/v1/analytics/soc/by-region', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const regions = await service.getMetricsByRegion(context.filter);
    return { success: true, count: regions.length, data: regions };
  });

  // 4. Metrics by Operator
  app.get('/v1/analytics/soc/by-operator', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const operators = await service.getMetricsByOperator(context.filter);
    return { success: true, count: operators.length, data: operators };
  });

  // 5. Metrics by Shift
  app.get('/v1/analytics/soc/by-shift', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const shifts = await service.getMetricsByShift(context.filter);
    return { success: true, count: shifts.length, data: shifts };
  });

  // 6. Metrics by Alert Type / Detector
  app.get('/v1/analytics/soc/by-alert-type', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:view')) return;
    const context = extractRequest(req, reply);
    if (!context) return;
    const alertTypes = await service.getMetricsByAlertType(context.filter);
    return { success: true, count: alertTypes.length, data: alertTypes };
  });

  // 7. Ingest Incident Lifecycle Record
  app.post('/v1/analytics/soc/incident-event', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!await authorize(req, reply, 'analytics:configure')) return;
    const parsed = incidentLifecycleSchema.safeParse(req.body);
    if (!parsed.success) return invalidRequest(reply, parsed.error);
    const body = parsed.data;
    const record: IncidentLifecycleRecord = {
      tenantId: req.currentUser.tenantId,
      incidentId: body.incidentId!,
      priority: body.priority!,
      alertType: body.alertType!,
      branchId: body.branchId!,
      regionId: body.regionId!,
      stateId: body.stateId!,
      operatorId: body.operatorId!,
      shift: body.shift!,
      triggeredAt: new Date(body.triggeredAt!),
      isEscalated: body.isEscalated ?? false,
      isFalsePositive: body.isFalsePositive ?? false,
      isRepeatIncident: body.isRepeatIncident ?? false,
      isSlaBreached: body.isSlaBreached ?? false,
      isSopCompliant: body.isSopCompliant ?? true,
      ...(body.operatorName ? { operatorName: body.operatorName } : {}),
      ...(body.operatorRole ? { operatorRole: body.operatorRole } : {}),
      ...(body.branchName ? { branchName: body.branchName } : {}),
      ...(body.regionName ? { regionName: body.regionName } : {}),
      ...(body.acknowledgedAt ? { acknowledgedAt: new Date(body.acknowledgedAt) } : {}),
      ...(body.investigationStartedAt
        ? { investigationStartedAt: new Date(body.investigationStartedAt) }
        : {}),
      ...(body.resolvedAt ? { resolvedAt: new Date(body.resolvedAt) } : {}),
    };
    await service.recordIncidentLifecycle(record);

    return reply.code(201).send({ success: true, message: 'Incident lifecycle record ingested' });
  });
}

function queryRange(query: z.infer<typeof socQuerySchema>) {
  if (query.startDate || query.endDate || query.period === 'ALL_TIME' || query.period === 'CUSTOM') {
    return { startDate: query.startDate, endDate: query.endDate };
  }
  const durations = {
    LAST_24_HOURS: 24 * 60 * 60 * 1_000,
    LAST_7_DAYS: 7 * 24 * 60 * 60 * 1_000,
    LAST_30_DAYS: 30 * 24 * 60 * 60 * 1_000,
    LAST_90_DAYS: 90 * 24 * 60 * 60 * 1_000,
  } as const;
  const duration = durations[query.period];
  const end = new Date();
  return {
    startDate: new Date(end.getTime() - duration).toISOString(),
    endDate: end.toISOString(),
  };
}

function invalidRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    success: false,
    error: 'invalid_request',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}
