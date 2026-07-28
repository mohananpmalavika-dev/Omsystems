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

function priority(value: string) {
  return value === "P1" ? 1 : value === "P2" ? 2 : value === "P3" ? 3 : 4;
}
