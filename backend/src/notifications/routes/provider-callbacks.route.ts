/**
 * Provider Callback Routes
 * 
 * Handles delivery receipt webhooks from external providers:
 * - Twilio SMS status updates
 * - FCM push delivery receipts
 * - Email bounce notifications
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { NotificationRepository } from '../notification.repository.js';
import { logger } from '../../utils/logger.js';

export async function registerProviderCallbackRoutes(
  fastify: FastifyInstance,
  repository: NotificationRepository
) {
  /**
   * Twilio SMS Status Callback
   * https://www.twilio.com/docs/sms/api/message-resource#message-status-values
   */
  fastify.post<{
    Body: {
      MessageSid: string;
      MessageStatus: string;
      ErrorCode?: string;
      ErrorMessage?: string;
    };
  }>(
    '/internal/notification-providers/twilio/status',
    async (request, reply) => {
      try {
        const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = request.body;

        // Find delivery by provider message ID
        const deliveries = await repository.pool.query(
          `SELECT id, tenant_id, status
          FROM notification_deliveries
          WHERE provider_message_id = $1
            AND channel = 'sms'
            AND provider = 'twilio'`,
          [MessageSid]
        );

        if (deliveries.rows.length === 0) {
          logger.warn('Twilio callback for unknown message', { MessageSid });
          return reply.code(200).send({ received: true });
        }

        const delivery = deliveries.rows[0];

        // Map Twilio status to our status
        let newStatus: string | null = null;

        switch (MessageStatus) {
          case 'delivered':
            newStatus = 'delivered';
            break;
          case 'failed':
          case 'undelivered':
            newStatus = 'failed';
            break;
          case 'sent':
            newStatus = 'accepted';
            break;
          // Don't update for intermediate states
          case 'queued':
          case 'sending':
          case 'accepted':
            break;
        }

        if (newStatus && delivery.status !== newStatus) {
          await repository.updateDeliveryStatus(
            delivery.id,
            newStatus as any,
            {
              deliveredAt: newStatus === 'delivered' ? new Date() : undefined,
              failedAt: newStatus === 'failed' ? new Date() : undefined,
              lastError: ErrorMessage,
              lastErrorCode: ErrorCode
            }
          );

          logger.info('Twilio delivery status updated', {
            deliveryId: delivery.id,
            messageSid: MessageSid,
            status: newStatus,
            errorCode: ErrorCode
          });
        }

        return reply.code(200).send({ received: true });
      } catch (error) {
        logger.error('Twilio callback processing failed', { error });
        return reply.code(500).send({ error: 'Internal error' });
      }
    }
  );

  /**
   * FCM Push Token Invalidation
   * Called when a push token is no longer valid
   */
  fastify.post<{
    Body: {
      token: string;
      reason: string;
    };
  }>(
    '/internal/notification-providers/fcm/invalidate',
    async (request, reply) => {
      try {
        const { token, reason } = request.body;

        await repository.deactivatePushDevice(token);

        logger.info('Push device deactivated', {
          token: token.substring(0, 20) + '...',
          reason
        });

        return reply.code(200).send({ deactivated: true });
      } catch (error) {
        logger.error('FCM invalidation failed', { error });
        return reply.code(500).send({ error: 'Internal error' });
      }
    }
  );

  /**
   * Email Bounce Handler (for SMTP/SES/SendGrid)
   * Handles bounce notifications to deactivate invalid email addresses
   */
  fastify.post<{
    Body: {
      type: 'bounce' | 'complaint';
      email: string;
      bounceType?: 'permanent' | 'temporary';
      diagnosticCode?: string;
    };
  }>(
    '/internal/notification-providers/email/bounce',
    async (request, reply) => {
      try {
        const { type, email, bounceType, diagnosticCode } = request.body;

        // For permanent bounces, mark all pending deliveries as failed
        if (type === 'bounce' && bounceType === 'permanent') {
          const result = await repository.pool.query(
            `UPDATE notification_deliveries
            SET 
              status = 'failed',
              failed_at = NOW(),
              last_error = $2
            WHERE channel = 'email'
              AND destination = $1
              AND status IN ('pending', 'retry_wait')
            RETURNING id`,
            [email, `Permanent bounce: ${diagnosticCode || 'Invalid email address'}`]
          );

          logger.warn('Email address permanently bounced', {
            email,
            failedDeliveries: result.rowCount,
            diagnosticCode
          });
        }

        return reply.code(200).send({ processed: true });
      } catch (error) {
        logger.error('Email bounce processing failed', { error });
        return reply.code(500).send({ error: 'Internal error' });
      }
    }
  );

  /**
   * Webhook for validating callback signatures
   */
  function validateTwilioSignature(
    request: FastifyRequest,
    authToken: string
  ): boolean {
    const signature = request.headers['x-twilio-signature'] as string;
    
    if (!signature) {
      return false;
    }

    // Build validation string
    const url = `https://${request.hostname}${request.url}`;
    const params = request.body as Record<string, string>;
    
    let validationString = url;
    Object.keys(params).sort().forEach(key => {
      validationString += key + params[key];
    });

    // Compute expected signature
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(validationString);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  }

  logger.info('Provider callback routes registered');
}
