/**
 * Real-Time Acoustic Anomaly and Threshold Alert Detector
 * 
 * Classifies security and operational acoustic anomalies:
 * 1. Audio Loss / Signal Disconnection (silent microphone / wire cut)
 * 2. High Noise Threshold Breach (screaming, high SPL sirens)
 * 3. Acoustic Spike (gunshots, explosions, structural impacts)
 * 4. Scream / Human Distress Vocalization
 * 5. Sensor Saturation / Overdrive Clipping
 */

import type {
  AudioChannelConfig,
  AudioMeterMetrics,
  AudioMonitoringAlert,
} from '../types.js';

export interface AnomalyTrackingState {
  silenceDurationMs: number;
  highNoiseDurationMs: number;
  lastAlertTimestamp?: number;
  lastAlertType?: string;
}

export class AudioAnomalyDetector {
  /**
   * Evaluates audio metrics against channel configuration and temporal state.
   * Returns newly triggered alerts (if any) and updated tracking state.
   */
  static evaluate(
    metrics: AudioMeterMetrics,
    config: AudioChannelConfig,
    state: AnomalyTrackingState = {
      silenceDurationMs: 0,
      highNoiseDurationMs: 0,
    },
    deltaMs: number = 100
  ): { alerts: AudioMonitoringAlert[]; nextState: AnomalyTrackingState } {
    const alerts: AudioMonitoringAlert[] = [];
    let silenceDurationMs = state.silenceDurationMs;
    let highNoiseDurationMs = state.highNoiseDurationMs;

    if (!config.isEnabled) {
      return {
        alerts: [],
        nextState: { silenceDurationMs: 0, highNoiseDurationMs: 0 },
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Evaluate Audio Loss / Microphone Tamper
    const isSilent = metrics.rmsDbFS <= config.silenceThresholdDbFS;
    if (isSilent) {
      silenceDurationMs += deltaMs;
      const timeoutMs = config.silenceTimeoutSec * 1000;
      if (silenceDurationMs >= timeoutMs) {
        // Prevent flood: check debounce (only trigger once per timeout window)
        const canTriggerLoss = !state.lastAlertTimestamp ||
          state.lastAlertType !== 'audio_loss' ||
          (now.getTime() - state.lastAlertTimestamp >= timeoutMs);

        if (canTriggerLoss) {
          alerts.push({
            id: `alert-loss-${config.cameraId}-${now.getTime()}`,
            tenantId: config.tenantId,
            branchId: config.branchId,
            cameraId: config.cameraId,
            channelNumber: config.channelNumber,
            alertType: 'audio_loss',
            severity: 'P2',
            status: 'detected',
            peakDbFS: metrics.peakDbFS,
            rmsDbFS: metrics.rmsDbFS,
            durationMs: silenceDurationMs,
            details: {
              silenceThresholdDbFS: config.silenceThresholdDbFS,
              silenceTimeoutSec: config.silenceTimeoutSec,
              currentRmsDbFS: metrics.rmsDbFS,
              silenceDurationSec: Math.round(silenceDurationMs / 100) / 10,
              reason: 'Continuous acoustic energy collapsed below silence floor; possible mic tamper or unplugged input',
            },
            detectedAt: nowIso,
            createdAt: nowIso,
          });
        }
      }
    } else {
      silenceDurationMs = 0;
    }

    // 2. Evaluate High Noise Threshold
    const isHighNoise = metrics.rmsDbFS >= config.noiseThresholdDbFS;
    if (isHighNoise) {
      highNoiseDurationMs += deltaMs;
      if (highNoiseDurationMs >= config.noiseTriggerDurationMs) {
        const canTriggerNoise = !state.lastAlertTimestamp ||
          state.lastAlertType !== 'high_noise_threshold' ||
          (now.getTime() - state.lastAlertTimestamp >= 5000);

        if (canTriggerNoise) {
          const isCritical = metrics.rmsDbFS >= -6.0 || metrics.peakDbFS >= -1.0;
          alerts.push({
            id: `alert-noise-${config.cameraId}-${now.getTime()}`,
            tenantId: config.tenantId,
            branchId: config.branchId,
            cameraId: config.cameraId,
            channelNumber: config.channelNumber,
            alertType: 'high_noise_threshold',
            severity: isCritical ? 'P1' : 'P2',
            status: 'detected',
            peakDbFS: metrics.peakDbFS,
            rmsDbFS: metrics.rmsDbFS,
            durationMs: highNoiseDurationMs,
            details: {
              noiseThresholdDbFS: config.noiseThresholdDbFS,
              measuredRmsDbFS: metrics.rmsDbFS,
              peakDbFS: metrics.peakDbFS,
              durationMs: highNoiseDurationMs,
              snrDb: metrics.snrDb,
              reason: 'Sustained acoustic sound pressure level exceeded safety/security threshold',
            },
            detectedAt: nowIso,
            createdAt: nowIso,
          });
        }
      }
    } else {
      highNoiseDurationMs = 0;
    }

    // 3. Evaluate Acoustic Spike (Gunshot / Impact / Explosion)
    const spikeSensitivityThreshold = 18.0 - (config.spikeSensitivity - 0.5) * 8.0;
    const isSpike = metrics.crestFactorDb >= spikeSensitivityThreshold &&
      metrics.snrDb >= 20.0 &&
      metrics.peakDbFS >= -12.0;

    if (isSpike) {
      const canTriggerSpike = !state.lastAlertTimestamp ||
        state.lastAlertType !== 'acoustic_spike' ||
        (now.getTime() - state.lastAlertTimestamp >= 3000);

      if (canTriggerSpike) {
        alerts.push({
          id: `alert-spike-${config.cameraId}-${now.getTime()}`,
          tenantId: config.tenantId,
          branchId: config.branchId,
          cameraId: config.cameraId,
          channelNumber: config.channelNumber,
          alertType: 'acoustic_spike',
          severity: 'P1',
          status: 'detected',
          peakDbFS: metrics.peakDbFS,
          rmsDbFS: metrics.rmsDbFS,
          durationMs: deltaMs,
          details: {
            crestFactorDb: metrics.crestFactorDb,
            peakDbFS: metrics.peakDbFS,
            rmsDbFS: metrics.rmsDbFS,
            snrDb: metrics.snrDb,
            sensitivity: config.spikeSensitivity,
            reason: 'Violent transient acoustic rise detected (consistent with gunshot, blast, or heavy door forced entry)',
          },
          detectedAt: nowIso,
          createdAt: nowIso,
        });
      }
    }

    // 4. Evaluate Scream / Human Distress Vocalization
    if (config.screamDetectionEnabled) {
      const midHighEnergy = metrics.frequencyBands.mid + metrics.frequencyBands.high;
      const isScream = midHighEnergy >= 75.0 &&
        metrics.rmsDbFS >= -20.0 &&
        metrics.peakDbFS >= -10.0 &&
        metrics.crestFactorDb >= 8.0 &&
        metrics.vadState === 'SPEECH_ACTIVITY';

      if (isScream) {
        const canTriggerScream = !state.lastAlertTimestamp ||
          state.lastAlertType !== 'scream_distress' ||
          (now.getTime() - state.lastAlertTimestamp >= 5000);

        if (canTriggerScream) {
          alerts.push({
            id: `alert-scream-${config.cameraId}-${now.getTime()}`,
            tenantId: config.tenantId,
            branchId: config.branchId,
            cameraId: config.cameraId,
            channelNumber: config.channelNumber,
            alertType: 'scream_distress',
            severity: 'P1',
            status: 'detected',
            peakDbFS: metrics.peakDbFS,
            rmsDbFS: metrics.rmsDbFS,
            durationMs: deltaMs,
            details: {
              midHighEnergyPct: Math.round(midHighEnergy * 10) / 10,
              rmsDbFS: metrics.rmsDbFS,
              peakDbFS: metrics.peakDbFS,
              reason: 'High-frequency vocal tract resonance and elevated decibel level characteristic of distress screaming',
            },
            detectedAt: nowIso,
            createdAt: nowIso,
          });
        }
      }
    }

    // 5. Evaluate Clipping Distortion
    if (config.clippingAlertEnabled && metrics.isClipping && metrics.clipPercentage >= 2.5) {
      const canTriggerClip = !state.lastAlertTimestamp ||
        state.lastAlertType !== 'clipping_distortion' ||
        (now.getTime() - state.lastAlertTimestamp >= 10000);

      if (canTriggerClip) {
        alerts.push({
          id: `alert-clip-${config.cameraId}-${now.getTime()}`,
          tenantId: config.tenantId,
          branchId: config.branchId,
          cameraId: config.cameraId,
          channelNumber: config.channelNumber,
          alertType: 'clipping_distortion',
          severity: 'P3',
          status: 'detected',
          peakDbFS: metrics.peakDbFS,
          rmsDbFS: metrics.rmsDbFS,
          durationMs: deltaMs,
          details: {
            clippedSamples: metrics.clippedSamples,
            clipPercentage: metrics.clipPercentage,
            reason: 'Sensor microphone preamplifier overdrive causing severe digital flat-topping distortion',
          },
          detectedAt: nowIso,
          createdAt: nowIso,
        });
      }
    }

    const lastAlert = alerts[alerts.length - 1];
    const nextState: AnomalyTrackingState = {
      silenceDurationMs,
      highNoiseDurationMs,
      lastAlertTimestamp: lastAlert ? now.getTime() : state.lastAlertTimestamp,
      lastAlertType: lastAlert ? lastAlert.alertType : state.lastAlertType,
    };

    return { alerts, nextState };
  }
}
