/**
 * Notification System Error Definitions
 * 
 * Provides structured error handling with retry classification
 */

import { DeliveryError } from './notification.types.js';

// Re-export DeliveryError for convenience
export { DeliveryError } from './notification.types.js';

// =====================================================
// Error Classification
// =====================================================

/**
 * Determine if an error should trigger a retry
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DeliveryError) {
    return error.retryable;
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network/timeout errors - retry
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('network error')
    ) {
      return true;
    }
    
    // DNS errors - retry
    if (
      message.includes('enotfound') ||
      message.includes('dns')
    ) {
      return true;
    }
    
    // Rate limiting - retry
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    ) {
      return true;
    }
    
    // Server errors - retry
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true;
    }
  }
  
  // Unknown errors - don't retry by default
  return false;
}

/**
 * Extract error code from various error types
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof DeliveryError) {
    return error.code;
  }
  
  if (error && typeof error === 'object') {
    // HTTP status code
    if ('status' in error && typeof error.status === 'number') {
      return `HTTP_${error.status}`;
    }
    
    // Error code property
    if ('code' in error && typeof error.code === 'string') {
      return error.code;
    }
    
    // Name property (for built-in errors)
    if ('name' in error && typeof error.name === 'string') {
      return error.name;
    }
  }
  
  return undefined;
}

/**
 * Extract clean error message
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'Unknown error';
}

// =====================================================
// Retry Policy
// =====================================================

/**
 * Calculate next retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(attemptCount: number): number {
  const baseDelayMs = 5_000; // 5 seconds
  const maxDelayMs = 15 * 60 * 1000; // 15 minutes
  
  // Exponential backoff: 5s, 10s, 20s, 40s, 80s, ...
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attemptCount),
    maxDelayMs
  );
  
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Get retry delay from Retry-After header or error
 */
export function getRetryAfterDelay(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  
  // Check for Retry-After in response headers
  if ('headers' in error && error.headers && typeof error.headers === 'object') {
    const headers = error.headers as Record<string, unknown>;
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    
    if (typeof retryAfter === 'string') {
      // Try parsing as seconds
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
      
      // Try parsing as HTTP date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
      }
    } else if (typeof retryAfter === 'number') {
      return retryAfter * 1000;
    }
  }
  
  return null;
}

// =====================================================
// Specific Provider Errors
// =====================================================

/**
 * SMTP-specific error classification
 */
export function classifySmtpError(error: unknown): DeliveryError {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);
  
  // Invalid email address
  if (
    message.includes('invalid address') ||
    message.includes('malformed') ||
    code === 'EENVELOPE'
  ) {
    return new DeliveryError(
      `Invalid email address: ${message}`,
      false, // Don't retry
      'INVALID_EMAIL'
    );
  }
  
  // Authentication failure
  if (
    message.includes('authentication') ||
    message.includes('auth') ||
    code === 'EAUTH'
  ) {
    return new DeliveryError(
      `SMTP authentication failed: ${message}`,
      false, // Configuration issue, don't retry
      'SMTP_AUTH_FAILED'
    );
  }
  
  // Mailbox full
  if (message.includes('mailbox full') || message.includes('quota exceeded')) {
    return new DeliveryError(
      `Recipient mailbox full: ${message}`,
      false, // Don't retry
      'MAILBOX_FULL'
    );
  }
  
  // Recipient rejected
  if (message.includes('recipient rejected') || message.includes('user unknown')) {
    return new DeliveryError(
      `Recipient rejected: ${message}`,
      false, // Don't retry
      'RECIPIENT_REJECTED'
    );
  }
  
  // Connection/timeout - retry
  if (
    message.includes('timeout') ||
    message.includes('connection') ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNECTION'
  ) {
    return new DeliveryError(
      `SMTP connection error: ${message}`,
      true, // Retry
      'SMTP_CONNECTION_ERROR'
    );
  }
  
  // Default: temporary SMTP error
  return new DeliveryError(
    `SMTP error: ${message}`,
    true, // Retry by default
    code || 'SMTP_ERROR'
  );
}

/**
 * Twilio SMS error classification
 */
export function classifyTwilioError(error: unknown): DeliveryError {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);
  
  // Invalid phone number
  if (
    code === '21211' || // Invalid phone number
    code === '21612' || // Invalid phone number format
    message.includes('invalid phone') ||
    message.includes('invalid number')
  ) {
    return new DeliveryError(
      `Invalid phone number: ${message}`,
      false, // Don't retry
      'INVALID_PHONE'
    );
  }
  
  // Unallocated/unreachable number
  if (
    code === '30003' || // Unreachable
    code === '30005' || // Unknown destination
    code === '30008'    // Unallocated number
  ) {
    return new DeliveryError(
      `Phone number unreachable: ${message}`,
      false, // Don't retry
      'PHONE_UNREACHABLE'
    );
  }
  
  // Blocked/opted out
  if (
    code === '21610' || // Unsubscribed
    code === '30007'    // Blocked
  ) {
    return new DeliveryError(
      `Recipient opted out or blocked: ${message}`,
      false, // Don't retry
      'RECIPIENT_BLOCKED'
    );
  }
  
  // Rate limit
  if (code === '20429' || message.includes('rate limit')) {
    return new DeliveryError(
      `Twilio rate limit: ${message}`,
      true, // Retry
      'TWILIO_RATE_LIMIT'
    );
  }
  
  // Queue full
  if (code === '30006') {
    return new DeliveryError(
      `Twilio queue full: ${message}`,
      true, // Retry
      'TWILIO_QUEUE_FULL'
    );
  }
  
  // Authentication error
  if (code === '20003' || message.includes('authenticate')) {
    return new DeliveryError(
      `Twilio authentication failed: ${message}`,
      false, // Configuration issue
      'TWILIO_AUTH_FAILED'
    );
  }
  
  // Service unavailable
  if (code?.startsWith('500') || message.includes('service unavailable')) {
    return new DeliveryError(
      `Twilio service unavailable: ${message}`,
      true, // Retry
      'TWILIO_SERVICE_ERROR'
    );
  }
  
  // Default
  return new DeliveryError(
    `Twilio error: ${message}`,
    true, // Retry by default
    code || 'TWILIO_ERROR'
  );
}

/**
 * FCM push error classification
 */
export function classifyFcmError(error: unknown): DeliveryError {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);
  
  // Invalid registration token
  if (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered' ||
    message.includes('invalid-registration-token')
  ) {
    return new DeliveryError(
      `Invalid FCM token: ${message}`,
      false, // Don't retry, need to deactivate token
      'INVALID_FCM_TOKEN'
    );
  }
  
  // Message too large
  if (
    code === 'messaging/message-payload-too-large' ||
    message.includes('payload-too-large')
  ) {
    return new DeliveryError(
      `FCM message too large: ${message}`,
      false, // Don't retry
      'FCM_MESSAGE_TOO_LARGE'
    );
  }
  
  // Invalid argument
  if (
    code === 'messaging/invalid-argument' ||
    message.includes('invalid-argument')
  ) {
    return new DeliveryError(
      `Invalid FCM message format: ${message}`,
      false, // Don't retry
      'FCM_INVALID_ARGUMENT'
    );
  }
  
  // Quota exceeded
  if (
    code === 'messaging/quota-exceeded' ||
    message.includes('quota-exceeded')
  ) {
    return new DeliveryError(
      `FCM quota exceeded: ${message}`,
      true, // Retry
      'FCM_QUOTA_EXCEEDED'
    );
  }
  
  // Server unavailable
  if (
    code === 'messaging/server-unavailable' ||
    code === 'messaging/internal-error' ||
    message.includes('server-unavailable')
  ) {
    return new DeliveryError(
      `FCM service unavailable: ${message}`,
      true, // Retry
      'FCM_SERVICE_ERROR'
    );
  }
  
  // Third-party auth error
  if (code === 'messaging/third-party-auth-error') {
    return new DeliveryError(
      `FCM APNs auth error: ${message}`,
      false, // Configuration issue
      'FCM_AUTH_ERROR'
    );
  }
  
  // Default
  return new DeliveryError(
    `FCM error: ${message}`,
    true, // Retry by default
    code || 'FCM_ERROR'
  );
}

/**
 * Webhook HTTP error classification
 */
export function classifyWebhookError(error: unknown): DeliveryError {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);
  
  // Client errors (4xx) - don't retry most
  if (code === 'HTTP_400') {
    return new DeliveryError(
      `Webhook bad request: ${message}`,
      false, // Don't retry
      'WEBHOOK_BAD_REQUEST'
    );
  }
  
  if (code === 'HTTP_401' || code === 'HTTP_403') {
    return new DeliveryError(
      `Webhook authentication failed: ${message}`,
      false, // Configuration issue
      'WEBHOOK_AUTH_FAILED'
    );
  }
  
  if (code === 'HTTP_404') {
    return new DeliveryError(
      `Webhook endpoint not found: ${message}`,
      false, // Don't retry
      'WEBHOOK_NOT_FOUND'
    );
  }
  
  if (code === 'HTTP_429') {
    return new DeliveryError(
      `Webhook rate limited: ${message}`,
      true, // Retry
      'WEBHOOK_RATE_LIMITED'
    );
  }
  
  // Server errors (5xx) - retry
  if (code?.startsWith('HTTP_5')) {
    return new DeliveryError(
      `Webhook server error: ${message}`,
      true, // Retry
      code
    );
  }
  
  // Network errors - retry
  if (
    message.includes('timeout') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND')
  ) {
    return new DeliveryError(
      `Webhook network error: ${message}`,
      true, // Retry
      'WEBHOOK_NETWORK_ERROR'
    );
  }
  
  // SSRF protection triggered
  if (message.includes('private') || message.includes('internal')) {
    return new DeliveryError(
      `Webhook URL not allowed: ${message}`,
      false, // Security issue, don't retry
      'WEBHOOK_URL_BLOCKED'
    );
  }
  
  // Default
  return new DeliveryError(
    `Webhook error: ${message}`,
    true, // Retry by default
    code || 'WEBHOOK_ERROR'
  );
}

// =====================================================
// Error Factory
// =====================================================

/**
 * Create appropriate DeliveryError based on channel and error
 */
export function createDeliveryError(
  channel: string,
  error: unknown
): DeliveryError {
  // Already a DeliveryError
  if (error instanceof DeliveryError) {
    return error;
  }
  
  // Channel-specific classification
  switch (channel) {
    case 'email':
      return classifySmtpError(error);
    
    case 'sms':
      return classifyTwilioError(error);
    
    case 'push':
      return classifyFcmError(error);
    
    case 'webhook':
      return classifyWebhookError(error);
    
    case 'in_app':
      // In-app notifications should rarely fail
      return new DeliveryError(
        extractErrorMessage(error),
        true,
        extractErrorCode(error)
      );
    
    default:
      // Unknown channel
      return new DeliveryError(
        extractErrorMessage(error),
        isRetryableError(error),
        extractErrorCode(error)
      );
  }
}

// =====================================================
// Validation Errors
// =====================================================

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class TenantMismatchError extends Error {
  constructor() {
    super('Tenant mismatch - access denied');
    this.name = 'TenantMismatchError';
  }
}
