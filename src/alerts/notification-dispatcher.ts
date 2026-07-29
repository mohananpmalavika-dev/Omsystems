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
  P2: ["dashboard", "email"], // Fixed: removed SMS (was incorrectly included)
  P3: ["dashboard"],
  P4: ["log"],
  P5: ["log"],
};

export interface AlertNotificationSender {
  send(notification: AlertNotification, alert: AnalyticsAlert): Promise<{
    providerId: string; deliveryStatus?: "sent" | "delivered";
  }>;
}
export interface BatchAlertNotificationSender extends AlertNotificationSender {
  sendBatch(items: Array<{ notification: AlertNotification; alert: AnalyticsAlert }>): Promise<Map<string, {
    providerId: string; deliveryStatus?: "sent" | "delivered";
  }>>;
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
  const now = Date.now();
  const targets = channels.flatMap((channel) => recipientsFor(channel, rule?.recipients ?? [], policy)
    .map((recipient, sequence) => ({ tenantId: alert.tenantId, alertId: alert.id, channel, recipient,
      ...(channel === "voice" ? {
        nextAttemptAt: new Date(now + sequence * (policy.escalationAfterSeconds.P1 ?? 30) * 1_000).toISOString(),
        voiceCall: { provider: "webhook" as const, sequence, status: "queued",
          events: [{ status: "queued", occurredAt: new Date(now).toISOString() }] },
      } : {}), ...(channel === "sms" ? { smsDelivery: { provider: "webhook" as const, status: "queued",
        template: alert.severity, events: [{ status: "queued", occurredAt: new Date(now).toISOString() }] } } : {}),
    })));
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
      const processed = new Set<string>();
      for (const notification of notifications) {
        if (processed.has(notification.id)) continue;
        const alert = await this.store.getAnalyticsAlert(notification.alertId, notification.tenantId);
        if (!alert) {
          await this.store.completeAlertNotification(notification.id, { status: "dead", error: "alert_not_found" });
          continue;
        }
        if (notification.channel === "sms" && isBatchSender(this.sender)) {
          const batch = notifications.filter((item) => !processed.has(item.id) && item.channel === "sms" &&
            item.tenantId === notification.tenantId && item.alertId === notification.alertId);
          const allowed = await this.reserveSmsSlots(notification.tenantId, batch.length);
          const sendable = batch.slice(0, allowed);
          const deferred = batch.slice(allowed);
          for (const item of deferred) {
            processed.add(item.id);
            await this.store.completeAlertNotification(item.id, { status: "failed", error: "sms_rate_limit_exceeded",
              nextAttemptAt: new Date(Date.now() + 60_000).toISOString() });
          }
          try {
            const items = (await Promise.all(sendable.map(async (item) => ({ notification: item,
              alert: await this.store.getAnalyticsAlert(item.alertId, item.tenantId) })))).filter((item): item is {
                notification: AlertNotification; alert: AnalyticsAlert;
              } => Boolean(item.alert));
            const results = await this.sender.sendBatch(items);
            if (items.some((item) => !results.has(item.notification.id))) throw new Error("sms_batch_result_missing");
            for (const item of items) {
              const result = results.get(item.notification.id)!;
              await this.store.completeAlertNotification(item.notification.id, {
                status: result.deliveryStatus ?? "delivered", providerId: result.providerId,
              });
            }
          } catch (error) {
            for (const item of sendable) await this.fail(item, error);
          }
          for (const item of batch) { processed.add(item.id); this.publish(item); }
          completed += batch.length;
          continue;
        }
        if (notification.channel === "voice" && !["new", "escalated"].includes(alert.status)) {
          await this.store.completeAlertNotification(notification.id, { status: "cancelled", error: "alert_already_acknowledged" });
          continue;
        }
        try {
          const result = await this.sender.send(notification, alert);
          await this.store.completeAlertNotification(notification.id, {
            status: result.deliveryStatus ?? "delivered", providerId: result.providerId,
          });
        } catch (error) {
          await this.fail(notification, error);
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

  private async reserveSmsSlots(tenantId: string, requested: number) {
    const policy = await this.store.getAlertNotificationPolicy(tenantId);
    return this.store.reserveSmsRateLimit(tenantId, policy.rateLimitPerMinute, requested, new Date().toISOString());
  }

  private async fail(notification: AlertNotification, error: unknown) {
    const dead = notification.attempts >= 5;
    await this.store.completeAlertNotification(notification.id, { status: dead ? "dead" : "failed",
      error: error instanceof Error ? error.message : "notification_failed",
      ...(!dead ? { nextAttemptAt: new Date(Date.now() + Math.min(300, 2 ** notification.attempts * 5) * 1_000).toISOString() } : {}) });
  }

  private publish(notification: AlertNotification) {
    alertEvents.publish({ id: randomUUID(), tenantId: notification.tenantId, type: "notification.updated",
      occurredAt: new Date().toISOString(), alertId: notification.alertId });
  }
}

function isBatchSender(sender: AlertNotificationSender): sender is BatchAlertNotificationSender {
  return typeof (sender as Partial<BatchAlertNotificationSender>).sendBatch === "function";
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
