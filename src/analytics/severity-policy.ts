import { AI_CAPABILITIES } from "./capability-catalog.js";

export type AlertSeverity = "P1" | "P2" | "P3" | "P4" | "P5";

const BUSINESS_DEFAULTS: Readonly<Record<string, AlertSeverity>> = {
  "person-in-vault-after-hours": "P1",
  "queue-length": "P3",
  "atm-queue": "P3",
  fire: "P1",
  "fire-smoke": "P1",
  "no-helmet": "P2",
  helmet: "P2",
  "helmet-worn": "P2",
  shoplifting: "P2",
};

export function defaultSeverityForDetection(detectionType: string): AlertSeverity {
  return BUSINESS_DEFAULTS[detectionType] ??
    AI_CAPABILITIES.find((item) => item.id === detectionType)?.defaultSeverity ?? "P3";
}

export function resolveAlertSeverity(input: {
  configuredSeverity: AlertSeverity;
  durationSeconds: number;
  correlatedDetectionCount?: number;
}): AlertSeverity {
  let rank = severityRank(input.configuredSeverity);
  if (input.durationSeconds >= 900) rank -= 2;
  else if (input.durationSeconds >= 300) rank -= 1;
  if ((input.correlatedDetectionCount ?? 0) >= 2) rank -= 1;
  return severityAt(Math.max(1, rank));
}

export function moreSevere(left: AlertSeverity, right: AlertSeverity): AlertSeverity {
  return severityRank(left) <= severityRank(right) ? left : right;
}

function severityRank(value: AlertSeverity) { return Number(value.slice(1)); }
function severityAt(rank: number): AlertSeverity { return `P${Math.min(5, Math.max(1, rank))}` as AlertSeverity; }
