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
    if (!Number.isFinite(windowStart.getTime()) || !Number.isFinite(windowEnd.getTime()) || windowEnd < windowStart) {
      throw new RangeError("Invalid availability report window");
    }
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

    // Sweep interval boundaries once. Overlapping samples and overlapping
    // maintenance windows must never count the same second twice.
    const changes = new Map<number, Array<{ state: string; delta: number }>>();
    const addRange = (start: number, end: number, state: string) => {
      start = Math.max(start, windowStart.getTime());
      end = Math.min(end, windowEnd.getTime());
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const atStart = changes.get(start) ?? [];
      atStart.push({ state, delta: 1 });
      changes.set(start, atStart);
      const atEnd = changes.get(end) ?? [];
      atEnd.push({ state, delta: -1 });
      changes.set(end, atEnd);
    };
    for (const interval of intervals) {
      addRange(interval.startedAt.getTime(), interval.endedAt?.getTime() ?? windowEnd.getTime(), interval.state);
    }
    for (const maintenance of maintenanceExclusions) {
      addRange(maintenance.startAt.getTime(), maintenance.endAt.getTime(), "MAINTENANCE");
    }
    const boundaries = [...new Set([windowStart.getTime(), windowEnd.getTime(), ...changes.keys()])].sort((a, b) => a - b);
    const active = new Map<string, number>();
    let availableMs = 0;
    let unavailableMs = 0;
    let unknownMs = 0;
    for (let index = 0; index < boundaries.length - 1; index++) {
      const at = boundaries[index]!;
      for (const change of changes.get(at) ?? []) {
        active.set(change.state, (active.get(change.state) ?? 0) + change.delta);
      }
      if ((active.get("MAINTENANCE") ?? 0) > 0) continue;
      const duration = boundaries[index + 1]! - at;
      // A conflicting healthy sample must not hide observed failure or unknown data.
      if ((active.get("FAILED") ?? 0) > 0) unavailableMs += duration;
      else if ((active.get("UNKNOWN") ?? 0) > 0) unknownMs += duration;
      else if ((active.get("HEALTHY") ?? 0) > 0 || (active.get("DEGRADED") ?? 0) > 0) availableMs += duration;
      else unknownMs += duration;
    }
    const availableSec = Math.floor(availableMs / 1000);
    const unavailableSec = Math.floor(unavailableMs / 1000);
    const unknownSec = Math.floor(unknownMs / 1000);
    const eligibleMs = availableMs + unavailableMs + unknownMs;
    const effectiveMonitored = availableMs + unavailableMs;
    const availabilityPct = effectiveMonitored === 0 ? null : Math.round(availableMs / effectiveMonitored * 10000) / 100;
    const monitoringCoveragePct = eligibleMs === 0 ? 100 : Math.round(effectiveMonitored / eligibleMs * 10000) / 100;

    return {
      availableSeconds: availableSec,
      unavailableSeconds: unavailableSec,
      unknownSeconds: unknownSec,
      monitoredSeconds: Math.floor(eligibleMs / 1000),
      availabilityPct,
      monitoringCoveragePct,
    };
  }
}
