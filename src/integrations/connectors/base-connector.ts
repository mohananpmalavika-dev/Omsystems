/**
 * Base Connector Class
 * 
 * Abstract base class for all integration connectors.
 * Provides common functionality like rate limiting, error handling, and logging.
 */

import type {
  IntegrationConnector,
  IntegrationType,
  IntegrationCategory,
  IntegrationConfig,
  IntegrationEvent,
  IntegrationResponse,
  IntegrationConfigSchema
} from '../types.js';

export abstract class BaseConnector implements IntegrationConnector {
  abstract readonly type: IntegrationType;
  abstract readonly category: IntegrationCategory;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;

  protected config?: IntegrationConfig;
  private requestTimestamps: number[] = [];

  async initialize(config: IntegrationConfig): Promise<void> {
    this.config = config;
    await this.onInitialize();
  }

  async destroy(): Promise<void> {
    await this.onDestroy();
    this.config = undefined;
  }

  abstract testConnection(): Promise<{ success: boolean; message: string; details?: any }>;
  abstract handleEvent(event: IntegrationEvent): Promise<IntegrationResponse>;
  abstract getConfigSchema(): IntegrationConfigSchema;

  /**
   * Override to perform custom initialization
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclass
  }

  /**
   * Override to perform custom cleanup
   */
  protected async onDestroy(): Promise<void> {
    // Override in subclass
  }

  /**
   * Check rate limit before making request
   */
  protected async checkRateLimit(): Promise<void> {
    if (!this.config?.rateLimitConfig) {
      return;
    }

    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const { maxRequestsPerMinute } = this.config.rateLimitConfig;

    // Remove timestamps outside window
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < windowMs
    );

    // Check if limit exceeded
    if (this.requestTimestamps.length >= maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitMs = windowMs - (now - oldestTimestamp);
      
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
    }

    this.requestTimestamps.push(now);
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create success response
   */
  protected createSuccessResponse(
    event: IntegrationEvent,
    externalId?: string,
    externalUrl?: string,
    response?: any
  ): IntegrationResponse {
    return {
      success: true,
      integrationId: this.config!.id,
      eventId: event.id,
      timestamp: new Date(),
      externalId,
      externalUrl,
      response
    };
  }

  /**
   * Create error response
   */
  protected createErrorResponse(
    event: IntegrationEvent,
    error: string
  ): IntegrationResponse {
    return {
      success: false,
      integrationId: this.config!.id,
      eventId: event.id,
      timestamp: new Date(),
      error
    };
  }

  /**
   * Make HTTP request with error handling
   */
  protected async httpRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.checkRateLimit();

    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Sentinel-Grid-Integration/1.0',
        ...options.headers
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response;
  }

  /**
   * Get configuration value
   */
  protected getConfig<T = any>(key: string, defaultValue?: T): T {
    return this.config?.config[key] ?? defaultValue;
  }

  /**
   * Get credential value
   */
  protected getCredential<T = string>(key: string, defaultValue?: T): T {
    return this.config?.credentials[key] ?? defaultValue;
  }
}
