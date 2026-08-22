import type {
  ClockHealthState,
  DeviceTimeSample,
} from "../domain/clock-monitoring.types.js";

export interface OffsetCalculationResult {
  signedOffsetSeconds: number;
  absoluteOffsetSeconds: number;
  roundTripTimeMs: number;
  referenceTime: Date;
  timezoneMismatch: boolean;
  healthState: ClockHealthState;
}

export class ClockOffsetEstimator {
  /**
   * Computes latency-compensated clock offset from a single probe sample
   */
  static estimateSingle(sample: DeviceTimeSample): OffsetCalculationResult {
    const rttMs = Math.max(0, sample.endTimestampMs - sample.startTimestampMs);
    const refMidpointMs = sample.startTimestampMs + rttMs / 2;
    const referenceTime = new Date(refMidpointMs);

    const rawOffsetMs = sample.deviceTimestamp.getTime() - refMidpointMs;
    const signedOffsetSeconds = Math.round((rawOffsetMs / 1000) * 100) / 100;
    const absoluteOffsetSeconds = Math.abs(signedOffsetSeconds);

    const timezoneMismatch = this.detectTimezoneMismatch(signedOffsetSeconds);
    const healthState = this.classifyHealthState(absoluteOffsetSeconds);

    return {
      signedOffsetSeconds,
      absoluteOffsetSeconds,
      roundTripTimeMs: rttMs,
      referenceTime,
      timezoneMismatch,
      healthState,
    };
  }

  /**
   * Computes median offset from multi-sample measurements to filter out network jitter
   */
  static estimateMulti(samples: DeviceTimeSample[]): OffsetCalculationResult {
    if (samples.length === 0) {
      throw new Error("Cannot calculate offset from empty sample list");
    }

    const calculated = samples.map((s) => this.estimateSingle(s));

    // Sort by absolute offset to take median
    calculated.sort((a, b) => a.signedOffsetSeconds - b.signedOffsetSeconds);
    const medianIdx = Math.floor(calculated.length / 2);
    const median = calculated[medianIdx] || calculated[0];

    if (!median) {
      throw new Error("Failed to calculate median clock offset");
    }

    // Average RTT
    const avgRtt = Math.round(samples.reduce((sum, s) => sum + s.roundTripTimeMs, 0) / samples.length);

    return {
      signedOffsetSeconds: median.signedOffsetSeconds,
      absoluteOffsetSeconds: Math.abs(median.signedOffsetSeconds),
      roundTripTimeMs: avgRtt,
      referenceTime: median.referenceTime,
      timezoneMismatch: median.timezoneMismatch,
      healthState: median.healthState,
    };
  }

  /**
   * Calculates rate of change in clock offset over elapsed time (sec/hour)
   */
  static calculateDriftRate(
    prev: { offsetSeconds: number; observedAt: Date },
    curr: { offsetSeconds: number; observedAt: Date },
  ): number {
    const elapsedHours = (curr.observedAt.getTime() - prev.observedAt.getTime()) / 3600_000;
    if (elapsedHours <= 0) return 0;

    const offsetDelta = curr.offsetSeconds - prev.offsetSeconds;
    return Math.round((offsetDelta / elapsedHours) * 100) / 100;
  }

  /**
   * Detects whole-hour timezone/DST misconfiguration (e.g. +19,800s = 5.5h IST vs UTC, or 3600s = 1h DST)
   */
  static detectTimezoneMismatch(signedOffsetSeconds: number): boolean {
    const abs = Math.abs(signedOffsetSeconds);
    // Discrepancy > 1800s (30 mins) and closely aligns with 30-minute / 1-hour multiples
    if (abs >= 1790) {
      const halfHourRemainder = abs % 1800;
      if (halfHourRemainder <= 10 || halfHourRemainder >= 1790) {
        return true;
      }
    }
    return false;
  }

  /**
   * Classifies clock offset against operational thresholds:
   * <= 5s: SYNCHRONIZED
   * > 5s and <= 30s: WARNING
   * > 30s: CRITICAL
   */
  static classifyHealthState(offsetSeconds: number): ClockHealthState {
    const abs = Math.abs(offsetSeconds);
    if (abs <= 5.0) {
      return "SYNCHRONIZED";
    }
    if (abs <= 30.0) {
      return "WARNING";
    }
    return "CRITICAL";
  }
}
