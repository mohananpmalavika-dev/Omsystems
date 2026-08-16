/**
 * Control Room Alert Audio Subsystem - Types & Interfaces
 */

export type AlertAudioState =
  | "LOCKED"
  | "INITIALIZING"
  | "READY"
  | "MUTED"
  | "FAILED"
  | "UNSUPPORTED";

export type AlertSeverity = "P1" | "P2" | "P3" | "P4";

export interface AlertAudioStatus {
  state: AlertAudioState;
  enabled: boolean;
  muted: boolean;
  volume: number; // 0.0 to 1.0

  selectedOutputDeviceId?: string | undefined;
  selectedOutputDeviceLabel?: string | undefined;
  outputRouting: "SELECTED_DEVICE" | "SYSTEM_DEFAULT" | "UNSUPPORTED";

  audioContextState?: ("suspended" | "running" | "closed") | undefined;

  lastSuccessfulPlaybackAt?: string | undefined;
  lastPlaybackFailureAt?: string | undefined;
  lastError?: string | undefined;

  activeP1Count: number;
  activeP2Count: number;
  highestAudibleSeverity?: AlertSeverity | null | undefined;
  temporarySilenceUntil?: string | undefined;
}

export interface AudioSeverityPolicy {
  severity: AlertSeverity;
  toneFrequencies: number[];
  volumeMultiplier: number;
  repeatIntervalMs?: number | undefined;
  maxRepeats?: number | undefined;
  stopOnAcknowledge: boolean;
  stopOnResolve: boolean;
  allowPermanentMute: boolean;
}

export interface PlayAlertOptions {
  alertId: string;
  severity: AlertSeverity;
  title?: string | undefined;
  isSlaWarning?: boolean | undefined;
  force?: boolean | undefined;
}

export interface AudibleAlert {
  alertId: string;
  severity: AlertSeverity;
  title?: string | undefined;
  firstTriggeredAt: string;
  lastPlayedAt: string;
  playbackCount: number;
  acknowledged: boolean;
  resolved: boolean;
}

export type AudioAuditAction =
  | "AUDIO_ENABLED"
  | "AUDIO_DISABLED"
  | "AUDIO_MUTED"
  | "AUDIO_UNMUTED"
  | "AUDIO_TESTED"
  | "AUDIO_PLAYBACK_FAILED"
  | "AUDIO_SILENCED_TEMP";

export interface AudioAuditEvent {
  id: string;
  userId: string;
  workstationId?: string | undefined;
  action: AudioAuditAction;
  severityTested?: AlertSeverity | undefined;
  timestamp: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface OperatorConsoleAudioHealth {
  workstationId: string;
  userId: string;
  audioState: AlertAudioState;
  volume: number;
  outputDevice: string;
  lastTestedAt?: string | undefined;
  lastSuccessfulPlaybackAt?: string | undefined;
  lastError?: string | undefined;
  observedAt: string;
}
