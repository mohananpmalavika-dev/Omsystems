/**
 * Authoritative Audio Domain Types for Audio Stream Monitoring (video.audio)
 * 
 * Supports broadcast-standard acoustic telemetry, real-time level metering,
 * ITU-T companded codecs, Linear PCM, AAC-ADTS, and security acoustic alarms.
 */

export type AudioCodec =
  | 'PCMU'
  | 'PCMA'
  | 'PCM_S16LE'
  | 'PCM_S16BE'
  | 'PCM_U8'
  | 'PCM_S24LE'
  | 'PCM_F32LE'
  | 'AAC_ADTS'
  | 'OPUS'
  | 'UNKNOWN';

export interface DecodedAudioFrame {
  /** Normalized audio sample buffers per channel, range [-1.0, 1.0] */
  channels: Float32Array[];
  sampleRate: number;
  channelCount: number;
  sampleCount: number;
  format: AudioCodec;
  timestamp: number;
}

export type VadState = 'SILENCE' | 'SPEECH_ACTIVITY' | 'HIGH_NOISE_ALERT' | 'CLIPPED';

export interface FrequencyBandDistribution {
  /** Low frequency energy percentage (< 250 Hz, rumble, motor, bass) */
  low: number;
  /** Mid frequency energy percentage (250 Hz - 4000 Hz, speech formants) */
  mid: number;
  /** High frequency energy percentage (> 4000 Hz, glass shattering, screeches) */
  high: number;
}

export interface AudioMeterMetrics {
  /** Root Mean Square level in dBFS, clamped [-90.0, 0.0] */
  rmsDbFS: number;
  /** Absolute sample peak in dBFS, clamped [-90.0, 0.0] */
  peakDbFS: number;
  /** Peak hold value with ballistics decay in dBFS */
  peakHoldDbFS: number;
  /** ITU-R BS.1770-4 / EBU R128 loudness in LUFS */
  lufs: number;
  /** Dynamic crest factor (peak - rms) in dB */
  crestFactorDb: number;
  /** Estimated ambient background noise floor in dBFS */
  noiseFloorDbFS: number;
  /** Signal-to-noise ratio in dB */
  snrDb: number;
  /** Count of samples hitting full scale saturation */
  clippedSamples: number;
  /** Percentage of clipped samples in the window */
  clipPercentage: number;
  /** Boolean indicating whether clipping exceeds tolerance */
  isClipping: boolean;
  /** Voice / Sound Activity Detection state */
  vadState: VadState;
  /** Real-time spectral energy distribution */
  frequencyBands: FrequencyBandDistribution;
  /** Downsampled waveform envelope for visualization (32-64 points) */
  waveform: number[];
  /** ISO timestamp of analysis */
  timestamp: string;
}

export interface AudioChannelConfig {
  id: string;
  cameraId: string;
  tenantId: string;
  branchId?: string;
  channelNumber: number;
  isEnabled: boolean;
  codec: AudioCodec;
  sampleRateHz: number;
  channels: number;
  gainDb: number;
  silenceThresholdDbFS: number;
  silenceTimeoutSec: number;
  noiseThresholdDbFS: number;
  noiseTriggerDurationMs: number;
  screamDetectionEnabled: boolean;
  spikeSensitivity: number;
  clippingAlertEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AudioAlertType =
  | 'audio_loss'
  | 'high_noise_threshold'
  | 'acoustic_spike'
  | 'scream_distress'
  | 'clipping_distortion';

export type AudioAlertSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type AudioAlertStatus = 'detected' | 'acknowledged' | 'resolved' | 'false_positive';

export interface AudioMonitoringAlert {
  id: string;
  tenantId: string;
  branchId?: string;
  cameraId: string;
  channelNumber: number;
  alertType: AudioAlertType;
  severity: AudioAlertSeverity;
  status: AudioAlertStatus;
  peakDbFS: number;
  rmsDbFS: number;
  durationMs: number;
  details: Record<string, any>;
  notes?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  detectedAt: string;
  createdAt: string;
}

export interface AudioChannelStatus {
  cameraId: string;
  cameraName: string;
  branchId?: string;
  nodeId?: string;
  vendor?: string;
  model?: string;
  sourceType?: string;
  channelNumber: number;
  config: AudioChannelConfig;
  currentMetrics: AudioMeterMetrics;
  isOnline: boolean;
  hasActiveAlert: boolean;
  activeAlertCount: number;
}

export interface AudioFleetStats {
  totalChannels: number;
  monitoredChannels: number;
  activeSpeechChannels: number;
  alertingChannels: number;
  averageNoiseFloorDbFS: number;
  totalAlerts24h: number;
}
