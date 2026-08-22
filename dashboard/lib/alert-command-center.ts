import type { AnalyticsAlert } from "@/lib/types";

export type AlertDelivery = {
  id: string;
  channel: "dashboard" | "sms" | "email" | "voice" | "log";
  recipient: string;
  status: string;
  attempts: number;
  providerId?: string;
  lastError?: string;
};

export type CommandAlert = AnalyticsAlert & {
  branchId: string;
  branchName: string;
  cameraName: string;
  cameraStatus: string;
  detectionType: string;
  notificationChannels: string[];
  deliveries: AlertDelivery[];
};

export type AlertEvidenceCaptureStatus = {
  alertId: string;
  cameraId: string;
  state: "queued" | "capturing" | "ready" | "partial" | "failed";
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  snapshotAvailable: boolean;
  clipAvailable: boolean;
  error?: string;
};

export function terminalAlertStatus(status: string) {
  return ["resolved", "false_alarm", "suppressed"].includes(status);
}

export function activeDashboardQueue(alerts: CommandAlert[]) {
  return alerts
    .filter((alert) => !terminalAlertStatus(alert.status) && alert.severity !== "P4" && alert.severity !== "P5")
    .sort((left, right) => priority(left.severity) - priority(right.severity)
      || Date.parse(right.lastDetectedAt) - Date.parse(left.lastDetectedAt));
}

export function popupQueue(alerts: CommandAlert[], dismissed: ReadonlySet<string>) {
  return activeDashboardQueue(alerts).filter((alert) =>
    alert.status === "new" && (alert.severity === "P1" || alert.severity === "P2") && !dismissed.has(alert.id));
}

export function alertTonePattern(priorityValue: string) {
  if (priorityValue === "P1") return [880, 880, 1100];
  if (priorityValue === "P2") return [660, 660];
  return [440];
}

export function managedEvidenceReference(alertId: string, kind: "snapshot" | "clip") {
  return `/v1/alerts/${alertId}/evidence/${kind}`;
}

export function isManagedEvidenceReference(
  alertId: string,
  kind: "snapshot" | "clip",
  reference: string | undefined,
) {
  return reference === managedEvidenceReference(alertId, kind);
}

export function dashboardEvidenceUrl(reference: string) {
  return reference.startsWith("/v1/") ? `/api/control${reference}` : reference;
}

export function evidenceAvailable(
  alert: CommandAlert,
  kind: "snapshot" | "clip",
  status?: AlertEvidenceCaptureStatus,
) {
  const reference = kind === "snapshot" ? alert.snapshotReference : alert.clipReference;
  if (!reference) return false;
  if (!isManagedEvidenceReference(alert.id, kind, reference)) return true;
  return kind === "snapshot" ? status?.snapshotAvailable === true : status?.clipAvailable === true;
}

export function hasManagedEvidence(alert: CommandAlert) {
  return isManagedEvidenceReference(alert.id, "snapshot", alert.snapshotReference) ||
    isManagedEvidenceReference(alert.id, "clip", alert.clipReference);
}

function priority(value: string) {
  return value === "P1" ? 1 : value === "P2" ? 2 : value === "P3" ? 3 : 4;
}
