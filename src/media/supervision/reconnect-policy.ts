/**
 * Reconnect Policy with Exponential Backoff, Jitter, and Stable Window Reset
 */

import { FailureClass } from './stream-metrics.js';

export class ReconnectPolicy {
  private readonly baseDelaysMs: readonly number[] = [1000, 2000, 5000, 10000, 20000, 30000];
  private readonly stableWindowMs: number;

  constructor(stableWindowSeconds: number = 60) {
    this.stableWindowMs = stableWindowSeconds * 1000;
  }

  /**
   * Compute backoff delay with random jitter (+/- 20%) to prevent reconnect storms.
   */
  getDelay(attempt: number, failureClass: FailureClass = FailureClass.TRANSIENT): number {
    // Authentication failures must not spam rapid retries; force 30s minimum delay
    if (failureClass === FailureClass.AUTHENTICATION) {
      return 30000 + Math.round(Math.random() * 5000);
    }

    // Configuration errors (e.g. 404 stream path) retry at slower 30s intervals
    if (failureClass === FailureClass.CONFIGURATION) {
      return 30000;
    }

    const index = Math.min(Math.max(0, attempt), this.baseDelaysMs.length - 1);
    const base = this.baseDelaysMs[index] ?? 30000;

    // Jitter: +/- 20%
    const jitter = base * (Math.random() * 0.4 - 0.2);
    return Math.max(500, Math.round(base + jitter));
  }

  /**
   * Check if stream has been continuously healthy long enough to reset the backoff counter.
   */
  shouldResetBackoff(healthySince: Date | undefined, nowMs: number = Date.now()): boolean {
    if (!healthySince) return false;
    return nowMs - healthySince.getTime() >= this.stableWindowMs;
  }
}
