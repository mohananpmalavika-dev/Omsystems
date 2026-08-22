/**
 * Internal Notifications Route
 * 
 * POST /internal/notifications endpoint
 * Accepts notification requests from analytics engine and other services
 * 
 * Security:
 * - Service JWT authentication required
 * - Capability-based authorization
 * - Replay protection
 * - Idempotency enforcement
 * - Rate limiting
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NotificationService } from '../notification.service.js';
import { NotificationRequest, NotificationResult } from '../notification.types.js';
import { ValidationError } from '../notification.errors.js';
import { logger } from '../../utils/logger.js';
import {
  InternalNotificationCommand,
  InternalNotificationResult,
  InternalNotificationService,
  createServiceAuthMiddleware,
  createCapabilityMiddleware,
  getServicePrincipal,
  ServiceAuthError,
  ServiceAuthorizationError,
  RateLimitExceededError,
  IdempotencyConflictError,
  ReplayDetectedError,
} from '../../security/service-auth/index.js';

export async function registerInternalNotificationsRoute(
  fastify: FastifyInstance,
  notificationService: NotificationService,
  internalNotificationService: InternalNotificationService,
  serviceAuthMiddleware: ReturnType<typeof createServiceAuthMiddleware>,
  requireNotificationCapability: ReturnType<typeof createCapabilityMiddleware>
) {
  /**
   * Enqueue notification (secure service-to-service endpoint)
   * 
   * Security boundary:
   * - JWT authentication required
   * - notifications:create capability required
   * - Tenant authorization enforced
   * - Purpose restrictions enforced
   * - Replay protection
   * - Idempotency enforcement
   * - Rate limiting
   * 
   * Returns 202 Accepted with notification ID
   */
  fastify.post<{
    Body: InternalNotificationCommand;
    Reply: InternalNotificationResult | { error: string; code?: string };
  }>(
    '/internal/notifications',
    {
      preHandler: [
        serviceAuthMiddleware,
        requireNotificationCapability,
      ],
      schema: {
        body: {
          type: 'object',
          required: [
            'tenantId',
            'purpose',
            'eventId',
            'templateId',
            'recipientRefs',
            'data',
            'idempotencyKey',
            'occurredAt'
          ],
          properties: {
            tenantId: { type: 'string', minLength: 1 },
            purpose: {
              type: 'string',
              enum: [
                'ALERT_ESCALATION',
                'INCIDENT_CREATED',
                'DEVICE_OFFLINE',
                'RECORDING_FAILURE',
                'COMPLIANCE_VIOLATION',
                'SECURITY_EVENT',
                'HEALTH_CHECK_FAILED',
                'SYSTEM_MAINTENANCE',
                'USER_ACTION_REQUIRED',
              ]
            },
            eventId: { type: 'string', minLength: 1 },
            templateId: { type: 'string', minLength: 1 },
            recipientRefs: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
              maxItems: 100
            },
            data: { type: 'object' },
            idempotencyKey: { type: 'string', minLength: 1, maxLength: 255 },
            occurredAt: { type: 'string', format: 'date-time' },
            metadata: { type: 'object' }
          },
          additionalProperties: false
        },
        response: {
          202: {
            type: 'object',
            properties: {
              notificationId: { type: 'string' },
              duplicate: { type: 'boolean' },
              status: { type: 'string', enum: ['accepted', 'queued'] },
              acceptedAt: { type: 'string', format: 'date-time' }
            }
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' }
            }
          },
          401: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              message: { type: 'string' }
            }
          },
          403: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              message: { type: 'string' }
            }
          },
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              message: { type: 'string' }
            }
          },
          429: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              message: { type: 'string' },
              limitType: { type: 'string' },
              limit: { type: 'number' },
              resetsAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    },
    async (
      request: FastifyRequest<{ Body: InternalNotificationCommand }>,
      reply: FastifyReply
    ) => {
      try {
        // Get authenticated service principal (attached by middleware)
        const principal = getServicePrincipal(request);

        // Submit notification through security boundary
        const result = await internalNotificationService.submit({
          principal,
          command: request.body,
        });

        logger.info('Internal notification accepted', {
          serviceId: principal.serviceId,
          notificationId: result.notificationId,
          tenantId: request.body.tenantId,
          purpose: request.body.purpose,
          duplicate: result.duplicate,
        });

        return reply.code(202).send(result);
      } catch (error) {
        // Handle specific error types with appropriate status codes
        if (error instanceof ServiceAuthError) {
          return reply.code(error.statusCode).send({
            error: 'Unauthorized',
            code: error.code,
            message: error.message,
          });
        }

        if (error instanceof ServiceAuthorizationError) {
          return reply.code(error.statusCode).send({
            error: 'Forbidden',
            code: error.code,
            message: error.message,
          });
        }

        if (error instanceof RateLimitExceededError) {
          return reply.code(429).send({
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED',
            message: error.message,
            limitType: error.limitType,
            limit: error.limit,
            resetsAt: error.resetsAt.toISOString(),
          });
        }

        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: 'IDEMPOTENCY_CONFLICT',
            message: error.message,
          });
        }

        if (error instanceof ReplayDetectedError) {
          return reply.code(401).send({
            error: 'Unauthorized',
            code: 'REPLAY_DETECTED',
            message: error.message,
          });
        }

        if (error instanceof ValidationError) {
          logger.warn('Invalid internal notification request', {
            error: error.message,
            body: request.body,
          });
          return reply.code(400).send({
            error: 'Bad Request',
            code: 'VALIDATION_ERROR',
            message: error.message,
          });
        }

        // Generic error
        logger.error('Failed to process internal notification', {
          error: error instanceof Error ? error.message : String(error),
          serviceId: request.servicePrincipal?.serviceId,
          tenantId: request.body.tenantId,
        });

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process notification',
        });
      }
    }
  );

  /**
   * Get notification status
   */
  fastify.get<{
    Params: { notificationId: string };
    Querystring: { tenantId: string };
  }>(
    '/internal/notifications/:notificationId',
    async (request, reply) => {
      const { notificationId } = request.params;
      const { tenantId } = request.query;

      if (!tenantId) {
        return reply.code(400).send({ error: 'tenantId query parameter required' });
      }

      const notification = await notificationService.getNotification(
        notificationId,
        tenantId
      );

      if (!notification) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      const deliveries = await notificationService.getDeliveries(
        notificationId,
        tenantId
      );

      return reply.send({
        notification,
        deliveries
      });
    }
  );

  /**
   * Get delivery status
   */
  fastify.get<{
    Params: { deliveryId: string };
    Querystring: { tenantId: string };
  }>(
    '/internal/notifications/deliveries/:deliveryId',
    async (request, reply) => {
      const { deliveryId } = request.params;
      const { tenantId } = request.query;

      if (!tenantId) {
        return reply.code(400).send({ error: 'tenantId query parameter required' });
      }

      const delivery = await notificationService.getDeliveryStatus(
        deliveryId,
        tenantId
      );

      if (!delivery) {
        return reply.code(404).send({ error: 'Delivery not found' });
      }

      return reply.send(delivery);
    }
  );

  /**
   * Cancel delivery
   */
  fastify.post<{
    Params: { deliveryId: string };
    Body: { tenantId: string };
  }>(
    '/internal/notifications/deliveries/:deliveryId/cancel',
    async (request, reply) => {
      const { deliveryId } = request.params;
      const { tenantId } = request.body;

      if (!tenantId) {
        return reply.code(400).send({ error: 'tenantId required in body' });
      }

      const cancelled = await notificationService.cancelDelivery(
        deliveryId,
        tenantId
      );

      if (!cancelled) {
        return reply.code(404).send({ error: 'Delivery not found or cannot be cancelled' });
      }

      return reply.send({ success: true });
    }
  );

  logger.info('Internal notifications route registered');
}
