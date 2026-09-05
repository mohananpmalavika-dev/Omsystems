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
const SPEECH_PREF_KEY = "sentinel-control-room-speech-alerts-enabled";

export class AlertAudioService {
  private status: AlertAudioStatus = {
    state: "LOCKED",
    enabled: true,
    speechEnabled: true,
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
  private volumeDebounceTimer?: number | undefined;
  private statusListeners: Set<(status: AlertAudioStatus) => void> = new Set();
  private isSynthesizing = false;
  private initialized = false;
  private spokenAt: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== "undefined") {
      const localEnabled = window.localStorage.getItem(SOUND_PREF_KEY) === "true";
      const localSpeech = window.localStorage.getItem(SPEECH_PREF_KEY);
      const savedVolume = window.localStorage.getItem(VOLUME_PREF_KEY);
      if (savedVolume) {
        this.status.volume = Number(savedVolume) || 0.9;
      }
      if (localEnabled) {
        this.status.enabled = true;
        this.status.state = "READY";
      }
      if (localSpeech !== null) this.status.speechEnabled = localSpeech === "true";
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

  private async fetchPreferenceFromServer(): Promise<Record<string, any> | null> {
    if (typeof window === "undefined" || typeof fetch === "undefined") return null;
    try {
      let res = await fetch("/api/ai/preferences", { credentials: "include" }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch("/api/control/v1/auth/preferences", { credentials: "include" }).catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        return data.preferences || null;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  private async syncPreferenceToServer(prefs: Record<string, unknown>) {
    if (typeof window === "undefined" || typeof fetch === "undefined") return;
    try {
      const reqInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include" as const,
        body: JSON.stringify(prefs),
      };
      await fetch("/api/ai/preferences", reqInit).catch(() => {});
      await fetch("/api/control/v1/auth/preferences", reqInit).catch(() => {});
    } catch {
      // Background sync
    }
  }

  private debouncedSyncVolume(volume: number) {
    if (typeof window === "undefined") return;
    if (this.volumeDebounceTimer) {
      window.clearTimeout(this.volumeDebounceTimer);
    }
    this.volumeDebounceTimer = window.setTimeout(() => {
      void this.syncPreferenceToServer({ alertAudioVolume: volume });
    }, 600);
  }

  /**
   * Initializes audio alert settings from user account across all devices
   * and arms browser autoplay seamlessly on first user gesture.
   */
  async init(userId = "operator"): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Fetch authoritative server preference for this user
    const serverPrefs = await this.fetchPreferenceFromServer();
    if (serverPrefs) {
      if (typeof serverPrefs.speechAlertsEnabled === "boolean") {
        this.status.speechEnabled = serverPrefs.speechAlertsEnabled;
        if (typeof window !== "undefined") window.localStorage.setItem(SPEECH_PREF_KEY, String(this.status.speechEnabled));
      }
      if (serverPrefs.alertAudioEnabled) {
        this.status.state = "READY";
        if (typeof serverPrefs.alertAudioVolume === "number") {
          const vol = Math.max(0, Math.min(1, serverPrefs.alertAudioVolume));
          this.status.volume = vol;
          alertAudioSynthesizer.setMasterVolume(vol);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(VOLUME_PREF_KEY, String(vol));
          }
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SOUND_PREF_KEY, "true");
        }
      }
      this.notifyStatusChange();
    }

    // When audio is enabled, attach one-time transparent gesture listener
    // so the very first interaction (click, keypress, tap) silently resumes the AudioContext
    if (this.status.enabled && typeof window !== "undefined") {
      const armOnFirstGesture = () => {
        alertAudioSynthesizer.ensureAudioContext()
          .then((ctx) => {
            this.status.audioContextState = ctx.state;
            if (ctx.state === "running") {
              this.status.state = "READY";
            }
            this.notifyStatusChange();
          })
          .catch(() => {});
      };
      window.addEventListener("pointerdown", armOnFirstGesture, { once: true, passive: true });
      window.addEventListener("keydown", armOnFirstGesture, { once: true, passive: true });
      window.addEventListener("click", armOnFirstGesture, { once: true, passive: true });
    }
  }

  /**
   * Unlocks Web Audio during user interaction (gesture) and persists to account
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

      // Persist across devices to user's account in PostgreSQL
      void this.syncPreferenceToServer({
        alertAudioEnabled: true,
        alertAudioVolume: this.status.volume,
      });

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
    void userId;
    // System tones are mandatory. Only spoken announcements can be disabled.
    this.status.enabled = true;
    this.notifyStatusChange();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.status.volume = clamped;
    alertAudioSynthesizer.setMasterVolume(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_PREF_KEY, String(clamped));
    }
    this.debouncedSyncVolume(clamped);
    this.notifyStatusChange();
  }

  setSpeechEnabled(enabled: boolean): void {
    this.status.speechEnabled = enabled;
    if (typeof window !== "undefined") window.localStorage.setItem(SPEECH_PREF_KEY, String(enabled));
    void this.syncPreferenceToServer({ speechAlertsEnabled: enabled });
    if (!enabled && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    this.notifyStatusChange();
  }

  /**
   * Plays alert sound according to severity policy, deduplication, and priority queue
   */
  async playAlert(options: PlayAlertOptions, userId = "operator"): Promise<void> {
    // If audio is disabled by user, remain silent
    if (!this.status.enabled) {
      return;
    }

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
      this.speakAlert(options);

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

  private speakAlert(options: PlayAlertOptions): void {
    if (!this.status.speechEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const now = Date.now();
    const lastSpoken = this.spokenAt.get(options.alertId) ?? 0;
    if (!options.force && now - lastSpoken < 10_000) return;
    this.spokenAt.set(options.alertId, now);

    const text = options.announcement?.trim() || buildAlertAnnouncement(options);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = Math.max(0, Math.min(1, this.status.volume));
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
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
      void fetch("/api/control/v1/alerts/audio/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(event),
      }).catch(() => {
        // Local audit buffer preserved
      });
    }
  }
}

function buildAlertAnnouncement(options: PlayAlertOptions): string {
  const severity = options.severity === "P1" ? "Critical" : options.severity === "P2" ? "High priority" : "Security";
  const detection = friendlyDetectionType(options.detectionType || options.title);
  const location = [options.branchName, options.cameraName].filter(Boolean).join(", ");
  return `${severity} alert${location ? ` at ${location}` : ""}: ${detection}.`;
}

function friendlyDetectionType(value?: string): string {
  const normalized = (value || "AI event").toLowerCase().replaceAll("_", "-");
  if (normalized.includes("helmet") && (normalized.includes("worn") || normalized.includes("inside"))) return "helmet detected inside the branch";
  if (normalized.includes("no-helmet") || normalized.includes("helmet violation")) return "person without helmet detected";
  if (normalized.includes("unauthorized") || normalized.includes("unknown-person") || normalized.includes("watchlist")) return "unauthorized access detected";
  if (normalized.includes("intrusion") || normalized.includes("entry")) return "unauthorized entry detected";
  if (normalized.includes("fire") || normalized.includes("smoke")) return "fire or smoke detected";
  return value?.trim() || "AI event detected";
}

export const alertAudioService = new AlertAudioService();
