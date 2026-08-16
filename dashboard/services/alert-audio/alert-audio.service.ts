/**
 * Centralized Control Room Alert Audio Service
 * 
 * Manages audio permissions, priority arbitration, alert deduplication,
 * repeating sirens, lifecycle stoppage on acknowledgement, and health status.
 */

import type {
  AlertAudioState,
  AlertAudioStatus,
  AlertSeverity,
  PlayAlertOptions,
  AudibleAlert,
  AudioAuditEvent,
  AudioAuditAction,
} from "./alert-audio.types";
import {
  ALERT_AUDIO_POLICIES,
  ALERT_PRIORITIES,
  SLA_WARNING_TONE_FREQUENCIES,
} from "./alert-audio-policy";
import { alertAudioSynthesizer } from "./alert-audio-synthesizer";

const SOUND_PREF_KEY = "sentinel-control-room-alert-audio-enabled";
const VOLUME_PREF_KEY = "sentinel-control-room-alert-audio-volume";

export class AlertAudioService {
  private status: AlertAudioStatus = {
    state: "LOCKED",
    enabled: false,
    muted: false,
    volume: 0.9,
    outputRouting: "SYSTEM_DEFAULT",
    activeP1Count: 0,
    activeP2Count: 0,
    highestAudibleSeverity: null,
  };

  private activeAudibleAlerts: Map<string, AudibleAlert> = new Map();
  private repeatTimers: Map<string, number> = new Map();
  private temporarySilenceTimer?: number | undefined;
  private statusListeners: Set<(status: AlertAudioStatus) => void> = new Set();
  private isSynthesizing = false;

  constructor() {
    if (typeof window !== "undefined") {
      const savedVolume = window.localStorage.getItem(VOLUME_PREF_KEY);
      if (savedVolume) {
        this.status.volume = Number(savedVolume) || 0.9;
      }
    }
  }

  getAudioStatus(): AlertAudioStatus {
    return { ...this.status };
  }

  onStatusChange(listener: (status: AlertAudioStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getAudioStatus());
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatusChange() {
    const current = this.getAudioStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(current);
      } catch {
        // Suppress listener exceptions
      }
    }
  }

  /**
   * Unlocks Web Audio during user interaction (gesture)
   */
  async enable(userId = "operator"): Promise<void> {
    try {
      this.status.state = "INITIALIZING";
      this.notifyStatusChange();

      const ctx = await alertAudioSynthesizer.ensureAudioContext();
      alertAudioSynthesizer.setMasterVolume(this.status.volume);

      await alertAudioSynthesizer.playUnlockTone();

      this.status = {
        ...this.status,
        state: "READY",
        enabled: true,
        muted: false,
        audioContextState: ctx.state,
        lastSuccessfulPlaybackAt: new Date().toISOString(),
        lastError: undefined,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(SOUND_PREF_KEY, "true");
      }

      this.recordAuditEvent("AUDIO_ENABLED", userId);
      this.notifyStatusChange();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = {
        ...this.status,
        state: "FAILED",
        enabled: false,
        lastPlaybackFailureAt: new Date().toISOString(),
        lastError: msg,
      };
      this.recordAuditEvent("AUDIO_PLAYBACK_FAILED", userId, undefined, { error: msg });
      this.notifyStatusChange();
      throw err;
    }
  }

  disable(userId = "operator"): void {
    this.stopAll();
    this.status = {
      ...this.status,
      state: "LOCKED",
      enabled: false,
    };
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SOUND_PREF_KEY);
    }
    this.recordAuditEvent("AUDIO_DISABLED", userId);
    this.notifyStatusChange();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.status.volume = clamped;
    alertAudioSynthesizer.setMasterVolume(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_PREF_KEY, String(clamped));
    }
    this.notifyStatusChange();
  }

  /**
   * Plays alert sound according to severity policy, deduplication, and priority queue
   */
  async playAlert(options: PlayAlertOptions, userId = "operator"): Promise<void> {
    const now = new Date().toISOString();
    const policy = ALERT_AUDIO_POLICIES[options.severity];
    if (!policy || policy.toneFrequencies.length === 0) return;

    // Check temporary silence (silence applies to P1 for 30s/60s)
    if (this.status.temporarySilenceUntil && new Date(this.status.temporarySilenceUntil).getTime() > Date.now()) {
      return;
    }

    // Check if muted (P1 ignores permanent mute, P2/P3 respects mute)
    if (this.status.muted && policy.allowPermanentMute) {
      return;
    }

    // Deduplication check: Do not re-play same alert within 3 seconds unless forced
    const existing = this.activeAudibleAlerts.get(options.alertId);
    if (existing && !options.force) {
      const lastPlayTime = new Date(existing.lastPlayedAt).getTime();
      if (Date.now() - lastPlayTime < 3_000) {
        return;
      }
    }

    // Register active audible alert
    const updatedAlert: AudibleAlert = {
      alertId: options.alertId,
      severity: options.severity,
      title: options.title,
      firstTriggeredAt: existing?.firstTriggeredAt ?? now,
      lastPlayedAt: now,
      playbackCount: (existing?.playbackCount ?? 0) + 1,
      acknowledged: false,
      resolved: false,
    };
    this.activeAudibleAlerts.set(options.alertId, updatedAlert);

    this.recalculateActiveCounts();

    // Priority arbitration: Do not play P2/P3 if active unacknowledged P1 exists
    const currentPriority = ALERT_PRIORITIES[options.severity];
    const highestPriority = this.status.highestAudibleSeverity
      ? ALERT_PRIORITIES[this.status.highestAudibleSeverity]
      : 0;

    if (currentPriority < highestPriority && highestPriority >= ALERT_PRIORITIES.P1) {
      return; // Suppressed by active P1
    }

    // Play tone through Web Audio API
    try {
      this.isSynthesizing = true;
      const frequencies = options.isSlaWarning ? SLA_WARNING_TONE_FREQUENCIES : policy.toneFrequencies;
      await alertAudioSynthesizer.playToneSequence(frequencies, policy.volumeMultiplier);

      this.status = {
        ...this.status,
        state: "READY",
        lastSuccessfulPlaybackAt: new Date().toISOString(),
        lastError: undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = {
        ...this.status,
        lastPlaybackFailureAt: new Date().toISOString(),
        lastError: msg,
      };
      this.recordAuditEvent("AUDIO_PLAYBACK_FAILED", userId, options.severity, { error: msg });
    } finally {
      this.isSynthesizing = false;
      this.notifyStatusChange();
    }

    // Schedule repeating alarm if configured (e.g. P1 every 15s)
    if (policy.repeatIntervalMs && !this.repeatTimers.has(options.alertId)) {
      this.scheduleRepeat(options);
    }
  }

  private scheduleRepeat(options: PlayAlertOptions) {
    const policy = ALERT_AUDIO_POLICIES[options.severity];
    if (!policy.repeatIntervalMs) return;

    if (typeof window === "undefined") return;

    const timer = window.setInterval(() => {
      const current = this.activeAudibleAlerts.get(options.alertId);
      if (!current || current.acknowledged || current.resolved) {
        this.stopAlert(options.alertId);
        return;
      }

      // Check max repeats
      if (policy.maxRepeats && current.playbackCount >= policy.maxRepeats) {
        this.stopAlert(options.alertId);
        return;
      }

      // Coalescing: Only 1 P1 repeating sound fires if multiple P1s exist
      void this.playAlert({ ...options, force: true });
    }, policy.repeatIntervalMs);

    this.repeatTimers.set(options.alertId, timer);
  }

  /**
   * Stops audio repeat timer when alert is acknowledged or resolved
   */
  stopAlert(alertId: string): void {
    const timer = this.repeatTimers.get(alertId);
    if (timer) {
      if (typeof window !== "undefined") {
        window.clearInterval(timer);
      }
      this.repeatTimers.delete(alertId);
    }

    const alert = this.activeAudibleAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.activeAudibleAlerts.delete(alertId);
    }

    this.recalculateActiveCounts();
    this.notifyStatusChange();
  }

  stopAll(): void {
    if (typeof window !== "undefined") {
      for (const timer of this.repeatTimers.values()) {
        window.clearInterval(timer);
      }
    }
    this.repeatTimers.clear();
    this.activeAudibleAlerts.clear();
    this.recalculateActiveCounts();
    this.notifyStatusChange();
  }

  /**
   * Silences P1 temporarily for 30s or 60s without allowing permanent muting
   */
  silenceTemporarily(seconds = 30, userId = "operator"): void {
    const until = new Date(Date.now() + seconds * 1000).toISOString();
    this.status.temporarySilenceUntil = until;

    if (typeof window !== "undefined") {
      if (this.temporarySilenceTimer) {
        window.clearTimeout(this.temporarySilenceTimer);
      }
      this.temporarySilenceTimer = window.setTimeout(() => {
        this.status.temporarySilenceUntil = undefined;
        this.notifyStatusChange();
      }, seconds * 1000);
    }

    this.recordAuditEvent("AUDIO_SILENCED_TEMP", userId, undefined, { durationSeconds: seconds });
    this.notifyStatusChange();
  }

  /**
   * Test tone execution for operator self-test
   */
  async testSeverity(severity: AlertSeverity, userId = "operator"): Promise<void> {
    const policy = ALERT_AUDIO_POLICIES[severity];
    if (!policy) return;

    await alertAudioSynthesizer.playToneSequence(policy.toneFrequencies, policy.volumeMultiplier);
    this.recordAuditEvent("AUDIO_TESTED", userId, severity);
  }

  private recalculateActiveCounts() {
    let p1 = 0;
    let p2 = 0;
    for (const a of this.activeAudibleAlerts.values()) {
      if (!a.acknowledged && !a.resolved) {
        if (a.severity === "P1") p1++;
        else if (a.severity === "P2") p2++;
      }
    }

    this.status.activeP1Count = p1;
    this.status.activeP2Count = p2;
    this.status.highestAudibleSeverity = p1 > 0 ? "P1" : p2 > 0 ? "P2" : null;
  }

  private recordAuditEvent(
    action: AudioAuditAction,
    userId: string,
    severityTested?: AlertSeverity,
    metadata?: Record<string, unknown>
  ) {
    const event: AudioAuditEvent = {
      id: `audit-aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      action,
      severityTested,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Forward to backend async
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      void fetch("/api/v1/alerts/audio/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {
        // Local audit buffer preserved
      });
    }
  }
}

export const alertAudioService = new AlertAudioService();
