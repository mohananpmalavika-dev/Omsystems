import type { OperationalAlert } from "../domain/operational-alert.types.js";
import type { NormalizedAlertCandidate } from "./alert-normalizer.service.js";

const DEFAULT_SUPPRESSION_WINDOWS_MS: Record<string, number> = {
  intrusion: 30_000, // 30s
  person_in_vault: 30_000,
  motion: 20_000,
  camera_offline: 300_000, // 5 min
  recorder_offline: 300_000,
  wan_offline: 300_000,
  smart_warning: 1_800_000, // 30 min
  retention_violation: 86_400_000, // 24 hours
};

export class AlertDeduplicationService {
  private readonly activeWindows = new Map<string, { alertId: string; expiresAt: number }>();

  checkDuplicate(
    candidate: NormalizedAlertCandidate,
    activeAlerts: Map<string, OperationalAlert>,
  ): { isDuplicate: boolean; existingAlert?: OperationalAlert | undefined } {
    const key = candidate.dedupKey;
    const now = Date.now();
    const entry = this.activeWindows.get(key);

    if (entry && entry.expiresAt > now) {
      const existing = activeAlerts.get(entry.alertId);
      if (existing && existing.status !== "RESOLVED" && existing.status !== "DISMISSED") {
        return {
          isDuplicate: true,
          existingAlert: existing,
        };
      }
    }

    return { isDuplicate: false };
  }

  registerWindow(alert: OperationalAlert) {
    const key = alert.dedupKey;
    const typeLower = alert.detection.type.toLowerCase();

    let windowMs = 30_000;
    for (const [k, ms] of Object.entries(DEFAULT_SUPPRESSION_WINDOWS_MS)) {
      if (typeLower.includes(k)) {
        windowMs = ms;
        break;
      }
    }

    this.activeWindows.set(key, {
      alertId: alert.id,
      expiresAt: Date.now() + windowMs,
    });
  }

  clearWindow(dedupKey: string) {
    this.activeWindows.delete(dedupKey);
  }
}
