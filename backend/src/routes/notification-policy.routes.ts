/**
 * Notification Policy API Routes
 * Comprehensive endpoints for notification and escalation management
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  NotificationChannel,
  AlertSeverity,
  PolicyStatus,
  ScopeType,
} from '../notifications/domain/notification.types.js';
import { NotificationPolicyEngine } from '../notifications/services/notification-policy-engine.service.js';
import { NotificationRepository } from '../notifications/repositories/notification.repository.js';
import { EscalationEngine } from '../notifications/services/escalation-engine.service.js';
import { logger } from '../utils/logger.js';

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const notificationChannelSchema = z.enum(['dashboard', 'email', 'sms', 'voice', 'push', 'webhook']);
const alertSeveritySchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5']);
const scopeTypeSchema = z.enum(['TENANT', 'REGION', 'BRANCH', 'DEVICE', 'CAMERA', 'ALERT_TYPE']);

const notificationRuleSchema = z.object({
  channels: z.array(notificationChannelSchema),
  recipientGroupIds: z.array(z.string().uuid()),
  templateId: z.string().uuid().optional(),
  requireAcknowledgement: z.boolean().default(false),
  repeatUntilAcknowledged: z.boolean().default(false),
  customTemplate: z.object({
    subject: z.string().optional(),
    body: z.string(),
  }).optional(),
});

const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  timezone: z.string(),
  bypassSeverities: z.array(alertSeveritySchema),
});

const escalationStepSchema = z.object({
  afterSeconds: z.number().int().min(0),
  recipientGroupIds: z.array(z.string().uuid()),
  channels: z.array(notificationChannelSchema),
  stopOnAcknowledgement: z.boolean().default(true),
  customMessage: z.string().optional(),
});

const escalationPolicySchema = z.object({
  acknowledgeRequired: z.boolean(),
  steps: z.array(escalationStepSchema),
  maximumAttempts: z.number().int().min(1).max(10).optional(),
});

const policyScopeSchema = z.object({
  type: scopeTypeSchema,
  regionIds: z.array(z.string().uuid()).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  deviceIds: z.array(z.string().uuid()).optional(),
  cameraIds: z.array(z.string().uuid()).optional(),
  alertTypes: z.array(z.string()).optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  scope: policyScopeSchema.optional(),
  p1Rule: notificationRuleSchema.optional(),
  p2Rule: notificationRuleSchema.optional(),
  p3Rule: notificationRuleSchema.optional(),
  p4Rule: notificationRuleSchema.optional(),
  p5Rule: notificationRuleSchema.optional(),
  quietHours: quietHoursSchema.optional(),
  rateLimits: z.object({
    perMinute: z.number().int().min(1).max(10000),
    perRecipientPerMinute: z.number().int().min(1).max(100),
  }).optional(),
  p1Escalation: escalationPolicySchema.optional(),
  p2Escalation: escalationPolicySchema.optional(),
  p3Escalation: escalationPolicySchema.optional(),
  p4Escalation: escalationPolicySchema.optional(),
  p5Escalation: escalationPolicySchema.optional(),
});

const updatePolicySchema = createPolicySchema.partial();

const recipientMemberSchema = z.object({
  userId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  voiceNumber: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  preferredLanguage: z.string().length(2).default('en'),
  enabled: z.boolean().default(true),
}).refine(
  data => data.email || data.phone || data.voiceNumber,
  { message: 'At least one contact method (email, phone, or voiceNumber) is required' }
);

const createRecipientGroupSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  scopeType: scopeTypeSchema.optional(),
  scopeRegionIds: z.array(z.string().uuid()).optional(),
  scopeBranchIds: z.array(z.string().uuid()).optional(),
  scopeAlertTypes: z.array(z.string()).optional(),
  members: z.array(recipientMemberSchema).min(1),
});

// =====================================================
// ROUTE HANDLER
// =====================================================

export async function notificationPolicyRoutes(app: FastifyInstance) {
  const repository = new NotificationRepository(app.pg.pool);
  const policyEngine = new NotificationPolicyEngine();
  const escalationEngine = new EscalationEngine(repository, null); // notificationService will be injected

  // =====================================================
  // NOTIFICATION POLICIES
  // =====================================================

  /**
   * List notification policies for tenant
   */
  app.get('/v1/notification-policies', async (request, reply) => {
    const { status } = z.object({
      status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).optional(),
    }).parse(request.query);

    const policies = await repository.getTenantPolicies(
      request.currentUser.tenantId,
      status
    );

    return { data: policies };
  });

  /**
   * Get specific notification policy
   */
  app.get('/v1/notification-policies/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const policy = await repository.getPolicy(id);

    if (!policy) {
      return reply.code(404).send({ error: 'Policy not found' });
    }

    if (policy.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    return { data: policy };
  });

  /**
   * Create notification policy
   */
  app.post('/v1/notification-policies', async (request, reply) => {
    const input = createPolicySchema.parse(request.body);

    // Validate policy
    const defaultRule = {
      channels: [],
      recipientGroupIds: [],
      requireAcknowledgement: false,
      repeatUntilAcknowledged: false,
    };

    const policyToValidate = {
      ...input,
      tenantId: request.currentUser.tenantId,
      p1Rule: input.p1Rule || defaultRule,
      p2Rule: input.p2Rule || defaultRule,
      p3Rule: input.p3Rule || defaultRule,
      p4Rule: input.p4Rule || defaultRule,
      p5Rule: input.p5Rule || defaultRule,
    };

    const validation = policyEngine.validatePolicy(policyToValidate);

    if (!validation.valid) {
      return reply.code(400).send({
        error: 'Policy validation failed',
        details: validation.errors,
      });
    }

    const policy = await repository.createPolicy({
      ...input,
      tenantId: request.currentUser.tenantId,
    });

    // Audit log
    await repository.createAuditLog({
      tenantId: request.currentUser.tenantId,
      actorId: request.currentUser.id,
      action: 'POLICY_CREATED',
      resourceType: 'POLICY',
      resourceId: policy.id,
      newValue: policy,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    logger.info('Notification policy created', {
      policyId: policy.id,
      name: policy.name,
      createdBy: request.currentUser.email,
    });

    return { data: policy };
  });

  /**
   * Update notification policy
   */
  app.put('/v1/notification-policies/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = updatePolicySchema.parse(request.body);

    const existingPolicy = await repository.getPolicy(id);

    if (!existingPolicy) {
      return reply.code(404).send({ error: 'Policy not found' });
    }

    if (existingPolicy.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    if (existingPolicy.status === 'PUBLISHED') {
      return reply.code(400).send({
        error: 'Cannot modify published policy. Create a new version or archive it first.',
      });
    }

    const updatedPolicy = await repository.updatePolicy(id, input);

    // Audit log
    await repository.createAuditLog({
      tenantId: request.currentUser.tenantId,
      actorId: request.currentUser.id,
      action: 'POLICY_UPDATED',
      resourceType: 'POLICY',
      resourceId: id,
      previousValue: existingPolicy,
      newValue: updatedPolicy,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    logger.info('Notification policy updated', {
      policyId: id,
      updatedBy: request.currentUser.email,
    });

    return { data: updatedPolicy };
  });

  /**
   * Validate notification policy
   */
  app.post('/v1/notification-policies/:id/validate', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const policy = await repository.getPolicy(id);

    if (!policy) {
      return reply.code(404).send({ error: 'Policy not found' });
    }

    if (policy.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const validation = policyEngine.validatePolicy(policy);

    return {
      valid: validation.valid,
      errors: validation.errors,
    };
  });

  /**
   * Publish notification policy
   */
  app.post('/v1/notification-policies/:id/publish', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const policy = await repository.getPolicy(id);

    if (!policy) {
      return reply.code(404).send({ error: 'Policy not found' });
    }

    if (policy.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    if (policy.status === 'PUBLISHED') {
      return reply.code(400).send({ error: 'Policy is already published' });
    }

    // Validate before publishing
    const validation = policyEngine.validatePolicy(policy);

    if (!validation.valid) {
      return reply.code(400).send({
        error: 'Cannot publish invalid policy',
        details: validation.errors,
      });
    }

    const publishedPolicy = await repository.publishPolicy(id, request.currentUser.id);

    // Audit log
    await repository.createAuditLog({
      tenantId: request.currentUser.tenantId,
      actorId: request.currentUser.id,
      action: 'POLICY_PUBLISHED',
      resourceType: 'POLICY',
      resourceId: id,
      newValue: { status: 'PUBLISHED', publishedAt: new Date() },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    logger.info('Notification policy published', {
      policyId: id,
      publishedBy: request.currentUser.email,
    });

    return { data: publishedPolicy };
  });

  // =====================================================
  // RECIPIENT GROUPS
  // =====================================================

  /**
   * List recipient groups
   */
  app.get('/v1/notification-recipient-groups', async (request, reply) => {
    const groups = await repository.getTenantRecipientGroups(request.currentUser.tenantId);
    return { data: groups };
  });

  /**
   * Get specific recipient group
   */
  app.get('/v1/notification-recipient-groups/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const group = await repository.getRecipientGroup(id);

    if (group.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    return { data: group };
  });

  /**
   * Create recipient group
   */
  app.post('/v1/notification-recipient-groups', async (request, reply) => {
    const input = createRecipientGroupSchema.parse(request.body);

    const group = await repository.createRecipientGroup({
      ...input,
      tenantId: request.currentUser.tenantId,
    });

    // Audit log
    await repository.createAuditLog({
      tenantId: request.currentUser.tenantId,
      actorId: request.currentUser.id,
      action: 'RECIPIENT_GROUP_CREATED',
      resourceType: 'RECIPIENT_GROUP',
      resourceId: group.id,
      newValue: group,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    logger.info('Recipient group created', {
      groupId: group.id,
      name: group.name,
      memberCount: input.members.length,
      createdBy: request.currentUser.email,
    });

    return { data: group };
  });

  // =====================================================
  // NOTIFICATION DELIVERIES
  // =====================================================

  /**
   * Get notification deliveries for an incident
   */
  app.get('/v1/incidents/:incidentId/notifications', async (request, reply) => {
    const { incidentId } = z.object({ incidentId: z.string().uuid() }).parse(request.params);

    const deliveries = await repository.getIncidentDeliveries(incidentId);

    return { data: deliveries };
  });

  /**
   * Get escalation status for an incident
   */
  app.get('/v1/incidents/:incidentId/escalation', async (request, reply) => {
    const { incidentId } = z.object({ incidentId: z.string().uuid() }).parse(request.params);

    const escalationStatus = await escalationEngine.getEscalationStatus(incidentId);

    return { data: escalationStatus };
  });

}
