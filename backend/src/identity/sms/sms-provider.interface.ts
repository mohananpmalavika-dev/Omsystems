/**
 * SMS Provider Abstraction
 * 
 * Defines a vendor-agnostic interface for SMS delivery.
 * Implementations normalize provider-specific errors into standard categories.
 */

export interface SmsProvider {
  /**
   * Provider identifier (e.g., 'msg91', 'twilio', 'sns', 'console')
   */
  readonly name: string;

  /**
   * Check if provider is configured with required credentials
   */
  isConfigured(): boolean;

  /**
   * Check provider operational health
   * Separate from send() to allow proactive health monitoring
   */
  healthCheck(): Promise<SmsHealthCheckResult>;

  /**
   * Send SMS message
   * Should be idempotent when idempotencyKey is provided
   */
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export interface SmsMessage {
  /** E.164 format phone number (e.g., +919876543210) */
  to: string;

  /** Message body (respects provider length limits) */
  body: string;

  /** Optional idempotency key for retry safety */
  idempotencyKey?: string;

  /** Optional sender ID (subject to provider approval) */
  from?: string;

  /** Optional template ID for pre-approved templates */
  templateId?: string;

  /** Optional template variables */
  templateVariables?: Record<string, string>;
}

export interface SmsSendResult {
  /** Whether provider accepted the message */
  accepted: boolean;

  /** Provider's message ID for tracking */
  providerMessageId?: string;

  /** Whether failure is retryable */
  retryable?: boolean;

  /** Normalized error code */
  errorCode?: SmsErrorCode;

  /** Human-readable error message */
  errorMessage?: string;

  /** Provider-specific error details */
  providerError?: unknown;

  /** Delivery latency in milliseconds */
  latencyMs?: number;
}

export interface SmsHealthCheckResult {
  /** Overall health status */
  healthy: boolean;

  /** Human-readable reason if unhealthy */
  reason?: string;

  /** Response time in milliseconds */
  latencyMs?: number;

  /** Additional provider-specific health data */
  details?: Record<string, unknown>;
}

/**
 * Normalized SMS error codes
 * Providers map their errors to these categories
 */
export enum SmsErrorCode {
  // Non-retryable errors
  INVALID_NUMBER = 'INVALID_NUMBER',
  DESTINATION_BLOCKED = 'DESTINATION_BLOCKED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  TEMPLATE_REJECTED = 'TEMPLATE_REJECTED',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  UNSUPPORTED_REGION = 'UNSUPPORTED_REGION',

  // Retryable errors
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TEMPORARY_FAILURE = 'TEMPORARY_FAILURE',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

/**
 * Helper to check if error is retryable
 */
export function isRetryableError(errorCode: SmsErrorCode): boolean {
  return [
    SmsErrorCode.RATE_LIMITED,
    SmsErrorCode.PROVIDER_TIMEOUT,
    SmsErrorCode.PROVIDER_UNAVAILABLE,
    SmsErrorCode.NETWORK_ERROR,
    SmsErrorCode.TEMPORARY_FAILURE,
  ].includes(errorCode);
}

/**
 * SMS provider configuration from environment
 */
export interface SmsProviderConfig {
  provider: 'msg91' | 'twilio' | 'sns' | 'console' | 'disabled';
  
  // MSG91
  msg91AuthKey?: string;
  msg91SenderId?: string;
  msg91Route?: string;
  msg91DltTemplateId?: string;

  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;

  // AWS SNS
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  snsSenderId?: string;

  // Rate limiting
  maxRetriesPerMessage?: number;
  defaultTimeoutMs?: number;
}

/**
 * Factory for creating SMS provider instances
 */
export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
  switch (config.provider) {
    case 'msg91':
      // Lazy load to avoid circular dependencies
      const { Msg91SmsProvider } = require('./providers/msg91-provider.js');
      return new Msg91SmsProvider(config);

    case 'twilio':
      const { TwilioSmsProvider } = require('./providers/twilio-provider.js');
      return new TwilioSmsProvider(config);

    case 'sns':
      const { SnsSmsProvider } = require('./providers/sns-provider.js');
      return new SnsSmsProvider(config);

    case 'console':
      const { ConsoleSmsProvider } = require('./providers/console-provider.js');
      return new ConsoleSmsProvider();

    case 'disabled':
      const { DisabledSmsProvider } = require('./providers/disabled-provider.js');
      return new DisabledSmsProvider();

    default:
      throw new Error(`Unknown SMS provider: ${config.provider}`);
  }
}

/**
 * Load SMS provider configuration from environment
 */
export function loadSmsProviderConfig(): SmsProviderConfig {
  const provider = (process.env.SMS_PROVIDER || 'disabled') as SmsProviderConfig['provider'];

  return {
    provider,

    // MSG91
    msg91AuthKey: process.env.MSG91_AUTH_KEY,
    msg91SenderId: process.env.MSG91_SENDER_ID,
    msg91Route: process.env.MSG91_ROUTE || '4', // 4 = Transactional
    msg91DltTemplateId: process.env.MSG91_DLT_TEMPLATE_ID,

    // Twilio
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER,

    // AWS SNS
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    snsSenderId: process.env.SNS_SENDER_ID,

    // Behavior
    maxRetriesPerMessage: parseInt(process.env.SMS_MAX_RETRIES || '3'),
    defaultTimeoutMs: parseInt(process.env.SMS_TIMEOUT_MS || '10000'),
  };
}
