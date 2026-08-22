/**
 * Base Notification Provider
 * Abstract base class for all notification channel providers
 */

import type {
  NotificationProvider,
  ProviderConfig,
  NotificationMessage,
  DeliveryResult,
  ProviderHealthStatus,
  ProviderType,
  NotificationChannel,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export abstract class BaseNotificationProvider implements NotificationProvider {
  protected config?: ProviderConfig;
  protected initialized: boolean = false;

  constructor(
    public readonly providerKey: string,
    public readonly providerType: ProviderType,
    public readonly channel: NotificationChannel
  ) {}

  /**
   * Initialize the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    if (!config.enabled) {
      logger.warn(`Provider ${this.providerKey} is disabled`);
      return;
    }

    try {
      await this.doInitialize(config);
      this.initialized = true;
      logger.info(`Provider ${this.providerKey} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize provider ${this.providerKey}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Provider-specific initialization logic
   */
  protected abstract doInitialize(config: ProviderConfig): Promise<void>;

  /**
   * Send a notification message
   */
  async send(message: NotificationMessage): Promise<DeliveryResult> {
    if (!this.initialized) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'PROVIDER_NOT_INITIALIZED',
        failureReason: `Provider ${this.providerKey} is not initialized`,
        isPermanentFailure: false,
        timestamp: new Date(),
      };
    }

    if (!this.config?.enabled) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'PROVIDER_DISABLED',
        failureReason: `Provider ${this.providerKey} is disabled`,
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();

    try {
      const result = await this.doSend(message);
      
      logger.info(`Notification sent via ${this.providerKey}`, {
        channel: this.channel,
        recipient: this.maskRecipient(message.recipientDestination),
        latencyMs: Date.now() - startTime,
        status: result.status,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Failed to send notification via ${this.providerKey}`, {
        channel: this.channel,
        recipient: this.maskRecipient(message.recipientDestination),
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      });

      return {
        accepted: false,
        status: 'FAILED',
        failureCode: this.categorizeError(error),
        failureReason: errorMessage,
        isPermanentFailure: this.isPermanentError(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Provider-specific send logic
   */
  protected abstract doSend(message: NotificationMessage): Promise<DeliveryResult>;

  /**
   * Check provider health
   */
  async checkHealth(): Promise<ProviderHealthStatus> {
    if (!this.initialized) {
      return {
        healthy: false,
        status: 'UNHEALTHY',
        lastError: 'Provider not initialized',
        timestamp: new Date(),
      };
    }

    if (!this.config?.enabled) {
      return {
        healthy: false,
        status: 'UNHEALTHY',
        lastError: 'Provider disabled',
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();

    try {
      const healthy = await this.doHealthCheck();
      const latencyMs = Date.now() - startTime;

      return {
        healthy,
        status: healthy ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'UNHEALTHY',
        lastError: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Provider-specific health check logic
   */
  protected abstract doHealthCheck(): Promise<boolean>;

  /**
   * Categorize error for better handling
   */
  protected categorizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    // Network errors
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return 'NETWORK_ERROR';
    }

    if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
      return 'TIMEOUT';
    }

    // Authentication errors
    if (message.includes('auth') || message.includes('credentials')) {
      return 'AUTH_ERROR';
    }

    // Invalid recipient
    if (message.includes('invalid') && (message.includes('email') || message.includes('phone'))) {
      return 'INVALID_RECIPIENT';
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'RATE_LIMITED';
    }

    // Provider-specific errors
    if (message.includes('quota') || message.includes('insufficient')) {
      return 'QUOTA_EXCEEDED';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Determine if error is permanent (should not retry)
   */
  protected isPermanentError(error: unknown): boolean {
    const errorCode = this.categorizeError(error);

    const permanentErrors = [
      'INVALID_RECIPIENT',
      'AUTH_ERROR',
      'QUOTA_EXCEEDED',
    ];

    return permanentErrors.includes(errorCode);
  }

  /**
   * Mask recipient information for logging
   */
  protected maskRecipient(destination: string): string {
    // Email masking
    if (destination.includes('@')) {
      const [local, domain] = destination.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    }

    // Phone masking
    if (destination.startsWith('+')) {
      return `${destination.substring(0, 3)} ******${destination.slice(-4)}`;
    }

    // Generic masking
    if (destination.length > 8) {
      return `${destination.substring(0, 4)}****${destination.slice(-4)}`;
    }

    return '****';
  }

  /**
   * Validate message before sending
   */
  protected validateMessage(message: NotificationMessage): { valid: boolean; error?: string } {
    if (!message.recipientDestination) {
      return { valid: false, error: 'Recipient destination is required' };
    }

    if (!message.body) {
      return { valid: false, error: 'Message body is required' };
    }

    if (message.body.length === 0) {
      return { valid: false, error: 'Message body cannot be empty' };
    }

    return { valid: true };
  }
}
