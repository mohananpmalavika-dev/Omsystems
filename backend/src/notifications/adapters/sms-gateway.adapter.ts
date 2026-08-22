/**
 * SMS Gateway Provider
 * Generic SMS gateway adapter supporting multiple backends
 */

import { BaseNotificationProvider } from './base-provider.adapter.js';
import type {
  ProviderConfig,
  NotificationMessage,
  DeliveryResult,
  SMSGatewayConfig,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class SMSGatewayProvider extends BaseNotificationProvider {
  private gatewayUrl?: string;
  private apiKey?: string;
  private senderId?: string;
  private encoding: 'GSM7' | 'UCS2' = 'GSM7';

  constructor(providerKey: string = 'sms-gateway-default') {
    super(providerKey, 'SMPP', 'sms');
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const smsConfig = config.config as SMSGatewayConfig;

    if (!smsConfig.gatewayUrl || !smsConfig.apiKey) {
      throw new Error('SMS gateway URL and API key are required');
    }

    this.gatewayUrl = smsConfig.gatewayUrl;
    this.apiKey = smsConfig.apiKey;
    this.senderId = smsConfig.senderId || 'SENTINEL';
    this.encoding = smsConfig.encoding || 'GSM7';

    logger.info('SMS Gateway initialized', {
      gateway: this.maskUrl(this.gatewayUrl),
      senderId: this.senderId,
    });
  }

  protected async doSend(message: NotificationMessage): Promise<DeliveryResult> {
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'VALIDATION_ERROR',
        failureReason: validation.error,
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    // Validate phone format
    if (!this.isValidPhone(message.recipientDestination)) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'INVALID_PHONE',
        failureReason: 'Invalid phone number format. Expected E.164 format (e.g., +919876543210)',
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    // Truncate SMS message if too long
    const maxLength = this.encoding === 'GSM7' ? 160 : 70;
    const truncatedBody = message.body.length > maxLength
      ? message.body.substring(0, maxLength - 3) + '...'
      : message.body;

    if (!this.gatewayUrl || !this.apiKey) {
      throw new Error('SMS Gateway not properly initialized');
    }

    try {
      const response = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to: message.recipientDestination,
          from: this.senderId,
          message: truncatedBody,
          encoding: this.encoding,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`SMS Gateway error: ${response.status} ${errorBody}`);
      }

      const result = await response.json();

      return {
        accepted: true,
        providerMessageId: result.messageId || result.id,
        status: 'SENT',
        timestamp: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.gatewayUrl || !this.apiKey) {
      return false;
    }

    try {
      // Attempt a health check endpoint if available
      const healthUrl = this.gatewayUrl.replace('/send', '/health');
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.warn('SMS Gateway health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate phone number format (E.164)
   */
  private isValidPhone(phone: string): boolean {
    // E.164 format: + followed by 1-15 digits
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Mask URL for logging
   */
  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '***';
    }
  }

  /**
   * Calculate SMS segment count
   */
  private calculateSegmentCount(message: string): number {
    const encoding = this.encoding;
    
    if (encoding === 'GSM7') {
      if (message.length <= 160) return 1;
      return Math.ceil(message.length / 153); // Concatenated SMS uses 153 chars per segment
    } else {
      // UCS2/Unicode
      if (message.length <= 70) return 1;
      return Math.ceil(message.length / 67); // Concatenated UCS2 SMS uses 67 chars per segment
    }
  }
}
