/**
 * Timeout Utilities
 * 
 * Provides timeout wrappers and circuit breaker pattern for collectors.
 */

import { TelemetryErrorCode } from '../contracts/telemetry-result';

/**
 * Execute a promise with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  readonly code = TelemetryErrorCode.NETWORK_TIMEOUT;
  readonly timeoutMs: number;
  
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject immediately
  HALF_OPEN = 'half_open', // Testing if recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  
  /** Time to wait before attempting half-open (ms) */
  timeout: number;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt?: number;
  
  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
      
      // Try half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }
  
  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;
    
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
    }
  }
  
  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
  
  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = undefined;
  }
}

/**
 * Create a circuit breaker with default configuration
 */
export function createCircuitBreaker(
  name: string,
  overrides?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker(name, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    ...overrides,
  });
}
