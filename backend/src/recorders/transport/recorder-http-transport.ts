/**
 * Recorder HTTP Transport Layer
 * 
 * Provides standardized HTTP operations for all recorder adapters.
 * Handles:
 * - Timeout enforcement
 * - Retry logic with exponential backoff
 * - Error normalization
 * - Request/response logging
 * - Credential sanitization
 * 
 * IMPORTANT: This layer handles transport concerns only.
 * It does NOT interpret recorder-specific responses.
 */

import type { RecorderErrorCode } from '../contracts/evidence-value.js';
import { logger } from '../../utils/logger.js';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  /**
   * Base URL for recorder
   */
  baseUrl: string;

  /**
   * Request timeout in milliseconds
   */
  timeoutMs: number;

  /**
   * Maximum retry attempts
   */
  maxRetries: number;

  /**
   * Whether to verify TLS certificates
   */
  tlsVerify: boolean;

  /**
   * Custom TLS certificate (if applicable)
   */
  tlsCert?: string;

  /**
   * HTTP connection pool settings
   */
  keepAlive?: boolean;
  maxSockets?: number;

  /**
   * User agent string
   */
  userAgent?: string;
}

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  /**
   * HTTP method
   */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Request body
   */
  body?: any;

  /**
   * Query parameters
   */
  params?: Record<string, string | number | boolean>;

  /**
   * Request timeout (overrides config default)
   */
  timeoutMs?: number;

  /**
   * Whether to retry on failure
   */
  retry?: boolean;

  /**
   * Response type
   */
  responseType?: 'json' | 'text' | 'arraybuffer' | 'stream';
}

/**
 * HTTP response
 */
export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  latencyMs: number;
}

/**
 * Normalized transport error
 */
export class RecorderTransportError extends Error {
  constructor(
    message: string,
    public readonly code: RecorderErrorCode,
    public readonly httpStatus?: number,
    public readonly vendorCode?: string,
    public readonly latencyMs?: number,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'RecorderTransportError';
  }
}

/**
 * Recorder HTTP transport
 */
export class RecorderHttpTransport {
  private readonly axios: AxiosInstance;
  private readonly config: HttpTransportConfig;
  private readonly recorderId: string;

  constructor(
    recorderId: string,
    config: HttpTransportConfig
  ) {
    this.recorderId = recorderId;
    this.config = config;

    // Create axios instance with connection pooling
    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        'User-Agent': config.userAgent ?? 'OmniVision-Recorder-Client/1.0'
      },
      httpAgent: new HttpAgent({
        keepAlive: config.keepAlive ?? true,
        maxSockets: config.maxSockets ?? 4,
        timeout: config.timeoutMs
      }),
      httpsAgent: new HttpsAgent({
        keepAlive: config.keepAlive ?? true,
        maxSockets: config.maxSockets ?? 4,
        timeout: config.timeoutMs,
        rejectUnauthorized: config.tlsVerify
      }),
      validateStatus: () => true // Handle all statuses ourselves
    });
  }

  /**
   * Execute HTTP request
   */
  async request<T = any>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    const method = options.method ?? 'GET';
    const shouldRetry = options.retry ?? true;

    let lastError: Error | undefined;
    let attempt = 0;
    const maxAttempts = shouldRetry ? this.config.maxRetries : 1;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        logger.debug('Recorder HTTP request', {
          recorderId: this.recorderId,
          method,
          path: this.sanitizePath(path),
          attempt,
          maxAttempts
        });

        const response = await this.executeRequest<T>(path, options);
        const latencyMs = Date.now() - startTime;

        logger.debug('Recorder HTTP response', {
          recorderId: this.recorderId,
          method,
          path: this.sanitizePath(path),
          status: response.status,
          latencyMs
        });

        // Check if response indicates success
        if (response.status >= 200 && response.status < 300) {
          return { ...response, latencyMs };
        }

        // Check for retriable HTTP errors
        if (shouldRetry && this.isRetriableStatus(response.status) && attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        // Non-retriable error or max attempts reached
        throw this.normalizeHttpError(response, latencyMs);

      } catch (error) {
        const latencyMs = Date.now() - startTime;
        lastError = error as Error;

        // Check if error is retriable
        if (shouldRetry && this.isRetriableError(error) && attempt < maxAttempts) {
          logger.debug('Retrying recorder request', {
            recorderId: this.recorderId,
            attempt,
            maxAttempts,
            error: this.getErrorSummary(error)
          });

          await this.backoff(attempt);
          continue;
        }

        // Non-retriable or max attempts reached
        throw this.normalizeError(error, latencyMs);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw this.normalizeError(lastError!, Date.now() - startTime);
  }

  /**
   * GET request
   */
  async get<T = any>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(
    path: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T = any>(
    path: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Execute raw axios request
   */
  private async executeRequest<T>(
    path: string,
    options: HttpRequestOptions
  ): Promise<AxiosResponse<T>> {
    const axiosConfig: AxiosRequestConfig = {
      url: path,
      method: options.method ?? 'GET',
      headers: options.headers,
      params: options.params,
      data: options.body,
      timeout: options.timeoutMs ?? this.config.timeoutMs,
      responseType: options.responseType ?? 'json'
    };

    return await this.axios.request<T>(axiosConfig);
  }

  /**
   * Check if HTTP status is retriable
   */
  private isRetriableStatus(status: number): boolean {
    return [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ].includes(status);
  }

  /**
   * Check if error is retriable
   */
  private isRetriableError(error: any): boolean {
    if (error instanceof RecorderTransportError) {
      const retriableCodes: RecorderErrorCode[] = [
        'TIMEOUT',
        'NETWORK_UNREACHABLE',
        'CONNECTION_REFUSED',
        'RATE_LIMITED',
        'TOO_MANY_REQUESTS',
        'DEVICE_BUSY'
      ];
      return retriableCodes.includes(error.code);
    }

    if (axios.isAxiosError(error)) {
      // Network errors
      if (!error.response) {
        return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(
          error.code ?? ''
        );
      }

      // HTTP errors
      return this.isRetriableStatus(error.response.status);
    }

    return false;
  }

  /**
   * Exponential backoff with jitter
   */
  private async backoff(attempt: number): Promise<void> {
    const baseDelayMs = 200;
    const maxDelayMs = 5000;
    
    const exponentialDelay = Math.min(
      baseDelayMs * Math.pow(2, attempt - 1),
      maxDelayMs
    );

    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const delayMs = Math.round(exponentialDelay + jitter);

    logger.debug('Backing off before retry', {
      recorderId: this.recorderId,
      attempt,
      delayMs
    });

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Normalize HTTP response error
   */
  private normalizeHttpError(
    response: AxiosResponse,
    latencyMs: number
  ): RecorderTransportError {
    const status = response.status;
    const statusText = response.statusText;

    // Authentication errors
    if (status === 401) {
      return new RecorderTransportError(
        'Authentication required',
        'AUTH_REQUIRED',
        status,
        undefined,
        latencyMs
      );
    }

    if (status === 403) {
      return new RecorderTransportError(
        'Access forbidden',
        'FORBIDDEN',
        status,
        undefined,
        latencyMs
      );
    }

    // Not found
    if (status === 404) {
      return new RecorderTransportError(
        'Resource not found',
        'NOT_FOUND',
        status,
        undefined,
        latencyMs
      );
    }

    // Rate limiting
    if (status === 429) {
      const retryAfter = response.headers['retry-after'];
      return new RecorderTransportError(
        'Rate limited',
        'RATE_LIMITED',
        status,
        undefined,
        latencyMs,
        retryAfter ? { retryAfterSeconds: parseInt(retryAfter, 10) } : undefined
      );
    }

    // Server errors
    if (status >= 500) {
      return new RecorderTransportError(
        `Server error: ${statusText}`,
        'DEVICE_ERROR',
        status,
        undefined,
        latencyMs
      );
    }

    // Client errors
    if (status >= 400) {
      return new RecorderTransportError(
        `Client error: ${statusText}`,
        'INVALID_REQUEST',
        status,
        undefined,
        latencyMs
      );
    }

    // Unexpected status
    return new RecorderTransportError(
      `Unexpected HTTP status: ${status} ${statusText}`,
      'UNKNOWN_ERROR',
      status,
      undefined,
      latencyMs
    );
  }

  /**
   * Normalize axios error
   */
  private normalizeError(
    error: any,
    latencyMs: number
  ): RecorderTransportError {
    if (error instanceof RecorderTransportError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      // Network errors (no response)
      if (!error.response) {
        return this.normalizeNetworkError(error, latencyMs);
      }

      // HTTP errors (with response)
      return this.normalizeHttpError(error.response, latencyMs);
    }

    // Unknown error
    return new RecorderTransportError(
      error.message || 'Unknown error occurred',
      'UNKNOWN_ERROR',
      undefined,
      undefined,
      latencyMs
    );
  }

  /**
   * Normalize network error (no HTTP response)
   */
  private normalizeNetworkError(
    error: AxiosError,
    latencyMs: number
  ): RecorderTransportError {
    const code = error.code;

    if (code === 'ECONNREFUSED') {
      return new RecorderTransportError(
        'Connection refused',
        'CONNECTION_REFUSED',
        undefined,
        undefined,
        latencyMs
      );
    }

    if (code === 'ENOTFOUND') {
      return new RecorderTransportError(
        'DNS lookup failed',
        'DNS_FAILURE',
        undefined,
        undefined,
        latencyMs
      );
    }

    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
      return new RecorderTransportError(
        'Request timed out',
        'TIMEOUT',
        undefined,
        undefined,
        latencyMs
      );
    }

    if (code === 'ECONNRESET') {
      return new RecorderTransportError(
        'Connection reset',
        'NETWORK_UNREACHABLE',
        undefined,
        undefined,
        latencyMs
      );
    }

    if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return new RecorderTransportError(
        'TLS certificate validation failed',
        'CERTIFICATE_ERROR',
        undefined,
        undefined,
        latencyMs
      );
    }

    // Generic network error
    return new RecorderTransportError(
      error.message || 'Network error',
      'NETWORK_UNREACHABLE',
      undefined,
      undefined,
      latencyMs
    );
  }

  /**
   * Get error summary for logging
   */
  private getErrorSummary(error: any): string {
    if (error instanceof RecorderTransportError) {
      return `${error.code}: ${error.message}`;
    }

    if (axios.isAxiosError(error)) {
      if (error.response) {
        return `HTTP ${error.response.status}: ${error.response.statusText}`;
      }
      return `Network: ${error.code} ${error.message}`;
    }

    return error.message || 'Unknown error';
  }

  /**
   * Sanitize path for logging (remove credentials)
   */
  private sanitizePath(path: string): string {
    try {
      const url = new URL(path, this.config.baseUrl);
      
      // Remove username/password from URL
      if (url.username || url.password) {
        url.username = '';
        url.password = '';
      }

      // Remove sensitive query parameters
      const sensitiveParams = ['username', 'password', 'token', 'auth', 'key', 'secret'];
      sensitiveParams.forEach(param => {
        if (url.searchParams.has(param)) {
          url.searchParams.set(param, '***');
        }
      });

      return url.pathname + url.search;
    } catch {
      // If URL parsing fails, return original path
      return path;
    }
  }

  /**
   * Close transport and cleanup connections
   */
  destroy(): void {
    // Axios doesn't have explicit cleanup, but we can log
    logger.debug('Destroying HTTP transport', {
      recorderId: this.recorderId
    });
  }
}
