/**
 * Twilio SMS Provider
 * 
 * Global SMS provider with high deliverability.
 * 
 * API Docs: https://www.twilio.com/docs/sms/api
 */

import axios, { AxiosError } from 'axios';
import { logger } from '../../../utils/logger.js';
import type {
  SmsProvider,
  SmsMessage,
  SmsSendResult,
  SmsHealthCheckResult,
  SmsProviderConfig,
  SmsErrorCode,
} from '../sms-provider.interface.js';

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(config: SmsProviderConfig) {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    }

    if (!config.twilioFromNumber) {
      throw new Error('TWILIO_FROM_NUMBER is required');
    }

    this.accountSid = config.twilioAccountSid;
    this.authToken = config.twilioAuthToken;
    this.fromNumber = config.twilioFromNumber;
    this.timeoutMs = config.defaultTimeoutMs || 10000;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  isConfigured(): boolean {
    return !!(this.accountSid && this.authToken && this.fromNumber);
  }

  async healthCheck(): Promise<SmsHealthCheckResult> {
    const startTime = Date.now();

    try {
      // Validate credentials by fetching account info
      const response = await axios.get(`${this.baseUrl}.json`, {
        auth: {
          username: this.accountSid,
          password: this.authToken,
        },
        timeout: 5000,
      });

      const latencyMs = Date.now() - startTime;

      if (response.status === 200 && response.data.status === 'active') {
        return {
          healthy: true,
          latencyMs,
          details: {
            accountStatus: response.data.status,
          },
        };
      }

      return {
        healthy: false,
        reason: `Account status: ${response.data.status}`,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        return {
          healthy: false,
          reason: error.response?.data?.message || error.message,
          latencyMs,
        };
      }

      return {
        healthy: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      };
    }
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const startTime = Date.now();

    try {
      // Prepare form data (Twilio uses application/x-www-form-urlencoded)
      const params = new URLSearchParams({
        To: message.to,
        From: message.from || this.fromNumber,
        Body: message.body,
      });

      // Add idempotency if provided
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (message.idempotencyKey) {
        headers['Idempotency-Key'] = message.idempotencyKey;
      }

      // Send via Twilio API
      const response = await axios.post<TwilioResponse>(
        `${this.baseUrl}/Messages.json`,
        params.toString(),
        {
          auth: {
            username: this.accountSid,
            password: this.authToken,
          },
          headers,
          timeout: this.timeoutMs,
        }
      );

      const latencyMs = Date.now() - startTime;

      // Check response status
      if (response.data.status === 'queued' || response.data.status === 'sending' || response.data.status === 'sent') {
        logger.info('Twilio SMS sent successfully', {
          messageSid: response.data.sid,
          status: response.data.status,
          to: maskPhone(message.to),
          latencyMs,
        });

        return {
          accepted: true,
          providerMessageId: response.data.sid,
          latencyMs,
        };
      }

      // Message accepted but in unexpected state
      return {
        accepted: false,
        retryable: false,
        errorCode: 'UNKNOWN' as SmsErrorCode,
        errorMessage: `Unexpected message status: ${response.data.status}`,
        providerError: response.data,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        return this.handleAxiosError(error, latencyMs);
      }

      logger.error('Twilio SMS send failed', { error });

      return {
        accepted: false,
        retryable: true,
        errorCode: 'UNKNOWN' as SmsErrorCode,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      };
    }
  }

  private handleAxiosError(error: AxiosError, latencyMs: number): SmsSendResult {
    // Timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        accepted: false,
        retryable: true,
        errorCode: 'PROVIDER_TIMEOUT' as SmsErrorCode,
        errorMessage: 'Twilio request timed out',
        providerError: error.toJSON(),
        latencyMs,
      };
    }

    // Network error
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        accepted: false,
        retryable: true,
        errorCode: 'NETWORK_ERROR' as SmsErrorCode,
        errorMessage: 'Network error connecting to Twilio',
        providerError: error.toJSON(),
        latencyMs,
      };
    }

    // HTTP error response
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      const twilioErrorCode = data?.code;

      // Authentication failure
      if (status === 401 || status === 403) {
        return {
          accepted: false,
          retryable: false,
          errorCode: 'AUTHENTICATION_FAILED' as SmsErrorCode,
          errorMessage: data?.message || 'Twilio authentication failed',
          providerError: data,
          latencyMs,
        };
      }

      // Rate limit
      if (status === 429) {
        return {
          accepted: false,
          retryable: true,
          errorCode: 'RATE_LIMITED' as SmsErrorCode,
          errorMessage: 'Twilio rate limit exceeded',
          providerError: data,
          latencyMs,
        };
      }

      // Server error
      if (status >= 500) {
        return {
          accepted: false,
          retryable: true,
          errorCode: 'PROVIDER_UNAVAILABLE' as SmsErrorCode,
          errorMessage: `Twilio server error: ${status}`,
          providerError: data,
          latencyMs,
        };
      }

      // Map Twilio error codes
      const errorCode = mapTwilioError(twilioErrorCode, data?.message);

      return {
        accepted: false,
        retryable: isRetryableTwilioError(errorCode),
        errorCode,
        errorMessage: data?.message || `HTTP ${status}`,
        providerError: data,
        latencyMs,
      };
    }

    // Unknown error
    return {
      accepted: false,
      retryable: true,
      errorCode: 'UNKNOWN' as SmsErrorCode,
      errorMessage: error.message,
      providerError: error.toJSON(),
      latencyMs,
    };
  }
}

/**
 * Map Twilio error codes to normalized error codes
 * https://www.twilio.com/docs/api/errors
 */
function mapTwilioError(twilioCode: number | undefined, message: string = ''): SmsErrorCode {
  const msg = message.toLowerCase();

  // Invalid phone number
  if (twilioCode === 21211 || twilioCode === 21614 || msg.includes('invalid')) {
    return 'INVALID_NUMBER' as SmsErrorCode;
  }

  // Blocked/unsubscribed
  if (twilioCode === 21610 || msg.includes('unsubscribed') || msg.includes('blocked')) {
    return 'DESTINATION_BLOCKED' as SmsErrorCode;
  }

  // Authentication
  if (twilioCode === 20003 || twilioCode === 20404) {
    return 'AUTHENTICATION_FAILED' as SmsErrorCode;
  }

  // Insufficient balance
  if (twilioCode === 20429 || msg.includes('insufficient')) {
    return 'INSUFFICIENT_BALANCE' as SmsErrorCode;
  }

  // Rate limiting
  if (twilioCode === 20429 || msg.includes('rate limit')) {
    return 'RATE_LIMITED' as SmsErrorCode;
  }

  // Unsupported region
  if (twilioCode === 21408 || twilioCode === 21612) {
    return 'UNSUPPORTED_REGION' as SmsErrorCode;
  }

  // Service unavailable
  if (twilioCode === 30001 || twilioCode === 30002 || twilioCode === 30003) {
    return 'PROVIDER_UNAVAILABLE' as SmsErrorCode;
  }

  return 'UNKNOWN' as SmsErrorCode;
}

/**
 * Determine if Twilio error is retryable
 */
function isRetryableTwilioError(errorCode: SmsErrorCode): boolean {
  return [
    'RATE_LIMITED' as SmsErrorCode,
    'PROVIDER_TIMEOUT' as SmsErrorCode,
    'PROVIDER_UNAVAILABLE' as SmsErrorCode,
    'NETWORK_ERROR' as SmsErrorCode,
    'TEMPORARY_FAILURE' as SmsErrorCode,
  ].includes(errorCode);
}

/**
 * Mask phone number for logging
 */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}
