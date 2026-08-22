/**
 * Webhook Provider
 * 
 * Sends HTTP POST webhooks to customer endpoints
 * Includes SSRF protection and HMAC signatures
 */

import crypto from 'crypto';
import {
  NotificationProvider,
  DeliveryRequest,
  DeliveryResult,
  WebhookConfig
} from '../notification.types.js';
import { classifyWebhookError } from '../notification.errors.js';
import { logger } from '../../utils/logger.js';

export class WebhookProvider implements NotificationProvider {
  readonly channel = 'webhook' as const;
  readonly name = 'webhook';

  private signatureSecret?: string;
  private userAgent: string;

  // SSRF protection: block private IP ranges
  private readonly blockedHosts = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fe80:/i,
    /^fc00:/i
  ];

  constructor(config: WebhookConfig) {
    this.signatureSecret = config.signatureSecret;
    this.userAgent = config.userAgent;

    logger.info('Webhook provider initialized', {
      hasSignatureSecret: !!this.signatureSecret,
      userAgent: this.userAgent
    });
  }

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    const webhookUrl = request.destination;

    try {
      // SSRF protection
      this.validateUrl(webhookUrl);

      // Build webhook payload
      const payload = {
        id: request.id,
        tenantId: request.tenantId,
        type: request.metadata?.type || 'notification',
        timestamp: new Date().toISOString(),
        title: request.title,
        body: request.body,
        metadata: request.metadata || {}
      };

      const body = JSON.stringify(payload);

      // Generate signature
      const signature = this.signPayload(body);

      // Send webhook
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent,
            ...(signature ? { 'X-Sentinel-Signature': signature } : {})
          },
          body
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
        }

        logger.debug('Webhook delivered', {
          deliveryId: request.id,
          url: webhookUrl,
          status: response.status
        });

        return {
          providerMessageId: `webhook-${Date.now()}`,
          status: 'delivered', // HTTP 2xx means delivered for webhooks
          metadata: {
            statusCode: response.status,
            statusText: response.statusText
          }
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      logger.error('Webhook delivery failed', {
        deliveryId: request.id,
        url: webhookUrl,
        error
      });

      // Throw classified error
      throw classifyWebhookError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    // Webhooks don't have a generic health check
    return true;
  }

  /**
   * Validate webhook URL for SSRF protection
   */
  private validateUrl(url: string): void {
    let parsed: URL;
    
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Only allow HTTP/HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Protocol ${parsed.protocol} not allowed for webhooks`);
    }

    // Check against blocked hosts
    const hostname = parsed.hostname.toLowerCase();
    
    for (const pattern of this.blockedHosts) {
      if (pattern.test(hostname)) {
        throw new Error(`Webhook URL blocked for security: ${hostname}`);
      }
    }
  }

  /**
   * Sign webhook payload with HMAC-SHA256
   */
  private signPayload(body: string): string | undefined {
    if (!this.signatureSecret) {
      return undefined;
    }

    const hmac = crypto.createHmac('sha256', this.signatureSecret);
    hmac.update(body);
    return hmac.digest('hex');
  }
}
