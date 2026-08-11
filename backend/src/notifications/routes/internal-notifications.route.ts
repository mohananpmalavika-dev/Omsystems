/**
 * Internal Notifications Route
 * 
 * POST /internal/notifications endpoint
 * Accepts notification requests from analytics engine and other services
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NotificationService } from '../notification.service.js';
import { NotificationRequest, NotificationResult } from '../notification.types.js';
import { ValidationError } from '../notification.errors.js';
import { logger } from '../../utils/logger.js';

export async function registerInternalNotificationsRoute(
  fastify: FastifyInstance,
  notificationService: NotificationService
) {
  /**
   * Enqueue notification
   * 
   * Accepts notification request and returns 202 Accepted
   * The notification is durably persisted but not yet delivered
   */
  fastify.post<{
    Body: NotificationRequest;
    Reply: NotificationResult | { error: string };
  }>(
    '/internal/notifications',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'type', 'channels', 'recipient', 'body'],
          properties: {
            tenantId: { type: 'string' },
            type: { type: 'string' },
            channels: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['email', 'sms', 'push', 'webhook', 'in_app']
              }
            },
            recipient: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                pushToken: { type: 'string' },
                webhookUrl: { type: 'string' }
              }
            },
            subject: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            templateId: { type: 'string' },
            templateData: { type: 'object' },
            metadata: { type: 'object' },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high', 'critical']
            },
            idempotencyKey: { type: 'string' },
            source: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                id: { type: 'string' }
              }
            }
          }
        },
        response: {
          202: {
            type: 'object',
            properties: {
              notificationId: { type: 'string' },
              deliveryIds: {
                type: 'array',
                items: { type: 'string' }
              },
              status: { type: 'string', enum: ['queued'] }
            }
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' }
            }
          }
        }
      }
    },
    async (
      request: FastifyRequest<{ Body: NotificationRequest }>,
      reply: FastifyReply
    ) => {
      try {
        // Verify internal API key (if configured)
        const apiKey = request.headers['x-analytics-engine-key'] as string;
        
        // TODO: Validate API key against configured value
        // if (apiKey !== process.env.INTERNAL_API_KEY) {
        //   return reply.code(401).send({ error: 'Unauthorized' });
        // }

        const result = await notificationService.enqueue(request.body);

        logger.info('Notification enqueued via API', {
          notificationId: result.notificationId,
          tenantId: request.body.tenantId,
          type: request.body.type,
          channels: request.body.channels,
          deliveries: result.deliveryIds.length
        });

        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof ValidationError) {
          logger.warn('Invalid notification request', {
            error: error.message,
            body: request.body
          });
          return reply.code(400).send({ error: error.message });
        }

        logger.error('Failed to enqueue notification', {
          error,
          body: request.body
        });

        return reply.code(500).send({ error: 'Internal server error' });
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
