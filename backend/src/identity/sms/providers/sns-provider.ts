/**
 * AWS SNS SMS Provider
 * 
 * AWS Simple Notification Service for SMS delivery.
 * Good for AWS-integrated systems.
 * 
 * API Docs: https://docs.aws.amazon.com/sns/latest/dg/sns-sms-send.html
 */

import { SNSClient, PublishCommand, GetSMSAttributesCommand } from '@aws-sdk/client-sns';
import { logger } from '../../../utils/logger.js';
import type {
  SmsProvider,
  SmsMessage,
  SmsSendResult,
  SmsHealthCheckResult,
  SmsProviderConfig,
  SmsErrorCode,
} from '../sms-provider.interface.js';

export class SnsSmsProvider implements SmsProvider {
  readonly name = 'sns';

  private readonly client: SNSClient;
  private readonly senderId?: string;
  private readonly timeoutMs: number;

  constructor(config: SmsProviderConfig) {
    if (!config.awsRegion) {
      throw new Error('AWS_REGION is required for SNS provider');
    }

    this.client = new SNSClient({
      region: config.awsRegion,
      credentials: config.awsAccessKeyId && config.awsSecretAccessKey
        ? {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
          }
        : undefined, // Use default credential chain
    });

    this.senderId = config.snsSenderId;
    this.timeoutMs = config.defaultTimeoutMs || 10000;
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async healthCheck(): Promise<SmsHealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check SMS attributes to verify configuration
      const command = new GetSMSAttributesCommand({
        attributes: ['MonthlySpendLimit', 'DefaultSMSType'],
      });

      await this.client.send(command);

      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        reason: error.message || 'SNS health check failed',
        latencyMs,
      };
    }
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const startTime = Date.now();

    try {
      // Prepare message attributes
      const messageAttributes: Record<string, any> = {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional', // High priority delivery
        },
      };

      // Add sender ID if configured
      if (this.senderId || message.from) {
        messageAttributes['AWS.SNS.SMS.SenderID'] = {
          DataType: 'String',
          StringValue: message.from || this.senderId,
        };
      }

      // Create publish command
      const command = new PublishCommand({
        PhoneNumber: message.to,
        Message: message.body,
        MessageAttributes: messageAttributes,
      });

      // Send via SNS
      const response = await this.client.send(command);

      const latencyMs = Date.now() - startTime;

      if (response.MessageId) {
        logger.info('SNS SMS sent successfully', {
          messageId: response.MessageId,
          to: maskPhone(message.to),
          latencyMs,
        });

        return {
          accepted: true,
          providerMessageId: response.MessageId,
          latencyMs,
        };
      }

      return {
        accepted: false,
        retryable: false,
        errorCode: 'UNKNOWN' as SmsErrorCode,
        errorMessage: 'SNS did not return MessageId',
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      return this.handleSnsError(error, latencyMs);
    }
  }

  private handleSnsError(error: any, latencyMs: number): SmsSendResult {
    const errorCode = error.name || error.code || 'UNKNOWN';
    const errorMessage = error.message || 'Unknown SNS error';

    logger.error('SNS SMS send failed', {
      errorCode,
      errorMessage,
      latencyMs,
    });

    // Map AWS error codes to normalized codes
    const normalizedCode = mapSnsError(errorCode, errorMessage);

    return {
      accepted: false,
      retryable: isRetryableSnsError(normalizedCode),
      errorCode: normalizedCode,
      errorMessage,
      providerError: error,
      latencyMs,
    };
  }
}

/**
 * Map SNS error codes to normalized error codes
 */
function mapSnsError(snsCode: string, message: string): SmsErrorCode {
  const msg = message.toLowerCase();

  // Invalid phone number
  if (snsCode === 'InvalidParameterException' && msg.includes('phone')) {
    return 'INVALID_NUMBER' as SmsErrorCode;
  }

  // Authentication/authorization
  if (snsCode === 'AuthorizationErrorException' || snsCode === 'InvalidClientTokenId') {
    return 'AUTHENTICATION_FAILED' as SmsErrorCode;
  }

  // Throttling
  if (snsCode === 'ThrottlingException' || snsCode === 'TooManyRequestsException') {
    return 'RATE_LIMITED' as SmsErrorCode;
  }

  // Service unavailable
  if (snsCode === 'ServiceUnavailable' || snsCode === 'InternalServerError') {
    return 'PROVIDER_UNAVAILABLE' as SmsErrorCode;
  }

  // Network timeout
  if (snsCode === 'TimeoutError' || msg.includes('timeout')) {
    return 'PROVIDER_TIMEOUT' as SmsErrorCode;
  }

  // Unsupported region
  if (msg.includes('not supported') || msg.includes('region')) {
    return 'UNSUPPORTED_REGION' as SmsErrorCode;
  }

  return 'UNKNOWN' as SmsErrorCode;
}

/**
 * Determine if SNS error is retryable
 */
function isRetryableSnsError(errorCode: SmsErrorCode): boolean {
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
