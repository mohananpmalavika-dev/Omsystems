/**
 * Infrastructure Degradation Detector Service
 * Continuously evaluates device, stream, storage, and network metrics
 * to detect early signs of failure before full camera blackout occurs.
 */

import { randomUUID } from 'node:crypto';
import {
  InfrastructureDegradationSignal,
  DegradationSignalType,
} from '../domain/remote-ops.types.js';

export class DegradationDetectorService {
  /**
   * Evaluates camera stream health metrics.
   */
  evaluateCameraStream(
    branchId: string,
    cameraId: string,
    metrics: {
      fps: number;
      expectedFps?: number;
      packetLossPct: number;
      bitrateKbps: number;
      stalledSeconds?: number;
      authFailures?: number;
      clockOffsetMs?: number;
    }
  ): InfrastructureDegradationSignal | null {
    const now = new Date().toISOString();

    // 1. Frozen or stalled stream
    if (metrics.fps < 1.0 || (metrics.stalledSeconds && metrics.stalledSeconds > 10)) {
      return {
        signalId: `sig-stream-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: cameraId,
        componentType: 'CAMERA',
        signalType: 'RTSP_STREAM_FROZEN',
        severity: 'CRITICAL',
        metrics,
        detectedAt: now,
      };
    }

    // 2. High packet loss
    if (metrics.packetLossPct >= 20.0) {
      return {
        signalId: `sig-loss-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: cameraId,
        componentType: 'CAMERA',
        signalType: 'HIGH_PACKET_LOSS',
        severity: 'WARNING',
        metrics,
        detectedAt: now,
      };
    }

    // 3. Bitrate collapse
    if (metrics.bitrateKbps > 0 && metrics.bitrateKbps < 150) {
      return {
        signalId: `sig-bitrate-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: cameraId,
        componentType: 'CAMERA',
        signalType: 'BITRATE_COLLAPSE',
        severity: 'WARNING',
        metrics,
        detectedAt: now,
      };
    }

    // 4. ONVIF Auth Failure
    if (metrics.authFailures && metrics.authFailures >= 3) {
      return {
        signalId: `sig-auth-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: cameraId,
        componentType: 'CAMERA',
        signalType: 'ONVIF_AUTH_FAILURE',
        severity: 'CRITICAL',
        metrics,
        detectedAt: now,
      };
    }

    // 5. Clock Drift
    if (metrics.clockOffsetMs && Math.abs(metrics.clockOffsetMs) > 10_000) {
      return {
        signalId: `sig-clock-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: cameraId,
        componentType: 'CAMERA',
        signalType: 'NTP_CLOCK_DRIFT',
        severity: 'WARNING',
        metrics,
        detectedAt: now,
      };
    }

    return null;
  }

  /**
   * Evaluates storage disk metrics.
   */
  evaluateStorageDisk(
    branchId: string,
    diskId: string,
    metrics: {
      writeLatencyMs: number;
      readLatencyMs: number;
      smartPendingSectors: number;
      isReadOnly: boolean;
      usedPercent: number;
    }
  ): InfrastructureDegradationSignal | null {
    const now = new Date().toISOString();

    if (metrics.isReadOnly || metrics.smartPendingSectors > 50 || metrics.writeLatencyMs > 400) {
      return {
        signalId: `sig-disk-${randomUUID().slice(0, 8)}`,
        branchId,
        componentId: diskId,
        componentType: 'STORAGE_DISK',
        signalType: metrics.smartPendingSectors > 50 ? 'SMART_BAD_SECTORS' : 'DISK_WRITE_LATENCY_SPIKE',
        severity: 'CRITICAL',
        metrics,
        detectedAt: now,
      };
    }

    return null;
  }
}

export const degradationDetector = new DegradationDetectorService();
