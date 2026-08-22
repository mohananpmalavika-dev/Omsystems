/**
 * AI Root Cause Analysis (RCA) Service
 * Correlates multiple telemetry signals to identify the exact component failure,
 * determining whether the issue can be fixed remotely without a technician.
 */

import { randomUUID } from 'node:crypto';
import {
  InfrastructureDegradationSignal,
  RootCauseDiagnosis,
} from '../domain/remote-ops.types.js';

export class AiRootCauseService {
  /**
   * Diagnoses root cause from degradation signals and topology context.
   */
  diagnoseSignal(
    signal: InfrastructureDegradationSignal,
    componentName = 'Component',
    additionalContext?: {
      pingResponseMs?: number;
      switchPortPoEVoltage?: number;
      otherCamerasOnSameSwitchDown?: boolean;
    }
  ): RootCauseDiagnosis {
    const diagnosisId = `rca-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // 1. Switch or Power Loss check
    if (additionalContext?.otherCamerasOnSameSwitchDown) {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'LOCAL_SWITCH_POWER_OR_UPLINK_FAILURE',
        confidenceScore: 0.99,
        narrative: `All cameras connected to local PoE switch are offline. Root cause is PoE Switch power cut or uplink disconnect, NOT individual camera faults.`,
        canRemediateRemotely: false,
        recommendedAction: 'Verify PoE switch power supply and main patch uplink cable.',
        diagnosedAt: now,
      };
    }

    // 2. Physical Cable or Hardware Break (0V PoE / Link down)
    if (signal.signalType === 'PHYSICAL_LINK_DOWN' || (additionalContext?.switchPortPoEVoltage !== undefined && additionalContext.switchPortPoEVoltage === 0)) {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'PHYSICAL_CABLE_SEVERED',
        confidenceScore: 0.96,
        narrative: `PoE switch reports 0 Volts and physical link down on camera port. Physical Cat6 cable is damaged or severed.`,
        canRemediateRemotely: false,
        recommendedAction: 'Dispatch technician with Cat6 cable and RJ45 crimper.',
        diagnosedAt: now,
      };
    }

    // 3. Camera Firmware Crash (Ping OK, RTSP dead)
    if (signal.signalType === 'RTSP_STREAM_FROZEN' && (additionalContext?.pingResponseMs !== undefined && additionalContext.pingResponseMs < 100)) {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'CAMERA_FIRMWARE_LOCKUP',
        confidenceScore: 0.95,
        narrative: `Camera IP responds to ICMP ping (${additionalContext.pingResponseMs}ms), but RTSP media daemon has locked up. Can be resolved by remote PoE power-cycle.`,
        canRemediateRemotely: true,
        recommendedAction: 'Execute remote PoE power-cycle to hard-reboot camera hardware.',
        diagnosedAt: now,
      };
    }

    // 4. Encoder Bitrate Saturation / Packet Loss
    if (signal.signalType === 'HIGH_PACKET_LOSS' || signal.signalType === 'BITRATE_COLLAPSE') {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'ENCODER_BITRATE_SATURATION',
        confidenceScore: 0.92,
        narrative: `Camera encoder bitrate exceeds available branch uplink bandwidth, causing packet loss. Can be resolved by automated ONVIF profile adaptation.`,
        canRemediateRemotely: true,
        recommendedAction: 'Renegotiate RTSP stream profile or switch to dynamic sub-stream transcode.',
        diagnosedAt: now,
      };
    }

    // 5. Storage Disk Failure / Bad Blocks
    if (signal.signalType === 'DISK_WRITE_LATENCY_SPIKE' || signal.signalType === 'SMART_BAD_SECTORS') {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'HDD_BAD_BLOCKS_DEGRADATION',
        confidenceScore: 0.98,
        narrative: `Physical storage drive exhibits severe write latency and SMART pending bad sectors. Write pipeline requires instant failover to secondary storage pool.`,
        canRemediateRemotely: true,
        recommendedAction: 'Evacuate active recording writers to secondary NVMe/NAS pool immediately.',
        diagnosedAt: now,
      };
    }

    // 6. ONVIF Auth Failure
    if (signal.signalType === 'ONVIF_AUTH_FAILURE') {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'EXPIRED_ONVIF_CREDENTIALS',
        confidenceScore: 0.99,
        narrative: `Camera rejecting RTSP/ONVIF connection due to rotated or expired digest credentials.`,
        canRemediateRemotely: true,
        recommendedAction: 'Push fresh authoritative credentials via encrypted ONVIF session.',
        diagnosedAt: now,
      };
    }

    // 7. Clock Drift
    if (signal.signalType === 'NTP_CLOCK_DRIFT') {
      return {
        diagnosisId,
        branchId: signal.branchId,
        componentId: signal.componentId,
        componentName,
        category: 'NTP_DAEMON_DESYNCHRONIZATION',
        confidenceScore: 0.97,
        narrative: `Camera clock offset exceeds acceptable tolerance (>10s).`,
        canRemediateRemotely: true,
        recommendedAction: 'Force remote NTP clock resynchronization.',
        diagnosedAt: now,
      };
    }

    // Default Fallback
    return {
      diagnosisId,
      branchId: signal.branchId,
      componentId: signal.componentId,
      componentName,
      category: 'CAMERA_FIRMWARE_LOCKUP',
      confidenceScore: 0.85,
      narrative: `Degradation detected on component ${signal.componentId}. Remote self-healing recommended.`,
      canRemediateRemotely: true,
      recommendedAction: 'Attempt remote PoE power-cycle and media pipeline restart.',
      diagnosedAt: now,
    };
  }
}

export const aiRootCause = new AiRootCauseService();
