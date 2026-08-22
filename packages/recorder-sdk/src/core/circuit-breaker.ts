/**
 * Recorder Request Circuit Breaker & Fault Protection
 * 
 * Prevents cascading connection timeouts and device lockouts across large
 * multi-branch deployments (e.g. 400 branches) when recorders are offline or flapping.
 */

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessThreshold = options?.halfOpenSuccessThreshold ?? 2;
  }

  getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() >= this.nextAttemptAt) {
      this.state = "HALF_OPEN";
      this.successCount = 0;
    }
    return this.state;
  }

  canExecute(): boolean {
    const currentState = this.getState();
    return currentState === "CLOSED" || currentState === "HALF_OPEN";
  }

  recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.reset();
      }
    } else if (this.state === "CLOSED") {
      this.failureCount = 0;
    }
  }

  recordFailure(isCriticalAuthFailure = false): void {
    // If device explicitly rejected credentials (401/403), immediately open circuit to prevent lockout
    if (isCriticalAuthFailure) {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs * 2; // longer backoff for auth lockouts
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
    }
  }

  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker is OPEN (next attempt allowed at ${new Date(this.nextAttemptAt).toISOString()})`);
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error: any) {
      const isAuth = error?.code === "AUTHENTICATION_FAILED" || error?.statusCode === 401 || error?.statusCode === 403;
      this.recordFailure(isAuth);
      throw error;
    }
  }
}
