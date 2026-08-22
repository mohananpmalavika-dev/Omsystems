/**
 * Base Adapter for Security Posture Collectors
 * 
 * Provides common functionality for all adapters including health tracking,
 * error handling, circuit breaker protection, and telemetry normalization.
 */

import {
  SecurityPostureCollector,
  CollectorHealth,
  SecurityCapability,
} from '../contracts/security-posture-collector';
import {
  SecurityTelemetryResult,
  createUnavailableResult,
  TelemetryErrorCode,
} from '../contracts/telemetry-result';
import { SecurityTelemetryContext } from '../contracts/telemetry-context';
import { CircuitBreaker, createCircuitBreaker, CircuitState } from '../utils/timeout';

/**
 * Base adapter with health tracking and circuit breaker
 */
export abstract class BaseSecurityAdapter<T = unknown> implements SecurityPostureCollector<T> {
  protected collectorId: string;
  protected lastRunAt?: Date;
  protected lastSuccessAt?: Date;
  protected recentFailures: Date[] = [];
  protected recentDurations: number[] = [];
  protected circuitBreaker: CircuitBreaker;
  
  constructor(collectorId: string) {
    this.collectorId = collectorId;
    this.circuitBreaker = createCircuitBreaker(collectorId, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
    });
  }
  
  /**
   * Collect telemetry with automatic health tracking and circuit breaker protection
   */
  async collect(context: SecurityTelemetryContext): Promise<SecurityTelemetryResult<T>[]> {
    const startTime = Date.now();
    this.lastRunAt = new Date();
    
    // Check circuit breaker state
    if (this.circuitBreaker.getState() === CircuitState.OPEN) {
      return [
        createUnavailableResult(
          this.collectorId,
          TelemetryErrorCode.AGENT_UNAVAILABLE,
          `Circuit breaker is OPEN due to repeated failures. Will retry after cooldown.`,
          'unavailable'
        ),
      ];
    }
    
    try {
      // Execute collection through circuit breaker
      const results = await this.circuitBreaker.execute(() => this.doCollect(context));
      
      // Track success
      this.lastSuccessAt = new Date();
      this.recordDuration(Date.now() - startTime);
      
      return results;
    } catch (error) {
      // Track failure
      this.recordFailure();
      this.recordDuration(Date.now() - startTime);
      
      // Determine appropriate error code
      let errorCode = TelemetryErrorCode.COLLECTOR_NOT_CONFIGURED;
      if (error.message?.includes('timeout')) {
        errorCode = TelemetryErrorCode.NETWORK_TIMEOUT;
      } else if (error.message?.includes('auth')) {
        errorCode = TelemetryErrorCode.AUTHENTICATION_FAILED;
      } else if (error.message?.includes('Circuit breaker')) {
        errorCode = TelemetryErrorCode.AGENT_UNAVAILABLE;
      }
      
      return [
        createUnavailableResult(
          this.collectorId,
          errorCode,
          `Collection failed: ${error.message}`
        ),
      ];
    }
  }
  
  /**
   * Abstract method for actual collection logic
   */
  protected abstract doCollect(context: SecurityTelemetryContext): Promise<SecurityTelemetryResult<T>[]>;
  
  /**
   * Query capabilities - override in subclasses
   */
  async capabilities(context: SecurityTelemetryContext): Promise<SecurityCapability[]> {
    return [];
  }
  
  /**
   * Get collector health including circuit breaker state
   */
  async getHealth(): Promise<CollectorHealth> {
    const failures24h = this.recentFailures.filter(
      (date) => Date.now() - date.getTime() < 24 * 60 * 60 * 1000
    ).length;
    
    const avgDuration = this.recentDurations.length > 0
      ? this.recentDurations.reduce((a, b) => a + b, 0) / this.recentDurations.length
      : undefined;
    
    let status: 'healthy' | 'degraded' | 'failed' = 'healthy';
    const circuitState = this.circuitBreaker.getState();
    
    // Circuit breaker open means failed
    if (circuitState === CircuitState.OPEN) {
      status = 'failed';
    } else if (circuitState === CircuitState.HALF_OPEN || failures24h > 10) {
      status = 'failed';
    } else if (failures24h > 3) {
      status = 'degraded';
    }
    
    let error: string | undefined;
    if (circuitState === CircuitState.OPEN) {
      error = 'Circuit breaker OPEN - too many failures';
    } else if (circuitState === CircuitState.HALF_OPEN) {
      error = 'Circuit breaker HALF_OPEN - testing recovery';
    }
    
    return {
      collectorId: this.collectorId,
      status,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      failures24h,
      averageDurationMs: avgDuration,
      error,
    };
  }
  
  /**
   * Reset health tracking and circuit breaker
   */
  resetHealth(): void {
    this.recentFailures = [];
    this.recentDurations = [];
    this.circuitBreaker.reset();
  }
  
  /**
   * Record a failure
   */
  protected recordFailure(): void {
    this.recentFailures.push(new Date());
    
    // Keep only last 50 failures
    if (this.recentFailures.length > 50) {
      this.recentFailures = this.recentFailures.slice(-50);
    }
  }
  
  /**
   * Record execution duration
   */
  protected recordDuration(durationMs: number): void {
    this.recentDurations.push(durationMs);
    
    // Keep only last 20 durations
    if (this.recentDurations.length > 20) {
      this.recentDurations = this.recentDurations.slice(-20);
    }
  }
}
