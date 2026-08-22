/**
 * Disabled SMS Provider
 * 
 * Fail-closed provider when no SMS delivery is configured.
 * Prevents silent failures where OTP is generated but never delivered.
 * 
 * Use this as the default provider to enforce explicit configuration.
 */

import type {
  SmsProvider,
  SmsMessage,
  SmsSendResult,
  SmsHealthCheckResult,
  SmsErrorCode,
} from '../sms-provider.interface.js';

export class DisabledSmsProvider implements SmsProvider {
  readonly name = 'disabled';

  isConfigured(): boolean {
    return false;
  }

  async healthCheck(): Promise<SmsHealthCheckResult> {
    return {
      healthy: false,
      reason: 'SMS provider not configured. Set SMS_PROVIDER environment variable.',
    };
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    return {
      accepted: false,
      retryable: false,
      errorCode: 'AUTHENTICATION_FAILED' as SmsErrorCode,
      errorMessage: 'SMS provider not configured. Cannot send message.',
      latencyMs: 0,
    };
  }
}
