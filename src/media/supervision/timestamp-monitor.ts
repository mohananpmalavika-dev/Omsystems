/**
 * Timestamp Progression & Clock Drift Monitor
 * Validates PTS/DTS continuity, detects freezes, and evaluates camera clock drift.
 */

export interface TimestampProgressionStatus {
  isProgressionHealthy: boolean;
  isTimestampStalled: boolean;
  hasBackwardJump: boolean;
  hasExcessiveDiscontinuity: boolean;
  consecutiveDiscontinuities: number;
  lastPts?: number;
  lastDts?: number;
  clockOffsetMs?: number;
  clockDriftStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export class TimestampMonitor {
  private lastPts?: number;
  private lastDts?: number;
  private lastTimestampObservedAt?: number;
  private consecutiveDiscontinuities = 0;
  private clockOffsetMs?: number;

  /**
   * Ingest a frame timestamp and evaluate progression.
   * @param pts Presentation timestamp in milliseconds
   * @param dts Decode timestamp in milliseconds
   * @param cameraTime Optional wall-clock timestamp embedded by camera
   * @param serverTime Current server reference time
   */
  update(
    pts: number,
    dts?: number,
    cameraTime?: Date,
    serverTime: Date = new Date()
  ): TimestampProgressionStatus {
    const now = Date.now();
    let isTimestampStalled = false;
    let hasBackwardJump = false;
    let hasExcessiveDiscontinuity = false;

    if (this.lastPts !== undefined) {
      const ptsDelta = pts - this.lastPts;

      if (ptsDelta === 0) {
        // PTS is not advancing
        isTimestampStalled = true;
        this.consecutiveDiscontinuities++;
      } else if (ptsDelta < -100) {
        // Tolerates slight jitter (-100ms) for B-frame reordering; larger drops indicate backward jumps
        hasBackwardJump = true;
        this.consecutiveDiscontinuities++;
      } else if (ptsDelta > 10000) {
        // >10s time jump
        hasExcessiveDiscontinuity = true;
        this.consecutiveDiscontinuities++;
      } else {
        // Valid forward progression
        this.consecutiveDiscontinuities = Math.max(0, this.consecutiveDiscontinuities - 1);
      }
    }

    this.lastPts = pts;
    if (dts !== undefined) this.lastDts = dts;
    this.lastTimestampObservedAt = now;

    // Clock drift calculation
    let clockDriftStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (cameraTime) {
      this.clockOffsetMs = cameraTime.getTime() - serverTime.getTime();
      const absOffsetSec = Math.abs(this.clockOffsetMs) / 1000;
      if (absOffsetSec > 30) {
        clockDriftStatus = 'CRITICAL';
      } else if (absOffsetSec >= 5) {
        clockDriftStatus = 'WARNING';
      } else {
        clockDriftStatus = 'HEALTHY';
      }
    }

    const isProgressionHealthy =
      !isTimestampStalled && !hasBackwardJump && this.consecutiveDiscontinuities < 3;

    return {
      isProgressionHealthy,
      isTimestampStalled,
      hasBackwardJump,
      hasExcessiveDiscontinuity,
      consecutiveDiscontinuities: this.consecutiveDiscontinuities,
      lastPts: this.lastPts,
      lastDts: this.lastDts,
      clockOffsetMs: this.clockOffsetMs,
      clockDriftStatus,
    };
  }

  reset(): void {
    this.lastPts = undefined;
    this.lastDts = undefined;
    this.lastTimestampObservedAt = undefined;
    this.consecutiveDiscontinuities = 0;
    this.clockOffsetMs = undefined;
  }
}
