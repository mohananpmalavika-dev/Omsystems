/**
 * Base Infrastructure Health Probe
 * 
 * All infrastructure probes extend this to provide consistent error handling,
 * timeout management, and fallback behavior.
 */

export interface ProbeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  probeDurationMs: number;
  timestamp: string;
}

export interface ProbeConfig {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  enabled: boolean;
}

export abstract class BaseInfrastructureProbe<T> {
  protected config: ProbeConfig;

  constructor(config: Partial<ProbeConfig> = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 5000,
      retryCount: config.retryCount ?? 2,
      retryDelayMs: config.retryDelayMs ?? 500,
      enabled: config.enabled ?? true,
    };
  }

  async probe(): Promise<ProbeResult<T>> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: "Probe disabled",
        probeDurationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        const data = await this.withTimeout(
          this.probeImplementation(),
          this.config.timeoutMs,
        );

        return {
          success: true,
          data,
          probeDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.retryCount) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || "Unknown probe error",
      probeDurationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  protected abstract probeImplementation(): Promise<T>;

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Probe timeout")), timeoutMs),
      ),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
