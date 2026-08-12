/**
 * MSG91 SMS Provider
 * 
 * Indian SMS gateway with DLT (Distributed Ledger Technology) compliance.
 * Supports transactional and promotional routes.
 * 
 * API Docs: https://docs.msg91.com/p/tf9GTextN/e/Otp3vZ8TL/MSG91
 */

import axios, { isAxiosError, type AxiosError } from 'axios';
import { logger } from '../../../utils/logger.js';
import type {
  SmsProvider,
  SmsMessage,
  SmsSendResult,
  SmsHealthCheckResult,
  SmsProviderConfig,
  SmsErrorCode,
} from '../sms-provider.interface.js';

interface Msg91Response {
  type: string;
  message: string;
  request_id?: string;
}

interface Msg91ErrorResponse {
  type: string;
  message: string;
}

export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';

  private readonly authKey: string;
  private readonly senderId: string;
  private readonly route: string;
  private readonly dltTemplateId?: string;
  private readonly timeoutMs: number;
  private readonly baseUrl = 'https://control.msg91.com/api/v5';

  constructor(config: SmsProviderConfig) {
    if (!config.msg91AuthKey) {
      throw new Error('MSG91_AUTH_KEY is required');
    }

    this.authKey = config.msg91AuthKey;
    this.senderId = config.msg91SenderId || 'SGALRT';
    this.route = config.msg91Route || '4'; // 4 = Transactional
    this.dltTemplateId = config.msg91DltTemplateId;
    this.timeoutMs = config.defaultTimeoutMs || 10000;
  }

  isConfigured(): boolean {
    return !!this.authKey;
  }

  async healthCheck(): Promise<SmsHealthCheckResult> {
    const startTime = Date.now();

    try {
      // MSG91 doesn't have a dedicated health endpoint
      // Check authentication by hitting the balance endpoint
      const response = await axios.get(`${this.baseUrl}/balance`, {
        headers: {
          authkey: this.authKey,
        },
        timeout: 5000,
      });

      const latencyMs = Date.now() - startTime;

      if (response.status === 200) {
        return {
          healthy: true,
          latencyMs,
          details: {
            balance: response.data,
          },
        };
      }

      return {
        healthy: false,
        reason: `Unexpected status: ${response.status}`,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        return {
          healthy: false,
          reason: axiosError.response?.data?.message || axiosError.message,
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
      // Prepare request payload
      const payload: any = {
        sender: message.from || this.senderId,
        route: this.route,
        country: '91', // Default to India; adjust based on phone number
        sms: [
          {
            message: message.body,
            to: [message.to.replace(/^\+/, '')], // Remove leading +
          },
        ],
      };

      // Add DLT template ID if configured (required for Indian telecom)
      if (this.dltTemplateId) {
        payload.DLT_TE_ID = this.dltTemplateId;
      }

      // Make API call
      const response = await axios.post<Msg91Response>(
        `${this.baseUrl}/flow/`,
        payload,
        {
          headers: {
            authkey: this.authKey,
            'content-type': 'application/json',
          },
          timeout: this.timeoutMs,
        }
      );

      const latencyMs = Date.now() - startTime;

      // MSG91 returns 200 even for some errors; check response type
      if (response.data.type === 'success') {
        logger.info('MSG91 SMS sent successfully', {
          requestId: response.data.request_id,
          to: maskPhone(message.to),
          latencyMs,
        });

        return {
          accepted: true,
          providerMessageId: response.data.request_id,
          latencyMs,
        };
      }

      // Handle MSG91 "success" response with error type
      const errorCode = mapMsg91Error(response.data.message);

      return {
        accepted: false,
        retryable: isRetryableMsg91Error(errorCode),
        errorCode,
        errorMessage: response.data.message,
        providerError: response.data,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        return this.handleAxiosError(error as AxiosError, latencyMs);
      }

      logger.error('MSG91 SMS send failed', { error });

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
        errorMessage: 'MSG91 request timed out',
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
        errorMessage: 'Network error connecting to MSG91',
        providerError: error.toJSON(),
        latencyMs,
      };
    }

    // HTTP error response
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as Msg91ErrorResponse;

      // Authentication failure
      if (status === 401 || status === 403) {
        return {
          accepted: false,
          retryable: false,
          errorCode: 'AUTHENTICATION_FAILED' as SmsErrorCode,
          errorMessage: data?.message || 'MSG91 authentication failed',
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
          errorMessage: 'MSG91 rate limit exceeded',
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
          errorMessage: `MSG91 server error: ${status}`,
          providerError: data,
          latencyMs,
        };
      }

      // Other client errors
      const errorCode = mapMsg91Error(data?.message);

      return {
        accepted: false,
        retryable: isRetryableMsg91Error(errorCode),
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
 * Map MSG91 error messages to normalized error codes
 */
function mapMsg91Error(message: string): SmsErrorCode {
  const msg = message?.toLowerCase() || '';

  if (msg.includes('invalid mobile') || msg.includes('invalid number')) {
    return 'INVALID_NUMBER' as SmsErrorCode;
  }

  if (msg.includes('insufficient') || msg.includes('balance')) {
    return 'INSUFFICIENT_BALANCE' as SmsErrorCode;
  }

  if (msg.includes('blocked') || msg.includes('dnd') || msg.includes('blacklist')) {
    return 'DESTINATION_BLOCKED' as SmsErrorCode;
  }

  if (msg.includes('template') || msg.includes('dlt')) {
    return 'TEMPLATE_REJECTED' as SmsErrorCode;
  }

  if (msg.includes('auth') || msg.includes('key')) {
    return 'AUTHENTICATION_FAILED' as SmsErrorCode;
  }

  if (msg.includes('rate') || msg.includes('limit') || msg.includes('throttle')) {
    return 'RATE_LIMITED' as SmsErrorCode;
  }

  if (msg.includes('timeout')) {
    return 'PROVIDER_TIMEOUT' as SmsErrorCode;
  }

  return 'UNKNOWN' as SmsErrorCode;
}

/**
 * Determine if MSG91 error is retryable
 */
function isRetryableMsg91Error(errorCode: SmsErrorCode): boolean {
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
