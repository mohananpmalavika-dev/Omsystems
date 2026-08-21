/**
 * Clock Synchronization Service
 * Models device clock offset as a function of time (offset = f(time)),
 * isolates sudden jumps into Clock Epochs, and normalizes device timestamps to canonical UTC.
 */

import { randomUUID } from 'node:crypto';
import {
  ClockObservation,
  ClockEpoch,
  ClockEpochReason,
} from './clock-synchronization.types.js';

export class ClockSynchronizationService {
  private observations = new Map<string, ClockObservation[]>();
  private epochs = new Map<string, ClockEpoch[]>();

  constructor() {
  }

  private seedDefaultClocks() {
    const baseUtc = new Date('2026-08-17T00:00:00.000Z').getTime();

    // Seed Camera 1 (Offset +5,200ms with slight drift)
    this.recordObservation({
      deviceId: 'CAM-01',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc + 5200,
      serverTimestamp: baseUtc,
      offsetMs: 5200,
      source: 'ONVIF',
      confidence: 0.98,
    });
    this.recordObservation({
      deviceId: 'CAM-01',
      measuredAtUtc: baseUtc + 3600_000,
      deviceTimestamp: baseUtc + 3600_000 + 5215,
      serverTimestamp: baseUtc + 3600_000,
      offsetMs: 5215,
      source: 'ONVIF',
      confidence: 0.98,
    });

    // Seed Camera 2 (Offset -3,100ms)
    this.recordObservation({
      deviceId: 'CAM-02',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc - 3100,
      serverTimestamp: baseUtc,
      offsetMs: -3100,
      source: 'RTSP',
      confidence: 0.96,
    });

    // Seed Camera 3 (Offset +100ms)
    this.recordObservation({
      deviceId: 'CAM-03',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc + 100,
      serverTimestamp: baseUtc,
      offsetMs: 100,
      source: 'NTP',
      confidence: 0.99,
    });

    // Seed Camera 4 (Gap / Offline at 14:32:17)
    this.recordObservation({
      deviceId: 'CAM-04',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc + 450,
      serverTimestamp: baseUtc,
      offsetMs: 450,
      source: 'EDGE_AGENT',
      confidence: 0.95,
    });
  }

  /**
   * Records a raw clock observation and evaluates if a new Clock Epoch has occurred.
   */
  recordObservation(obs: ClockObservation): ClockEpoch {
    const list = this.observations.get(obs.deviceId) || [];
    list.push(obs);
    list.sort((a, b) => a.measuredAtUtc - b.measuredAtUtc);
    this.observations.set(obs.deviceId, list);

    const deviceEpochs = this.epochs.get(obs.deviceId) || [];
    let activeEpoch = deviceEpochs[deviceEpochs.length - 1];

    // Detect Clock Jump (>3000ms discontinuity from previous observation)
    const prevObs = list.length > 1 ? list[list.length - 2] : undefined;
    const isJump = prevObs ? Math.abs(obs.offsetMs - prevObs.offsetMs) > 3000 : false;

    if (!activeEpoch || isJump) {
      if (activeEpoch && isJump) {
        activeEpoch.validToServerUtc = obs.measuredAtUtc;
        activeEpoch.offsetEndMs = prevObs?.offsetMs || activeEpoch.offsetStartMs;
      }

      const reason: ClockEpochReason = isJump ? 'NTP_CORRECTION' : 'DEVICE_REBOOT';
      activeEpoch = {
        id: `epoch-${randomUUID().slice(0, 8)}`,
        deviceId: obs.deviceId,
        validFromServerUtc: obs.measuredAtUtc,
        deviceTimeStart: obs.deviceTimestamp,
        offsetStartMs: obs.offsetMs,
        driftPpm: 0,
        reason,
        confidence: obs.confidence,
      };
      deviceEpochs.push(activeEpoch);
      this.epochs.set(obs.deviceId, deviceEpochs);
    }

    return activeEpoch;
  }

  /**
   * Estimates offset at a specific server UTC timestamp via piecewise linear interpolation.
   */
  getEstimatedOffsetAtUtc(deviceId: string, serverUtcMs: number): { offsetMs: number; confidence: number } {
    const list = this.observations.get(deviceId) || [];
    if (list.length === 0) {
      return { offsetMs: 0, confidence: 0.5 };
    }
    if (list.length === 1) {
      return { offsetMs: list[0]!.offsetMs, confidence: list[0]!.confidence };
    }

    // Find bounding observations
    let lower: ClockObservation | undefined;
    let upper: ClockObservation | undefined;

    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!;
      if (cur.measuredAtUtc <= serverUtcMs) {
        lower = cur;
      }
      if (cur.measuredAtUtc >= serverUtcMs && !upper) {
        upper = cur;
      }
    }

    if (!lower) return { offsetMs: list[0]!.offsetMs, confidence: list[0]!.confidence };
    if (!upper || lower === upper) return { offsetMs: lower.offsetMs, confidence: lower.confidence };

    // Piecewise Linear Interpolation: offset = f(time)
    const ratio = (serverUtcMs - lower.measuredAtUtc) / (upper.measuredAtUtc - lower.measuredAtUtc || 1);
    const interpolatedOffset = lower.offsetMs + ratio * (upper.offsetMs - lower.offsetMs);
    const confidence = Math.min(lower.confidence, upper.confidence);

    return {
      offsetMs: Math.round(interpolatedOffset),
      confidence,
    };
  }

  /**
   * Normalizes Device Local Timestamp -> Canonical Server UTC.
   */
  deviceToCanonicalUtc(deviceId: string, deviceTimestampMs: number): number {
    const est = this.getEstimatedOffsetAtUtc(deviceId, deviceTimestampMs);
    return deviceTimestampMs - est.offsetMs;
  }

  /**
   * Translates Canonical Server UTC -> Device Local Timestamp.
   */
  canonicalUtcToDevice(deviceId: string, canonicalUtcMs: number): number {
    const est = this.getEstimatedOffsetAtUtc(deviceId, canonicalUtcMs);
    return canonicalUtcMs + est.offsetMs;
  }

  getEpochs(deviceId: string): ClockEpoch[] {
    return this.epochs.get(deviceId) || [];
  }
}

export const clockSyncService = new ClockSynchronizationService();
