/**
 * Voice Error Handler Service
 * 
 * Production-grade error handling with circuit breakers, retry logic,
 * detailed error codes, and graceful degradation for voice biometric system.
 */

export enum VoiceErrorCode {
  // Audio Processing Errors
  AUDIO_FORMAT_UNSUPPORTED = "AUDIO_FORMAT_UNSUPPORTED",
  AUDIO_PROCESSING_FAILED = "AUDIO_PROCESSING_FAILED",
  AUDIO_TOO_SHORT = "AUDIO_TOO_SHORT",
  AUDIO_TOO_LONG = "AUDIO_TOO_LONG",
  AUDIO_QUALITY_INSUFFICIENT = "AUDIO_QUALITY_INSUFFICIENT",
  
  // Model Errors
  MODEL_NOT_LOADED = "MODEL_NOT_LOADED",
  MODEL_INFERENCE_FAILED = "MODEL_INFERENCE_FAILED",
  MODEL_INITIALIZATION_FAILED = "MODEL_INITIALIZATION_FAILED",
  
  // Enrollment Errors
  ENROLLMENT_NOT_FOUND = "ENROLLMENT_NOT_FOUND",
  ENROLLMENT_INCOMPLETE = "ENROLLMENT_INCOMPLETE",
  ENROLLMENT_EXPIRED = "ENROLLMENT_EXPIRED",
  INSUFFICIENT_SAMPLES = "INSUFFICIENT_SAMPLES",
  SAMPLE_QUALITY_FAILED = "SAMPLE_QUALITY_FAILED",
  
  // Authentication Errors
  VOICE_NOT_MATCHED = "VOICE_NOT_MATCHED",
  LOW_CONFIDENCE = "LOW_CONFIDENCE",
  PROFILE_NOT_FOUND = "PROFILE_NOT_FOUND",
  SPOOFING_DETECTED = "SPOOFING_DETECTED",
  LIVENESS_CHECK_FAILED = "LIVENESS_CHECK_FAILED",
  
  // System Errors
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  DATABASE_ERROR = "DATABASE_ERROR",
  STORAGE_ERROR = "STORAGE_ERROR",
  
  // Security Errors
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  CONSENT_NOT_GIVEN = "CONSENT_NOT_GIVEN",
  UNAUTHORIZED = "UNAUTHORIZED",
  
  // Unknown
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class VoiceError extends Error {
  constructor(
    public code: VoiceErrorCode,
    message: string,
    public statusCode: number = 500,
    public retryable: boolean = false,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "VoiceError";
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: VoiceErrorCode[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxAttempts: number;
}

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        throw new VoiceError(
          VoiceErrorCode.SERVICE_UNAVAILABLE,
          "Circuit breaker is open - service temporarily unavailable",
          503,
          true
        );
      }
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

  private onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.config.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }
}

export class VoiceErrorHandler {
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: [
      VoiceErrorCode.SERVICE_UNAVAILABLE,
      VoiceErrorCode.MODEL_INFERENCE_FAILED,
      VoiceErrorCode.DATABASE_ERROR,
      VoiceErrorCode.STORAGE_ERROR,
    ],
  };

  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(retryConfig?: Partial<RetryConfig>) {
    if (retryConfig) {
      this.retryConfig = { ...this.retryConfig, ...retryConfig };
    }
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    operation: string = "operation"
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.retryConfig.maxAttempts) {
      attempt++;

      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt >= this.retryConfig.maxAttempts;

        console.log(
          `${operation} attempt ${attempt}/${this.retryConfig.maxAttempts} failed:`,
          error.message,
          `(retryable: ${isRetryable})`
        );

        if (!isRetryable || isLastAttempt) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelayMs *
            Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelayMs
        );

        await this.sleep(delay);
      }
    }

    throw this.wrapError(lastError!, operation);
  }

  /**
   * Execute with circuit breaker
   */
  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    let breaker = this.circuitBreakers.get(serviceName);

    if (!breaker) {
      breaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        halfOpenMaxAttempts: 3,
        ...config,
      });
      this.circuitBreakers.set(serviceName, breaker);
    }

    return breaker.execute(fn);
  }

  /**
   * Wrap error in VoiceError with proper code
   */
  wrapError(error: any, context?: string): VoiceError {
    if (error instanceof VoiceError) {
      return error;
    }

    // Map common errors to VoiceErrorCode
    const message = error.message || "Unknown error occurred";
    const contextMsg = context ? `${context}: ${message}` : message;

    if (message.includes("audio") || message.includes("format")) {
      if (message.includes("unsupported") || message.includes("format")) {
        return new VoiceError(
          VoiceErrorCode.AUDIO_FORMAT_UNSUPPORTED,
          contextMsg,
          400,
          false
        );
      }
      return new VoiceError(
        VoiceErrorCode.AUDIO_PROCESSING_FAILED,
        contextMsg,
        500,
        true
      );
    }

    if (message.includes("model") || message.includes("inference")) {
      return new VoiceError(
        VoiceErrorCode.MODEL_INFERENCE_FAILED,
        contextMsg,
        503,
        true
      );
    }

    if (message.includes("database") || message.includes("query")) {
      return new VoiceError(
        VoiceErrorCode.DATABASE_ERROR,
        contextMsg,
        500,
        true
      );
    }

    if (message.includes("timeout")) {
      return new VoiceError(
        VoiceErrorCode.SERVICE_UNAVAILABLE,
        contextMsg,
        504,
        true
      );
    }

    return new VoiceError(
      VoiceErrorCode.UNKNOWN_ERROR,
      contextMsg,
      500,
      false,
      { originalError: error.name }
    );
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof VoiceError) {
      return (
        error.retryable ||
        this.retryConfig.retryableErrors.includes(error.code)
      );
    }

    // Network errors are generally retryable
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      return true;
    }

    return false;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(serviceName: string): CircuitState | null {
    return this.circuitBreakers.get(serviceName)?.getState() || null;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(serviceName: string) {
    this.circuitBreakers.get(serviceName)?.reset();
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let errorHandlerInstance: VoiceErrorHandler | null = null;

export function getVoiceErrorHandler(): VoiceErrorHandler {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new VoiceErrorHandler();
  }
  return errorHandlerInstance;
}
