import type {
  AvailabilityResult,
  HealthInterval,
} from "../domain/sla.types.js";

export interface MaintenanceExclusion {
  startAt: Date;
  endAt: Date;
}

export class AvailabilityCalculator {
  static calculate(
    intervals: HealthInterval[],
    windowStart: Date,
    windowEnd: Date,
    maintenanceExclusions: MaintenanceExclusion[] = [],
  ): AvailabilityResult {
    const totalWindowSeconds = Math.max(
      0,
      Math.floor((windowEnd.getTime() - windowStart.getTime()) / 1000),
    );

    if (totalWindowSeconds === 0) {
      return {
        availableSeconds: 0,
        unavailableSeconds: 0,
        unknownSeconds: 0,
        monitoredSeconds: 0,
        availabilityPct: null,
        monitoringCoveragePct: 100,
      };
    }

    let availableSec = 0;
    let unavailableSec = 0;
    let unknownSec = 0;

    for (const interval of intervals) {
      const iStart = new Date(Math.max(interval.startedAt.getTime(), windowStart.getTime()));
      const iEnd = new Date(
        Math.min(interval.endedAt ? interval.endedAt.getTime() : windowEnd.getTime(), windowEnd.getTime()),
      );

      if (iEnd <= iStart) continue;

      let durationSec = Math.floor((iEnd.getTime() - iStart.getTime()) / 1000);

      // Check for maintenance exclusion
      for (const maint of maintenanceExclusions) {
        const mStart = Math.max(maint.startAt.getTime(), iStart.getTime());
        const mEnd = Math.min(maint.endAt.getTime(), iEnd.getTime());
        if (mEnd > mStart) {
          const maintSec = Math.floor((mEnd - mStart) / 1000);
          durationSec = Math.max(0, durationSec - maintSec);
        }
      }

      if (interval.state === "HEALTHY") {
        availableSec += durationSec;
      } else if (interval.state === "FAILED") {
        unavailableSec += durationSec;
      } else if (interval.state === "UNKNOWN") {
        unknownSec += durationSec;
      } else if (interval.state === "DEGRADED") {
        // Degraded provides video/network but with warning (count 80% available or full available based on config)
        availableSec += durationSec;
      }
    }

    // Cap at total window seconds
    const observedTotal = availableSec + unavailableSec + unknownSec;
    if (observedTotal < totalWindowSeconds) {
      // If intervals did not span the full day, default unaccounted period to HEALTHY if baseline exists, or UNKNOWN
      const unaccounted = totalWindowSeconds - observedTotal;
      if (availableSec > 0 || unavailableSec === 0) {
        availableSec += unaccounted;
      } else {
        unknownSec += unaccounted;
      }
    }

    const effectiveMonitored = availableSec + unavailableSec;
    const availabilityPct =
      effectiveMonitored === 0
        ? null
        : Math.round((availableSec / effectiveMonitored) * 10000) / 100;

    const monitoringCoveragePct =
      totalWindowSeconds === 0
        ? 100
        : Math.round(((totalWindowSeconds - unknownSec) / totalWindowSeconds) * 10000) / 100;

    return {
      availableSeconds: availableSec,
      unavailableSeconds: unavailableSec,
      unknownSeconds: unknownSec,
      monitoredSeconds: totalWindowSeconds,
      availabilityPct,
      monitoringCoveragePct,
    };
  }
}
