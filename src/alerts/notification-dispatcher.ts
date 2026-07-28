import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type {
  AlertNotification,
  AlertNotificationChannel,
  AlertNotificationPolicy,
  AnalyticsAlert,
  AnalyticsRule,
} from "../domain/models.js";
import { alertEvents } from "./event-stream.js";

export const NOTIFICATION_MATRIX: Record<string, AlertNotificationChannel[]> = {
  P1: ["dashboard", "sms", "email", "voice"],
  P2: ["dashboard", "email"],
  P3: ["dashboard"],
  P4: ["log"],
  P5: ["log"],
};

export interface AlertNotificationSender {
  send(notification: AlertNotification, alert: AnalyticsAlert): Promise<{ providerId: string }>;
}

export class HttpAlertNotificationSender implements AlertNotificationSender {
  constructor(private readonly endpoints: Partial<Record<"sms" | "email" | "voice", string>>,
    private readonly token?: string) {}

  async send(notification: AlertNotification, alert: AnalyticsAlert) {
    if (notification.channel === "dashboard" || notification.channel === "log") {
      return { providerId: `internal:${notification.channel}:${notification.id}` };
    }
    const endpoint = this.endpoints[notification.channel];
    if (!endpoint || notification.recipient === "unconfigured") throw new Error(`${notification.channel}_provider_or_recipient_unconfigured`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        recipient: notification.recipient,
        alert: {
          id: alert.id, severity: alert.severity, title: alert.title,
          description: alert.description, cameraId: alert.cameraId,
          occurredAt: alert.firstDetectedAt,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const body = await response.json().catch(() => ({})) as { id?: string; providerId?: string };
    return { providerId: body.providerId ?? body.id ?? `${notification.channel}:${response.status}` };
  }
}

export async function enqueueAlertMatrix(
  store: ControlPlaneStore,
  alert: AnalyticsAlert,
  rule?: AnalyticsRule,
) {
  const policy = await store.getAlertNotificationPolicy(alert.tenantId);
  const channels = NOTIFICATION_MATRIX[alert.severity] ?? ["log"];
  const targets = channels.flatMap((channel) => recipientsFor(channel, rule?.recipients ?? [], policy)
    .map((recipient) => ({ tenantId: alert.tenantId, alertId: alert.id, channel, recipient })));
  return store.enqueueAlertNotifications(targets);
}

export class AlertNotificationDispatcher {
  private draining = false;
  constructor(private readonly store: ControlPlaneStore, private readonly sender: AlertNotificationSender) {}

  async drainOnce(limit = 50) {
    if (this.draining) return 0;
    this.draining = true;
    let completed = 0;
    try {
      const notifications = await this.store.claimAlertNotifications(limit, new Date().toISOString());
      for (const notification of notifications) {
        const alert = await this.store.getAnalyticsAlert(notification.alertId, notification.tenantId);
        if (!alert) {
          await this.store.completeAlertNotification(notification.id, { status: "dead", error: "alert_not_found" });
          continue;
        }
        try {
          const result = await this.sender.send(notification, alert);
          await this.store.completeAlertNotification(notification.id, { status: "delivered", providerId: result.providerId });
        } catch (error) {
          const attempts = notification.attempts;
          const dead = attempts >= 5;
          await this.store.completeAlertNotification(notification.id, {
            status: dead ? "dead" : "failed",
            error: error instanceof Error ? error.message : "notification_failed",
            ...(!dead ? { nextAttemptAt: new Date(Date.now() + Math.min(300, 2 ** attempts * 5) * 1_000).toISOString() } : {}),
          });
        }
        completed += 1;
        alertEvents.publish({
          id: randomUUID(), tenantId: notification.tenantId,
          type: "notification.updated", occurredAt: new Date().toISOString(), alertId: notification.alertId,
        });
      }
      return completed;
    } finally {
      this.draining = false;
    }
  }
}

function recipientsFor(
  channel: AlertNotificationChannel,
  ruleRecipients: string[],
  policy: AlertNotificationPolicy,
) {
  if (channel === "dashboard") return ["ho-surveillance-room"];
  if (channel === "log") return ["system-log"];
  const prefix = `${channel}:`;
  const fromRule = ruleRecipients
    .filter((recipient) => recipient.startsWith(prefix) || (channel === "email" && recipient.includes("@") && !recipient.includes(":")))
    .map((recipient) => recipient.startsWith(prefix) ? recipient.slice(prefix.length) : recipient);
  const scheduled = activeOnCallRecipients(channel, policy);
  const configured = policy.recipientGroups[channel] ?? [];
  const recipients = [...new Set([...fromRule, ...scheduled, ...configured])];
  return recipients.length > 0 ? recipients : ["unconfigured"];
}

function activeOnCallRecipients(channel: "sms" | "email" | "voice", policy: AlertNotificationPolicy) {
  const now = new Date();
  return policy.onCallSchedules.filter((schedule) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: schedule.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((part) => part.type === "weekday")?.value ?? "");
    const time = `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
    return schedule.days.includes(weekday) && (schedule.start <= schedule.end
      ? time >= schedule.start && time < schedule.end
      : time >= schedule.start || time < schedule.end);
  }).flatMap((schedule) => schedule.recipients[channel] ?? []);
}
