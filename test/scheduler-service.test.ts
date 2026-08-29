import { describe, expect, it } from 'vitest';
import {
  cameraHealthAuditFromTelemetry,
  recordingVerificationFromArchiveTelemetry,
  storageHealthAuditFromTelemetry,
} from '../src/services/scheduler-service.js';

const observedAt = new Date('2026-08-29T10:00:00.000Z');
const now = new Date('2026-08-29T10:05:00.000Z');

function telemetry(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: 'tenant-1',
    branch_node_id: 'branch-1',
    device_id: 'camera-1',
    observed_at: observedAt,
    received_at: new Date('2026-08-29T10:00:02.000Z'),
    source: 'rtsp',
    quality: 'verified',
    idempotency_key: 'sample-1',
    metrics: {},
    reason_codes: [],
    ...overrides,
  };
}

describe('scheduler telemetry audit mapping', () => {
  it('records only the camera facts reported by a fresh edge probe', () => {
    const result = cameraHealthAuditFromTelemetry(telemetry({
      metrics: {
        status: 'degraded', streamActive: true, fps: 14.5, bitrateKbps: 768,
        width: 1280, height: 720, packetLossPercent: 6.5, severeBlur: true,
      },
      reason_codes: ['frame_blur_detected'],
    }), now);

    expect(result).toMatchObject({
      isOnline: true,
      rtspAvailable: true,
      currentFps: 14.5,
      currentBitrateKbps: 768,
      resolutionWidth: 1280,
      resolutionHeight: 720,
      packetLossPercentage: 6.5,
      blurredImage: true,
      overallStatus: 'degraded',
      healthScore: undefined,
    });
    expect(result?.issuesDetected).toEqual(expect.arrayContaining(['frame_blur_detected', 'severe_blur']));
  });

  it('does not turn unavailable or stale camera telemetry into a health result', () => {
    expect(cameraHealthAuditFromTelemetry(telemetry({ quality: 'unavailable' }), now)).toBeNull();
    expect(cameraHealthAuditFromTelemetry(telemetry({
      observed_at: new Date('2026-08-29T09:49:59.000Z'),
      metrics: { status: 'online', streamActive: true },
    }), now)).toBeNull();
  });

  it('maps measured disk capacity and status without inventing a score', () => {
    const result = storageHealthAuditFromTelemetry(telemetry({
      device_id: 'recorder-1:disk:1',
      source: 'cp-plus-adapter',
      metrics: {
        operationalStatus: 'warning', model: 'ST4000VX', capacityBytes: 4 * 1024 ** 3,
        usedBytes: 3 * 1024 ** 3, availableBytes: 1024 ** 3, usagePercent: 75,
        raidFailedMemberCount: 0,
      },
    }), now);

    expect(result).toMatchObject({
      storageNodeName: 'ST4000VX',
      overallStatus: 'warning',
      totalCapacityGb: 4,
      usedCapacityGb: 3,
      freeCapacityGb: 1,
      utilizationPercentage: 75,
      healthScore: undefined,
    });
  });

  it('requires direct archive coverage before marking recording compliant', () => {
    const start = new Date('2026-08-28T00:00:00.000Z');
    const end = new Date('2026-08-28T23:59:59.999Z');
    const partial = recordingVerificationFromArchiveTelemetry(telemetry({
      device_id: 'recorder-1:archive:1',
      metrics: {
        archiveStatus: 'available', coverageComplete: false, gapCount: 2,
        largestGapSeconds: 180, playbackVerified: true,
      },
    }), 'camera-1', start, end);

    expect(partial).toMatchObject({
      verificationStatus: 'partially_compliant',
      compliancePercentage: undefined,
      totalGaps: 2,
      largestGapSeconds: 180,
      playbackFailures: 0,
    });

    const compliant = recordingVerificationFromArchiveTelemetry(telemetry({
      metrics: {
        archiveStatus: 'available', coverageComplete: true, gapCount: 0,
        playbackVerified: true,
      },
    }), 'camera-1', start, end);
    expect(compliant).toMatchObject({ verificationStatus: 'compliant', compliancePercentage: 100 });
  });
});
