/**
 * Real-Time Counter Queue Depth & SLA Monitoring Engine
 * 
 * Tracks customer queue progression, measures queue depth and wait times,
 * audits teller attendance, flags SLA breaches, and generates counter dispatch recommendations.
 */

import { DensityEstimator } from './density-estimator.js';
import type {
  Point,
  CounterQueueRecord,
  TrackedPerson,
  QueueMetricResult,
  QueuePersonState,
  CounterRecommendation,
  CrowdIncidentType,
  IncidentSeverity,
} from './types.js';

interface CounterTrackerState {
  queueId: string;
  activePersons: Map<string, QueuePersonState>;
  servedCount: number;
  abandonedCount: number;
  lastAttendedTimestamp: number;
  serviceStartTimeByTrack: Map<string, number>;
}

export class QueueMonitor {
  private readonly trackerStates = new Map<string, CounterTrackerState>();

  /**
   * Reset or initialize state for a counter queue
   */
  private getOrCreateState(queueId: string, currentTime: number): CounterTrackerState {
    let state = this.trackerStates.get(queueId);
    if (!state) {
      state = {
        queueId,
        activePersons: new Map(),
        servedCount: 0,
        abandonedCount: 0,
        lastAttendedTimestamp: currentTime,
        serviceStartTimeByTrack: new Map(),
      };
      this.trackerStates.set(queueId, state);
    }
    return state;
  }

  /**
   * Evaluate counter queue metrics for a specific frame observation
   */
  public evaluateCounterQueue(
    counter: CounterQueueRecord,
    allPersons: TrackedPerson[],
    currentTimestampMs: number = Date.now()
  ): QueueMetricResult {
    const state = this.getOrCreateState(counter.id, currentTimestampMs);
    const counterCentroid = DensityEstimator.calculatePolygonCentroid(counter.service_station_polygon);

    // 1. Identify persons currently in queue polygon
    const personsInQueue = allPersons.filter(person => {
      const centroid = DensityEstimator.calculateCentroid(person.boundingBox);
      return DensityEstimator.isPointInPolygon(centroid, counter.queue_polygon);
    });

    // 2. Identify persons currently in service station (teller presence)
    const personsInService = allPersons.filter(person => {
      const centroid = DensityEstimator.calculateCentroid(person.boundingBox);
      return DensityEstimator.isPointInPolygon(centroid, counter.service_station_polygon);
    });

    const isCounterAttended = personsInService.length > 0;
    if (isCounterAttended) {
      state.lastAttendedTimestamp = currentTimestampMs;
    }

    const currentTrackIds = new Set(personsInQueue.map(p => p.trackId));

    // 3. Update existing tracks and add new arrivals
    for (const person of personsInQueue) {
      const centroid = DensityEstimator.calculateCentroid(person.boundingBox);
      const distance = DensityEstimator.calculateDistance(centroid, counterCentroid);

      const existing = state.activePersons.get(person.trackId);
      if (existing) {
        existing.lastObservedAt = currentTimestampMs;
        existing.currentWaitSeconds = Math.max(
          0,
          Math.floor((currentTimestampMs - existing.enteredQueueAt) / 1000)
        );
        existing.distanceToCounter = Math.round(distance * 10) / 10;
      } else {
        state.activePersons.set(person.trackId, {
          trackId: person.trackId,
          enteredQueueAt: currentTimestampMs,
          lastObservedAt: currentTimestampMs,
          currentWaitSeconds: 0,
          distanceToCounter: Math.round(distance * 10) / 10,
        });
      }
    }

    // 4. Handle departing persons (served vs abandoned)
    for (const [trackId, pState] of Array.from(state.activePersons.entries())) {
      if (!currentTrackIds.has(trackId)) {
        // Track departed queue. Check if person moved into service station or simply left
        const inService = personsInService.some(p => p.trackId === trackId);
        if (inService) {
          state.servedCount++;
        } else if (pState.currentWaitSeconds >= 30) {
          // Abandoned after waiting at least 30 seconds
          state.abandonedCount++;
        }
        state.activePersons.delete(trackId);
      }
    }

    // 5. Compute aggregated queue stats
    const waitingPersonsList = Array.from(state.activePersons.values()).sort(
      (a, b) => a.distanceToCounter - b.distanceToCounter
    );

    const currentQueueLength = waitingPersonsList.length;
    let totalWaitSeconds = 0;
    let maxWaitTimeSeconds = 0;

    for (const wp of waitingPersonsList) {
      totalWaitSeconds += wp.currentWaitSeconds;
      if (wp.currentWaitSeconds > maxWaitTimeSeconds) {
        maxWaitTimeSeconds = wp.currentWaitSeconds;
      }
    }

    const avgWaitTimeSeconds =
      currentQueueLength > 0 ? Math.round(totalWaitSeconds / currentQueueLength) : 0;

    const thresholdExceeded = currentQueueLength > counter.max_queue_length_threshold;
    const slaBreached = maxWaitTimeSeconds > counter.max_wait_time_seconds_threshold;
    const unattendedWithQueue =
      currentQueueLength >= 1 &&
      !isCounterAttended &&
      currentTimestampMs - state.lastAttendedTimestamp > 30000;

    const bottleneckDetected =
      currentQueueLength >= counter.max_queue_length_threshold && avgWaitTimeSeconds > 180;

    let requiresAlert = false;
    let incidentType: CrowdIncidentType | undefined;
    let alertSeverity: IncidentSeverity = counter.alert_severity || 'P2';

    if (unattendedWithQueue) {
      requiresAlert = true;
      incidentType = 'unattended_counter_with_queue';
      alertSeverity = 'P1';
    } else if (slaBreached) {
      requiresAlert = true;
      incidentType = 'wait_time_sla_breach';
      alertSeverity = 'P2';
    } else if (thresholdExceeded) {
      requiresAlert = true;
      incidentType = 'queue_length_exceeded';
      alertSeverity = 'P2';
    } else if (bottleneckDetected) {
      requiresAlert = true;
      incidentType = 'stampede_risk_bottleneck';
      alertSeverity = 'P2';
    }

    return {
      queueId: counter.id,
      counterNumber: counter.counter_number,
      counterName: counter.counter_name,
      counterType: counter.counter_type,
      currentQueueLength,
      servedPersonCount: state.servedCount,
      avgWaitTimeSeconds,
      maxWaitTimeSeconds,
      isCounterAttended,
      thresholdExceeded,
      bottleneckDetected,
      participantTrackIds: Array.from(currentTrackIds),
      waitingPersons: waitingPersonsList.map(p => ({
        trackId: p.trackId,
        waitSeconds: p.currentWaitSeconds,
        distanceToCounter: p.distanceToCounter,
      })),
      requiresAlert,
      incidentType,
      alertSeverity,
    };
  }

  /**
   * Generate intelligent counter opening recommendations based on current branch queue distribution
   */
  public generateRecommendations(
    allCounters: CounterQueueRecord[],
    queueMetrics: QueueMetricResult[]
  ): CounterRecommendation[] {
    const recommendations: CounterRecommendation[] = [];
    const metricMap = new Map<string, QueueMetricResult>();
    for (const m of queueMetrics) {
      metricMap.set(m.queueId, m);
    }

    const overloadedQueues = queueMetrics.filter(
      q => q.thresholdExceeded || q.avgWaitTimeSeconds > 300 || q.currentQueueLength >= 5
    );

    const idleOrClosedCounters = allCounters.filter(c => {
      const metric = metricMap.get(c.id);
      return !metric || metric.currentQueueLength === 0 || !metric.isCounterAttended;
    });

    for (const overloaded of overloadedQueues) {
      // Find a standby counter with matching or general teller type
      const suitableStandby = idleOrClosedCounters.find(c => c.id !== overloaded.queueId);

      if (suitableStandby) {
        recommendations.push({
          id: `rec-${overloaded.queueId}-${Date.now()}`,
          type: 'open_counter',
          priority: overloaded.currentQueueLength > 8 ? 'high' : 'medium',
          title: `Open Additional Counter: ${suitableStandby.counter_name}`,
          message: `High queue load at ${overloaded.counterName} (${overloaded.currentQueueLength} customers waiting, avg wait: ${Math.round(overloaded.avgWaitTimeSeconds / 60)}m). Recommend opening Counter ${suitableStandby.counter_number} immediately.`,
          recommendedCounterNumber: suitableStandby.counter_number,
          sourceQueueId: overloaded.queueId,
          triggeredAt: new Date(),
        });
      } else {
        // No standby counters available; recommend priority queue rebalance
        recommendations.push({
          id: `rec-${overloaded.queueId}-${Date.now()}`,
          type: 'staff_alert',
          priority: 'high',
          title: `Queue Threshold Exceeded at ${overloaded.counterName}`,
          message: `Queue capacity exceeded with ${overloaded.currentQueueLength} waiting customers. All existing counters are currently occupied. Dispatch branch floor manager to assist.`,
          sourceQueueId: overloaded.queueId,
          triggeredAt: new Date(),
        });
      }
    }

    return recommendations;
  }

  /**
   * Clear in-memory tracking states (e.g. on server reset or test cleanup)
   */
  public clear(): void {
    this.trackerStates.clear();
  }
}
