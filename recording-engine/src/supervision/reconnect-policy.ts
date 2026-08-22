export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: number; // 0 to 1
  stableWindowSeconds?: number;
}

export class ReconnectPolicy {
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly factor: number;
  private readonly jitter: number;
  private readonly stableWindowSeconds: number;

  private attempts = 0;
  private lastConnectedAt?: Date;

  constructor(options: ReconnectOptions = {}) {
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 60000;
    this.factor = options.factor ?? 2;
    this.jitter = options.jitter ?? 0.2;
    this.stableWindowSeconds = options.stableWindowSeconds ?? 60;
  }

  recordConnectionSuccess(connectedAt: Date = new Date()): void {
    this.lastConnectedAt = connectedAt;
    // Check if previous connection was stable
    setTimeout(() => {
      if (this.lastConnectedAt === connectedAt) {
        this.reset();
      }
    }, this.stableWindowSeconds * 1000).unref();
  }

  getNextDelayMs(): number {
    this.attempts += 1;
    const baseDelay = Math.min(
      this.maxDelayMs,
      this.initialDelayMs * Math.pow(this.factor, Math.min(this.attempts - 1, 10)),
    );

    // Apply jitter: +/- jitter percent
    const randomFactor = 1 + (Math.random() * 2 - 1) * this.jitter;
    return Math.floor(Math.min(this.maxDelayMs, baseDelay * randomFactor));
  }

  getAttempts(): number {
    return this.attempts;
  }

  reset(): void {
    this.attempts = 0;
  }
}
