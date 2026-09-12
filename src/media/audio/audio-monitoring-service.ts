/**
 * Production Audio Stream Monitoring Service (video.audio)
 * 
 * Orchestrates camera audio decoding, real-time level metering,
 * acoustic anomaly detection, SSE broadcast streaming, and fleet metrics.
 */

import { EventEmitter } from 'node:events';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import { AudioDecoders } from './decoders/audio-decoders.js';
import { AudioLevelMeterEngine, type MeterChannelState } from './metering/audio-level-meter.js';
import { AudioAnomalyDetector, type AnomalyTrackingState } from './alerts/audio-anomaly-detector.js';
import { AudioMonitoringRepository, type AlertFilterOptions } from './audio-monitoring-repository.js';
import type {
  AudioChannelConfig,
  AudioChannelStatus,
  AudioFleetStats,
  AudioMeterMetrics,
  AudioMonitoringAlert,
  AudioCodec,
} from './types.js';

interface ActiveChannelState {
  metrics: AudioMeterMetrics;
  meterState: MeterChannelState;
  anomalyState: AnomalyTrackingState;
  lastActiveTime: number;
}

export class AudioMonitoringService {
  private readonly emitter = new EventEmitter();
  private readonly channelStates = new Map<string, ActiveChannelState>();
  public readonly repository: AudioMonitoringRepository;

  constructor(
    private readonly store: ControlPlaneStore,
    poolOrRepository?: any
  ) {
    if (poolOrRepository instanceof AudioMonitoringRepository) {
      this.repository = poolOrRepository;
    } else {
      this.repository = new AudioMonitoringRepository(poolOrRepository);
    }
    // Limit memory leaks on SSE event emitter
    this.emitter.setMaxListeners(200);
  }

  /**
   * Discovers and lists all cameras that support audio streaming,
   * merged with live level metering and configuration.
   */
  async listChannels(tenantId?: string): Promise<AudioChannelStatus[]> {
    const cameras = await this.store.getCameras();
    const configs = await this.repository.listChannelConfigs(tenantId);
    const configMap = new Map(configs.map((c) => [c.cameraId, c]));

    const audioCapableCameras = cameras.filter((cam) => {
      // Must have audio capability advertised
      if (!cam.capabilities?.audio) return false;
      if (tenantId && cam.tenantId && cam.tenantId !== tenantId) return false;
      return true;
    });

    const results: AudioChannelStatus[] = [];

    for (const camera of audioCapableCameras) {
      const channelNumber = camera.recorderChannel ?? camera.channel ?? 1;
      let config = configMap.get(camera.id);

      if (!config) {
        // Auto-initialize default channel config for audio-capable camera
        config = await this.repository.upsertChannelConfig({
          cameraId: camera.id,
          tenantId: camera.tenantId || tenantId || '00000000-0000-4000-8000-000000000000',
          branchId: camera.branchId,
          channelNumber,
          isEnabled: true,
          codec: 'PCMU',
          sampleRateHz: 8000,
          channels: 1,
        });
      }

      const active = this.getOrCreateChannelState(camera.id);
      const isOnline = camera.status === 'online';

      const alertsRes = await this.repository.listAlerts({
        cameraId: camera.id,
        status: 'detected',
        limit: 10,
      });

      results.push({
        cameraId: camera.id,
        cameraName: camera.name,
        branchId: camera.branchId,
        nodeId: camera.nodeId,
        vendor: camera.vendor,
        model: camera.model,
        sourceType: camera.sourceType,
        channelNumber,
        config,
        currentMetrics: isOnline ? active.metrics : this.createOfflineMetrics(),
        isOnline,
        hasActiveAlert: alertsRes.total > 0,
        activeAlertCount: alertsRes.total,
      });
    }

    return results;
  }

  /**
   * Retrieves single camera audio channel status and configuration.
   */
  async getChannel(cameraId: string, tenantId?: string): Promise<AudioChannelStatus | null> {
    const camera = await this.store.getCamera(cameraId);
    if (!camera) return null;
    if (tenantId && camera.tenantId && camera.tenantId !== tenantId) return null;

    const channelNumber = camera.recorderChannel ?? camera.channel ?? 1;
    let config = await this.repository.getChannelConfig(cameraId, channelNumber);
    if (!config) {
      config = await this.repository.upsertChannelConfig({
        cameraId: camera.id,
        tenantId: camera.tenantId || tenantId || '00000000-0000-4000-8000-000000000000',
        branchId: camera.branchId,
        channelNumber,
        isEnabled: true,
        codec: 'PCMU',
        sampleRateHz: 8000,
        channels: 1,
      });
    }

    const active = this.getOrCreateChannelState(cameraId);
    const alertsRes = await this.repository.listAlerts({
      cameraId,
      status: 'detected',
      limit: 10,
    });

    return {
      cameraId: camera.id,
      cameraName: camera.name,
      branchId: camera.branchId,
      nodeId: camera.nodeId,
      vendor: camera.vendor,
      model: camera.model,
      sourceType: camera.sourceType,
      channelNumber,
      config,
      currentMetrics: camera.status === 'online' ? active.metrics : this.createOfflineMetrics(),
      isOnline: camera.status === 'online',
      hasActiveAlert: alertsRes.total > 0,
      activeAlertCount: alertsRes.total,
    };
  }

  /**
   * Updates configuration for a camera channel.
   */
  async updateConfig(
    cameraId: string,
    updates: Partial<AudioChannelConfig>,
    tenantId: string
  ): Promise<AudioChannelConfig> {
    return this.repository.upsertChannelConfig({
      ...updates,
      cameraId,
      tenantId,
    });
  }

  /**
   * Ingests and decodes raw audio chunk (e.g. from RTSP backplane or edge agent),
   * calculates high-precision acoustic metrics, evaluates anomalies, and broadcasts via SSE.
   */
  async decodeAndMeter(
    cameraId: string,
    audioBuffer: Uint8Array,
    codecOverride?: AudioCodec,
    tenantIdOverride?: string
  ): Promise<{ metrics: AudioMeterMetrics; alerts: AudioMonitoringAlert[] }> {
    const channelNumber = 1;
    let config = await this.repository.getChannelConfig(cameraId, channelNumber);
    const tenantId = tenantIdOverride || config?.tenantId || '00000000-0000-4000-8000-000000000000';

    if (!config) {
      config = await this.repository.upsertChannelConfig({
        cameraId,
        tenantId,
        channelNumber,
        isEnabled: true,
        codec: codecOverride || 'PCMU',
        sampleRateHz: 8000,
        channels: 1,
      });
    }

    const codec = codecOverride || config.codec || 'PCMU';
    const sampleRate = config.sampleRateHz || 8000;
    const channels = config.channels || 1;

    // 1. Decode raw audio bytes
    const decodedFrame = AudioDecoders.decode(audioBuffer, codec, sampleRate, channels);

    // 2. Apply software gain calibration if set
    if (config.gainDb !== 0.0 && decodedFrame.channels.length > 0) {
      const gainLinear = Math.pow(10.0, config.gainDb / 20.0);
      for (const ch of decodedFrame.channels) {
        for (let i = 0; i < ch.length; i++) {
          ch[i] = Math.max(-1.0, Math.min(1.0, ch[i] * gainLinear));
        }
      }
    }

    // 3. Run Real-Time Level Metering
    const state = this.getOrCreateChannelState(cameraId);
    const now = Date.now();
    const deltaMs = Math.max(10, Math.min(1000, now - state.lastActiveTime));
    state.lastActiveTime = now;

    const { metrics, nextState: nextMeterState } = AudioLevelMeterEngine.analyzeFrame(
      decodedFrame,
      state.meterState,
      deltaMs
    );
    state.meterState = nextMeterState;
    state.metrics = metrics;

    // 4. Acoustic Anomaly Detection
    const { alerts, nextState: nextAnomalyState } = AudioAnomalyDetector.evaluate(
      metrics,
      config,
      state.anomalyState,
      deltaMs
    );
    state.anomalyState = nextAnomalyState;

    // 5. Persist alerts
    for (const alert of alerts) {
      await this.repository.createAlert(alert);
      this.emitter.emit(`alert:${cameraId}`, alert);
      this.emitter.emit('alert:global', alert);
    }

    // 6. Record telemetry rollup
    await this.repository.recordTelemetry(cameraId, tenantId, metrics, channelNumber);

    // 7. Emit real-time meter event for SSE subscribers
    this.emitter.emit(`meter:${cameraId}`, metrics);

    return { metrics, alerts };
  }

  /**
   * Ingests precomputed audio telemetry (e.g. from edge-agent or media-gateway metrics reporter).
   */
  async ingestTelemetry(
    cameraId: string,
    metrics: AudioMeterMetrics,
    tenantId: string
  ): Promise<{ alerts: AudioMonitoringAlert[] }> {
    const channelNumber = 1;
    const config = await this.repository.getChannelConfig(cameraId, channelNumber);
    const state = this.getOrCreateChannelState(cameraId);
    state.metrics = metrics;
    state.lastActiveTime = Date.now();

    const alerts: AudioMonitoringAlert[] = [];
    if (config) {
      const evaluation = AudioAnomalyDetector.evaluate(metrics, config, state.anomalyState, 100);
      state.anomalyState = evaluation.nextState;

      for (const alert of evaluation.alerts) {
        await this.repository.createAlert(alert);
        alerts.push(alert);
        this.emitter.emit(`alert:${cameraId}`, alert);
        this.emitter.emit('alert:global', alert);
      }
    }

    await this.repository.recordTelemetry(cameraId, tenantId, metrics, channelNumber);
    this.emitter.emit(`meter:${cameraId}`, metrics);

    return { alerts };
  }

  /**
   * Subscribes to real-time meter metrics for a camera via event callback.
   * Returns an unsubscribe function.
   */
  subscribeToStream(cameraId: string, listener: (metrics: AudioMeterMetrics) => void): () => void {
    const eventName = `meter:${cameraId}`;
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }

  /**
   * Queries historical level metrics for analytics charts.
   */
  async getTelemetryHistory(cameraId: string, limit: number = 60): Promise<AudioMeterMetrics[]> {
    return this.repository.queryTelemetryHistory(cameraId, limit);
  }

  /**
   * Queries acoustic alerts.
   */
  async listAlerts(filters: AlertFilterOptions): Promise<{ alerts: AudioMonitoringAlert[]; total: number }> {
    return this.repository.listAlerts(filters);
  }

  /**
   * Acknowledges an acoustic alert.
   */
  async acknowledgeAlert(
    alertId: string,
    userId?: string,
    notes?: string
  ): Promise<AudioMonitoringAlert | null> {
    return this.repository.acknowledgeAlert(alertId, userId, notes);
  }

  /**
   * Computes aggregate fleet statistics.
   */
  async getFleetStats(tenantId?: string): Promise<AudioFleetStats> {
    const baseStats = await this.repository.getFleetStats(tenantId);
    let activeSpeech = 0;

    for (const state of this.channelStates.values()) {
      if (state.metrics.vadState === 'SPEECH_ACTIVITY') {
        activeSpeech++;
      }
    }

    return {
      ...baseStats,
      activeSpeechChannels: activeSpeech,
    };
  }

  private getOrCreateChannelState(cameraId: string): ActiveChannelState {
    let state = this.channelStates.get(cameraId);
    if (!state) {
      state = {
        metrics: this.createSilentMetrics(),
        meterState: {
          peakHoldDbFS: -90.0,
          peakHoldRemainingMs: 0,
          noiseFloorDbFS: -70.0,
        },
        anomalyState: {
          silenceDurationMs: 0,
          highNoiseDurationMs: 0,
        },
        lastActiveTime: Date.now(),
      };
      this.channelStates.set(cameraId, state);
    }
    return state;
  }

  private createSilentMetrics(): AudioMeterMetrics {
    return {
      rmsDbFS: -90.0,
      peakDbFS: -90.0,
      peakHoldDbFS: -90.0,
      lufs: -90.0,
      crestFactorDb: 0.0,
      noiseFloorDbFS: -70.0,
      snrDb: 0.0,
      clippedSamples: 0,
      clipPercentage: 0.0,
      isClipping: false,
      vadState: 'SILENCE',
      frequencyBands: { low: 33.3, mid: 33.3, high: 33.4 },
      waveform: new Array(48).fill(0),
      timestamp: new Date().toISOString(),
    };
  }

  private createOfflineMetrics(): AudioMeterMetrics {
    return {
      rmsDbFS: -90.0,
      peakDbFS: -90.0,
      peakHoldDbFS: -90.0,
      lufs: -90.0,
      crestFactorDb: 0.0,
      noiseFloorDbFS: -90.0,
      snrDb: 0.0,
      clippedSamples: 0,
      clipPercentage: 0.0,
      isClipping: false,
      vadState: 'SILENCE',
      frequencyBands: { low: 0, mid: 0, high: 0 },
      waveform: new Array(48).fill(0),
      timestamp: new Date().toISOString(),
    };
  }
}
