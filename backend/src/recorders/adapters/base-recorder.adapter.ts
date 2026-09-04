/**
 * Base Recorder Adapter
 * 
 * Provides common functionality for all recorder adapters:
 * - HTTP client with timeout
 * - Error normalization
 * - Check result helpers
 * - Retry logic
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type {
  CheckResult,
  ComplianceState,
  RecorderErrorCode,
  RecorderCheckError,
  Recorder
} from '../types/index.js';
import type { RecorderConnection } from '../recorder-adapter.interface.js';
import {
  RecorderAdapterError,
  RecorderConnectionTimeoutError,
  RecorderAuthenticationError
} from '../recorder-adapter.interface.js';
import type {
  ChannelVideoConfig,
  RecordingSchedule,
  DeviceTimeConfig,
  DeviceNetworkConfig,
} from '../../../../src/types/device-configuration.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Configuration for timeouts and retries
 */
export interface AdapterConfig {
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  
  /** Operation timeout in milliseconds */
  operationTimeoutMs: number;
  
  /** Maximum retry attempts for retryable errors */
  maxRetries: number;
  
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
}

/**
 * Default adapter configuration
 */
const DEFAULT_CONFIG: AdapterConfig = {
  connectionTimeoutMs: 5000,
  operationTimeoutMs: 10000,
  maxRetries: 2,
  retryDelayMs: 1000
};

/**
 * Base recorder adapter
 */
export abstract class BaseRecorderAdapter {
  protected httpClient: AxiosInstance;
  protected config: AdapterConfig;
  protected connected: boolean = false;
  protected authenticated: boolean = false;
  
  constructor(
    protected recorder: Recorder,
    protected connection: RecorderConnection,
    config?: Partial<AdapterConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Create HTTP client with timeout
    this.httpClient = axios.create({
      baseURL: `${connection.protocol}://${connection.ipAddress}:${connection.port}`,
      timeout: this.config.operationTimeoutMs,
      validateStatus: () => true, // Don't throw on any status
      maxRedirects: 0
    });
  }
  
  /**
   * Get adapter type identifier
   */
  abstract getAdapterType(): string;
  
  /**
   * Get adapter version
   */
  getAdapterVersion(): string {
    return '1.0.0';
  }
  
  /**
   * Helper: Create UNKNOWN check result
   */
  protected createUnknownResult<T = unknown>(
    message: string,
    errorCode?: RecorderErrorCode
  ): CheckResult<T> {
    return {
      status: 'unknown',
      message,
      errorCode,
      checkedAt: new Date()
    };
  }
  
  /**
   * Helper: Create HEALTHY check result
   */
  protected createHealthyResult<T>(
    value?: T,
    message?: string
  ): CheckResult<T> {
    return {
      status: 'healthy',
      value,
      message,
      checkedAt: new Date()
    };
  }
  
  /**
   * Helper: Create UNHEALTHY check result
   */
  protected createUnhealthyResult<T = unknown>(
    message: string,
    errorCode?: RecorderErrorCode,
    value?: T
  ): CheckResult<T> {
    return {
      status: 'unhealthy',
      message,
      errorCode,
      value,
      checkedAt: new Date()
    };
  }
  
  /**
   * Helper: Execute with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new RecorderConnectionTimeoutError(
                this.connection.ipAddress,
                timeoutMs
              )
            ),
          timeoutMs
        )
      )
    ]);
  }
  
  /**
   * Helper: Execute with retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryable: boolean = true
  ): Promise<T> {
    let lastError: Error | undefined;
    const maxAttempts = retryable ? this.config.maxRetries + 1 : 1;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // Log retry
        logger.debug(`Retrying ${operationName}`, {
          recorderId: this.recorder.id,
          attempt,
          maxAttempts,
          error: this.normalizeError(error)
        });
        
        // Wait before retry
        await this.delay(this.config.retryDelayMs * attempt);
      }
    }
    
    throw lastError;
  }
  
  /**
   * Helper: Check if error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof RecorderAdapterError) {
      return error.retryable;
    }
    
    if (axios.isAxiosError(error)) {
      // Network errors are retryable
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        return true;
      }
      
      // 5xx errors are retryable
      if (error.response?.status && error.response.status >= 500) {
        return true;
      }
      
      // 408 Request Timeout is retryable
      if (error.response?.status === 408) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Helper: Normalize error to RecorderCheckError
   */
  protected normalizeError(error: unknown): RecorderCheckError {
    const timestamp = new Date();
    
    // RecorderAdapterError
    if (error instanceof RecorderAdapterError) {
      return {
        code: error.code as RecorderErrorCode,
        message: error.message,
        retryable: error.retryable,
        cause: error.cause,
        timestamp
      };
    }
    
    // Axios errors
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Network errors
      if (axiosError.code === 'ECONNREFUSED') {
        return {
          code: 'CONNECTION_REFUSED',
          message: `Connection refused to ${this.connection.ipAddress}:${this.connection.port}`,
          retryable: true,
          cause: error,
          timestamp
        };
      }
      
      if (axiosError.code === 'ETIMEDOUT') {
        return {
          code: 'NETWORK_TIMEOUT',
          message: `Connection timed out after ${this.config.connectionTimeoutMs}ms`,
          retryable: true,
          cause: error,
          timestamp
        };
      }
      
      if (axiosError.code === 'ENOTFOUND') {
        return {
          code: 'DNS_RESOLUTION_FAILED',
          message: `Could not resolve hostname ${this.connection.ipAddress}`,
          retryable: false,
          cause: error,
          timestamp
        };
      }
      
      // HTTP status errors
      if (axiosError.response) {
        const status = axiosError.response.status;
        
        if (status === 401 || status === 403) {
          return {
            code: 'AUTHENTICATION_FAILED',
            message: `Authentication failed (HTTP ${status})`,
            retryable: false,
            cause: error,
            timestamp
          };
        }
        
        if (status === 404) {
          return {
            code: 'CHANNEL_NOT_FOUND',
            message: 'Resource not found (HTTP 404)',
            retryable: false,
            cause: error,
            timestamp
          };
        }
        
        if (status >= 500) {
          return {
            code: 'VENDOR_API_ERROR',
            message: `Recorder API error (HTTP ${status})`,
            retryable: true,
            cause: error,
            timestamp
          };
        }
      }
    }
    
    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'VENDOR_API_ERROR',
      message: `Unexpected error: ${message}`,
      retryable: false,
      cause: error,
      timestamp
    };
  }
  
  /**
   * Helper: Delay execution
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Helper: Aggregate check statuses
   * 
   * Priority: unhealthy > unknown > healthy
   */
  protected aggregateStatus(checks: Array<{ status: ComplianceState }>): ComplianceState {
    if (checks.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (checks.some(check => check.status === 'unknown')) {
      return 'unknown';
    }
    
    return 'healthy';
  }
  
  /**
   * Helper: Safe check execution
   * Catches exceptions and returns UNKNOWN result
   */
  protected async safeCheck<T>(
    operation: () => Promise<CheckResult<T>>,
    operationName: string
  ): Promise<CheckResult<T>> {
    try {
      return await operation();
    } catch (error) {
      logger.error(`${operationName} failed`, {
        recorderId: this.recorder.id,
        error: this.normalizeError(error)
      });
      
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<T>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Helper: Log not implemented warning
   */
  protected logNotImplemented(methodName: string): void {
    logger.warn(`${methodName} not implemented for ${this.getAdapterType()}`, {
      recorderId: this.recorder.id,
      vendor: this.recorder.vendor
    });
  }

  async getChannelEncoding(channelId: string): Promise<CheckResult<ChannelVideoConfig>> {
    this.logNotImplemented('getChannelEncoding');
    return this.createUnknownResult('getChannelEncoding not implemented', 'UNSUPPORTED_FEATURE');
  }

  async setChannelEncoding(channelId: string, _config: ChannelVideoConfig): Promise<CheckResult<void>> {
    this.logNotImplemented('setChannelEncoding');
    return this.createUnknownResult('setChannelEncoding not implemented', 'UNSUPPORTED_FEATURE');
  }

  async getRecordingSchedule(channelId: string): Promise<CheckResult<RecordingSchedule>> {
    this.logNotImplemented('getRecordingSchedule');
    return this.createUnknownResult('getRecordingSchedule not implemented', 'UNSUPPORTED_FEATURE');
  }

  async setRecordingSchedule(channelId: string, _schedule: RecordingSchedule): Promise<CheckResult<void>> {
    this.logNotImplemented('setRecordingSchedule');
    return this.createUnknownResult('setRecordingSchedule not implemented', 'UNSUPPORTED_FEATURE');
  }

  async setTimeConfiguration(_timeConfig: DeviceTimeConfig): Promise<CheckResult<void>> {
    this.logNotImplemented('setTimeConfiguration');
    return this.createUnknownResult('setTimeConfiguration not implemented', 'UNSUPPORTED_FEATURE');
  }

  async getNetworkConfiguration(): Promise<CheckResult<DeviceNetworkConfig>> {
    this.logNotImplemented('getNetworkConfiguration');
    return this.createUnknownResult('getNetworkConfiguration not implemented', 'UNSUPPORTED_FEATURE');
  }

  async setNetworkConfiguration(_config: DeviceNetworkConfig): Promise<CheckResult<void>> {
    this.logNotImplemented('setNetworkConfiguration');
    return this.createUnknownResult('setNetworkConfiguration not implemented', 'UNSUPPORTED_FEATURE');
  }
  
  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.authenticated = false;
  }
}
