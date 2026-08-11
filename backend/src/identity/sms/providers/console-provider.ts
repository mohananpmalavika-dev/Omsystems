/**
 * Console SMS Provider
 * 
 * Development-only provider that logs SMS to console.
 * Requires explicit SMS_PROVIDER=console to activate.
 * 
 * SECURITY: Never logs OTP in production environments.
 * Production deployments should use disabled provider if no real provider configured.
 */

import crypto from 'crypto';
import { logger } from '../../../utils/logger.js';
import type {
  SmsProvider,
  SmsMessage,
  SmsSendResult,
  SmsHealthCheckResult,
} from '../sms-provider.interface.js';

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  isConfigured(): boolean {
    return process.env.SMS_PROVIDER === 'console';
  }

  async healthCheck(): Promise<SmsHealthCheckResult> {
    return {
      healthy: true,
      reason: 'Console provider is always available',
      latencyMs: 0,
    };
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const startTime = Date.now();

    try {
      // Simulate basic validation
      if (!message.to || !message.to.match(/^\+?[1-9]\d{1,14}$/)) {
        return {
          accepted: false,
          retryable: false,
          errorCode: 'INVALID_NUMBER' as any,
          errorMessage: 'Invalid phone number format',
          latencyMs: Date.now() - startTime,
        };
      }

      // Generate mock message ID
      const providerMessageId = `console-${crypto.randomUUID()}`;

      // Log to console with security considerations
      logger.info('[DEV SMS] Message queued for delivery', {
        provider: this.name,
        to: maskPhoneNumber(message.to),
        messageId: providerMessageId,
        bodyLength: message.body.length,
        idempotencyKey: message.idempotencyKey,
        // NEVER log actual OTP/message body even in dev
        // If you need to see it for debugging, use a separate debug logger
      });

      // In development, optionally show the actual message via debug logger
      if (process.env.SMS_CONSOLE_SHOW_BODY === 'true') {
        console.debug('─────────────────────────────────────');
        console.debug('📱 SMS MESSAGE (DEVELOPMENT ONLY)');
        console.debug('─────────────────────────────────────');
        console.debug(`To: ${message.to}`);
        console.debug(`Body: ${message.body}`);
        console.debug(`Message ID: ${providerMessageId}`);
        console.debug('─────────────────────────────────────');
      }

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        accepted: true,
        providerMessageId,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Console SMS provider error', { error });

      return {
        accepted: false,
        retryable: false,
        errorCode: 'UNKNOWN' as any,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Mask phone number for logging
 * +919876543210 → +91****3210
 */
function maskPhoneNumber(phone: string): string {
  if (phone.length <= 6) {
    return '****';
  }

  const countryCode = phone.slice(0, 3);
  const lastDigits = phone.slice(-4);
  const maskedLength = phone.length - 7;

  return `${countryCode}${'*'.repeat(maskedLength)}${lastDigits}`;
}
