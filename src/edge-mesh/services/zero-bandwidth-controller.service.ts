/**
 * Zero-Bandwidth Mode & AI Burst Streaming Controller Service
 *
 * Implements dynamic bandwidth throttling:
 * 1. Quiescent Mode: 1 FPS keyframe / low-res stream (~40 kbps) during normal quiet hours.
 * 2. AI Burst Mode: Instant transition to 4K / 30 FPS (~4500 kbps) when any AI detection
 *    triggers (No-Helmet, Intrusion, Motion, Face, Loitering).
 * 3. 70%+ WAN cellular data reduction for Indian branches.
 */

import {
  type ActiveStreamState,
  type EdgeBandwidthPolicy,
  calculateBandwidthSavings,
} from '../domain/edge-mesh.types.js';
import type { EdgeMeshRepository } from '../repositories/edge-mesh.repository.js';
import { alertEvents, type AlertStreamEvent } from '../../alerts/event-stream.js';

export class ZeroBandwidthControllerService {
  private readonly cameraStates = new Map<string, ActiveStreamState>();
  private readonly burstTimers = new Map<string, NodeJS.Timeout>();
  private unsubscribeAlerts?: () => void;

  constructor(private readonly repository: EdgeMeshRepository) {}

  /**
   * Listen to the system alert event stream for instant 4K burst activation
   */
  startAlertSubscriber(tenantId: string = 'default-tenant'): void {
    if (this.unsubscribeAlerts) return;

    this.unsubscribeAlerts = alertEvents.subscribe(tenantId, (event: AlertStreamEvent) => {
      if (event.type === 'alert.created' && event.alert) {
        const alert = event.alert;
        const detectionType = alert.objectClasses?.[0] || 'motion_detected';

        void this.handleAlertTrigger({
          tenantId: alert.tenantId || tenantId,
          branchId: alert.branchId || 'default-branch',
          cameraId: alert.cameraId,
          alertId: alert.id,
          alertType: detectionType,
        });
      }
    });
  }

  stopAlertSubscriber(): void {
    if (this.unsubscribeAlerts) {
      this.unsubscribeAlerts();
      this.unsubscribeAlerts = undefined;
    }
  }

  /**
   * Retrieve current stream state for a camera, initializing in Quiescent 1 FPS if new
   */
  async getCameraStreamState(
    tenantId: string,
    cameraId: string,
    branchId?: string
  ): Promise<ActiveStreamState> {
    let state = this.cameraStates.get(cameraId);
    if (!state) {
      const policy = await this.repository.findMatchingPolicy(tenantId, cameraId, branchId);
      state = {
        cameraId,
        branchId,
        currentMode: 'QUIESCENT_1FPS',
        currentFps: policy.quiescent_fps,
        currentBitrateKbps: policy.quiescent_bitrate_kbps,
        currentResolution: policy.quiescent_resolution,
        isBurstActive: false,
        burstRemainingSeconds: 0,
        bytesStreamedQuiescent: 120_000, // sample initial seed
        bytesStreamedBurst: 0,
        unoptimizedBytesHypothetical: 480_000,
        bandwidthSavingsPct: 75.0,
      };
      this.cameraStates.set(cameraId, state);
    }
    return state;
  }

  /**
   * Trigger 4K burst mode on an AI detection event
   */
  async handleAlertTrigger(input: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    alertId: string;
    alertType: string;
  }): Promise<{
    state: ActiveStreamState;
    policy: EdgeBandwidthPolicy;
    burstActivated: boolean;
  }> {
    const { tenantId, branchId, cameraId, alertId, alertType } = input;
    const policy = await this.repository.findMatchingPolicy(tenantId, cameraId, branchId);

    // Verify if this alert type qualifies for 4K burst
    const qualifies = policy.trigger_alert_types.some((t) => {
      const normPolicy = t.toLowerCase().replace(/[- ]/g, '_');
      const normAlert = alertType.toLowerCase().replace(/[- ]/g, '_');
      return normAlert.includes(normPolicy) || normPolicy.includes(normAlert) || normPolicy === 'all';
    });

    const state = await this.getCameraStreamState(tenantId, cameraId, branchId);

    if (!qualifies || !policy.enabled) {
      return { state, policy, burstActivated: false };
    }

    // Switch to 4K Burst
    state.currentMode = 'BURST_4K';
    state.currentFps = policy.burst_fps;
    state.currentBitrateKbps = policy.burst_bitrate_kbps;
    state.currentResolution = policy.burst_resolution;
    state.isBurstActive = true;
    state.burstRemainingSeconds = policy.burst_duration_seconds;
    state.triggerAlertId = alertId;
    state.triggerAlertType = alertType;
    state.lastBurstAt = new Date();

    // Accumulate metrics
    const burstBytes = Math.round((policy.burst_bitrate_kbps * 1024 * policy.burst_duration_seconds) / 8);
    const unoptBytes = Math.round((3500 * 1024 * policy.burst_duration_seconds) / 8);
    state.bytesStreamedBurst += burstBytes;
    state.unoptimizedBytesHypothetical += unoptBytes;
    state.bandwidthSavingsPct = calculateBandwidthSavings(
      state.bytesStreamedQuiescent + state.bytesStreamedBurst,
      state.unoptimizedBytesHypothetical
    );

    // Clear existing burst timer if re-triggered
    const existingTimer = this.burstTimers.get(cameraId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Record metrics in repository
    void this.repository.recordBandwidthUsage({
      branchId,
      cameraId,
      mode: 'BURST_4K',
      bytesActual: burstBytes,
      bytesHypothetical: unoptBytes,
    });

    // Schedule automatic ramp-down back to 1 FPS quiescent mode
    const timer = setTimeout(() => {
      this.rampDownToQuiescent(cameraId, policy);
    }, policy.burst_duration_seconds * 1000);

    this.burstTimers.set(cameraId, timer);

    return { state, policy, burstActivated: true };
  }

  /**
   * Smoothly ramp back down to Quiescent 1 FPS mode once incident scene clears
   */
  rampDownToQuiescent(cameraId: string, policy: EdgeBandwidthPolicy): void {
    const state = this.cameraStates.get(cameraId);
    if (!state) return;

    state.currentMode = 'QUIESCENT_1FPS';
    state.currentFps = policy.quiescent_fps;
    state.currentBitrateKbps = policy.quiescent_bitrate_kbps;
    state.currentResolution = policy.quiescent_resolution;
    state.isBurstActive = false;
    state.burstRemainingSeconds = 0;
    state.triggerAlertId = undefined;
    state.triggerAlertType = undefined;

    this.burstTimers.delete(cameraId);
  }

  /**
   * Manual operator override to view full HD/4K from security NOC
   */
  async setOperatorOverride(
    tenantId: string,
    cameraId: string,
    enableOverride: boolean
  ): Promise<ActiveStreamState> {
    const state = await this.getCameraStreamState(tenantId, cameraId);
    const policy = await this.repository.findMatchingPolicy(tenantId, cameraId);

    if (enableOverride) {
      state.currentMode = 'OPERATOR_OVERRIDE';
      state.currentFps = policy.burst_fps;
      state.currentBitrateKbps = policy.burst_bitrate_kbps;
      state.currentResolution = policy.burst_resolution;
      state.isBurstActive = false;
    } else {
      this.rampDownToQuiescent(cameraId, policy);
    }

    return state;
  }
}
