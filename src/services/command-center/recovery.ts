import type { CommandTimelineEvent, RecoveryEstimate } from "./types.js";

export function estimateRecovery(timeline: CommandTimelineEvent[]): RecoveryEstimate {
  const samples = [...timeline].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const event of samples) {
    const metrics = event.raw.metrics;
    if (!metrics || typeof metrics !== "object") continue;
    const values = metrics as Record<string, unknown>;
    const estimate = numeric(values.estimatedRecoveryMinutes) ?? numeric(values.recoveryEtaMinutes);
    if (estimate != null) {
      const uncertainty = numeric(values.recoveryUncertaintyMinutes) ?? Math.max(1, Math.round(estimate * 0.2));
      return {
        available: true,
        automatedMinutes: { minimum: Math.max(0, estimate - uncertainty), maximum: estimate + uncertainty },
        engineerAssistedMinutes: null,
        confidence: event.source.includes(":verified") ? "high" : "medium",
        basis: [`${event.source} reported an estimated recovery of ${estimate} minutes at ${event.occurredAt}.`],
        missingInputs: [],
        statement: `Reported recovery window is ${Math.max(0, estimate - uncertainty)}–${estimate + uncertainty} minutes.`,
      };
    }
  }
  return {
    available: false,
    automatedMinutes: null,
    engineerAssistedMinutes: null,
    confidence: "insufficient",
    basis: [],
    missingInputs: ["device or provider recovery ETA", "verified historical resolution samples for the same failure class"],
    statement: "Recovery time is unknown because no authoritative ETA or verified historical recovery sample is available.",
  };
}

export function currentRecoveryActivity(timeline: CommandTimelineEvent[]) {
  const activity: string[] = [];
  for (const event of [...timeline].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
    const metrics = event.raw.metrics;
    if (!metrics || typeof metrics !== "object") continue;
    const values = metrics as Record<string, unknown>;
    if (values.failoverActive === true) activity.push(`Network failover is reported active (${event.occurredAt}).`);
    if (values.recoveryInProgress === true) activity.push(`Recovery is reported in progress for ${event.entityId ?? event.entityType} (${event.occurredAt}).`);
    if (typeof values.currentRecoveryAction === "string" && values.currentRecoveryAction.trim()) {
      activity.push(`${values.currentRecoveryAction.trim()} (${event.occurredAt}).`);
    }
  }
  return [...new Set(activity)].slice(0, 5);
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
