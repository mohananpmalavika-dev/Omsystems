/**
 * Alert Audio Severity Policies & Priority Definitions
 */

import type { AlertSeverity, AudioSeverityPolicy } from "./alert-audio.types";

export const ALERT_PRIORITIES: Record<AlertSeverity, number> = {
  P1: 4,
  P2: 3,
  P3: 2,
  P4: 1,
};

export const ALERT_AUDIO_POLICIES: Record<AlertSeverity, AudioSeverityPolicy> = {
  P1: {
    severity: "P1",
    // Alternating emergency siren: 880Hz (A5) -> 659Hz (E5) -> 880Hz -> 659Hz
    toneFrequencies: [880, 659, 880, 659],
    volumeMultiplier: 1.0,
    repeatIntervalMs: 15_000, // Repeats every 15s until ACK
    maxRepeats: undefined, // Unlimited until acknowledged/resolved
    stopOnAcknowledge: true,
    stopOnResolve: true,
    allowPermanentMute: false, // Critical alerts cannot be permanently muted
  },
  P2: {
    severity: "P2",
    // High urgency dual chime: 587Hz (D5) -> 784Hz (G5)
    toneFrequencies: [587, 784],
    volumeMultiplier: 0.8,
    repeatIntervalMs: 60_000, // Repeats every 60s
    maxRepeats: 5,
    stopOnAcknowledge: true,
    stopOnResolve: true,
    allowPermanentMute: true,
  },
  P3: {
    severity: "P3",
    // Warning notice ping: 523Hz (C5)
    toneFrequencies: [523],
    volumeMultiplier: 0.5,
    repeatIntervalMs: undefined, // Plays once
    maxRepeats: 1,
    stopOnAcknowledge: true,
    stopOnResolve: true,
    allowPermanentMute: true,
  },
  P4: {
    severity: "P4",
    toneFrequencies: [],
    volumeMultiplier: 0,
    repeatIntervalMs: undefined,
    maxRepeats: 0,
    stopOnAcknowledge: true,
    stopOnResolve: true,
    allowPermanentMute: true,
  },
};

export const SLA_WARNING_TONE_FREQUENCIES = [1046, 1318]; // High-pitched urgency chime
