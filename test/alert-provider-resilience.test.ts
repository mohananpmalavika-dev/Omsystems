import { describe, expect, it, vi } from "vitest";
import { configuredAlertEmailTargets } from "../src/app.js";
import {
  AlertNotificationDispatcher,
  ProviderFailoverAlertNotificationSender,
  type AlertNotificationSender,
} from "../src/alerts/notification-dispatcher.js";
import type { AlertNotification, AnalyticsAlert } from "../src/domain/models.js";
import { MemoryStore } from "../src/store.js";

async function createAlert(store: MemoryStore): Promise<AnalyticsAlert> {
  await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
    name: "Provider resilience", detectionType: "vehicle", enabled: true,
    objectClasses: [], minConfidence: 0.5, minDurationSeconds: 0, direction: "any",
    severity: "P2", cooldownSeconds: 0, recipients: [], recordingPolicy: "none",
    preRollSeconds: 30, postRollSeconds: 120,
  });
  const result = await store.processAnalyticsEvent({
    tenantId: "omsystems", cameraId: "cam-001", sourceEventId: `provider-${crypto.randomUUID()}`,
    detectionType: "vehicle", occurredAt: new Date().toISOString(), confidence: 0.95,
    durationSeconds: 2, modelVersion: "provider-test", objects: [],
  });
  return result.alerts[0]!;
}

async function enqueueEmail(store: MemoryStore, alert: AnalyticsAlert): Promise<AlertNotification> {
  const [notification] = await store.enqueueAlertNotifications([{
    tenantId: alert.tenantId, alertId: alert.id, channel: "email", recipient: "soc@example.com",
    emailDelivery: {
      provider: "webhook", status: "queued", subject: "queued",
      events: [{ status: "queued", occurredAt: new Date().toISOString() }],
    },
  }]);
  return notification!;
}

describe("alert provider resilience", () => {
  it("wires SES from alert configuration and records its provider delivery", async () => {
    const store = new MemoryStore();
    const commands: unknown[] = [];
    let selectedRegion = "";
    const targets = configuredAlertEmailTargets(store, {
      ALERT_EMAIL_PROVIDER: "ses",
      ALERT_AWS_REGION: "ap-south-1",
      ALERT_EMAIL_FROM: "alerts@example.com",
    }, {
      createSesClient(region) {
        selectedRegion = region;
        return { async send(command: unknown) { commands.push(command); return { MessageId: "ses-message-1" }; } };
      },
    });
    const alert = await createAlert(store);
    const notification = await enqueueEmail(store, alert);

    const result = await targets[0]!.sender.send(notification, alert);

    expect(selectedRegion).toBe("ap-south-1");
    expect(targets[0]!.name).toBe("ses");
    expect(result).toEqual({ providerId: "ses-message-1", deliveryStatus: "sent" });
    expect((commands[0] as { input: Record<string, unknown> }).input).toMatchObject({
      Source: "alerts@example.com",
      Destination: { ToAddresses: ["soc@example.com"] },
    });
    expect(store.analyticsNotifications[0]?.emailDelivery).toMatchObject({
      provider: "ses", status: "sent",
    });
  });

  it("fails fast when SES region or sender identity is missing", () => {
    const store = new MemoryStore();
    expect(() => configuredAlertEmailTargets(store, {
      ALERT_EMAIL_PROVIDER: "ses", ALERT_EMAIL_FROM: "alerts@example.com",
    })).toThrow("ALERT_AWS_REGION or AWS_REGION is required");
    expect(() => configuredAlertEmailTargets(store, {
      ALERT_EMAIL_PROVIDER: "ses", ALERT_AWS_REGION: "ap-south-1",
    })).toThrow("ALERT_EMAIL_FROM is required");
  });

  it("hands delivery to the configured fallback and retains the failed-provider audit", async () => {
    const store = new MemoryStore();
    const alert = await createAlert(store);
    const notification = await enqueueEmail(store, alert);
    const primary = vi.fn().mockRejectedValue(new Error("sendgrid_unavailable"));
    const fallback = vi.fn().mockResolvedValue({ providerId: "ses-fallback-1", deliveryStatus: "sent" as const });
    const sender = new ProviderFailoverAlertNotificationSender(store, [
      { name: "sendgrid", sender: { send: primary } },
      { name: "ses", sender: { send: fallback } },
    ]);

    await expect(sender.send(notification, alert)).resolves.toEqual({
      providerId: "ses-fallback-1", deliveryStatus: "sent",
    });
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
    expect(store.analyticsNotifications[0]?.emailDelivery?.events).toContainEqual(expect.objectContaining({
      status: "provider_failed", detail: "sendgrid: sendgrid_unavailable",
    }));
  });

  it("starts with the secondary provider after an asynchronous primary receipt failure", async () => {
    const store = new MemoryStore();
    const alert = await createAlert(store);
    const notification = await enqueueEmail(store, alert);
    notification.lastError = "email_bounced";
    notification.emailDelivery!.provider = "sendgrid";
    const primary = vi.fn().mockResolvedValue({ providerId: "sendgrid-retry" });
    const fallback = vi.fn().mockResolvedValue({ providerId: "ses-after-bounce", deliveryStatus: "sent" as const });
    const sender = new ProviderFailoverAlertNotificationSender(store, [
      { name: "sendgrid", sender: { send: primary } },
      { name: "ses", sender: { send: fallback } },
    ]);

    await expect(sender.send(notification, alert)).resolves.toMatchObject({ providerId: "ses-after-bounce" });
    expect(fallback).toHaveBeenCalledOnce();
    expect(primary).not.toHaveBeenCalled();
  });

  it("emits a dead-letter audit event after the final retry", async () => {
    const store = new MemoryStore();
    const alert = await createAlert(store);
    const notification = await enqueueEmail(store, alert);
    store.analyticsNotifications[0]!.attempts = 4;
    const failingSender: AlertNotificationSender = {
      async send() { throw new Error("all_email_providers_unavailable"); },
    };
    const dispatcher = new AlertNotificationDispatcher(store, failingSender);

    await dispatcher.drainOnce();

    expect(store.analyticsNotifications[0]).toMatchObject({
      id: notification.id, status: "dead", attempts: 5,
      lastError: "all_email_providers_unavailable",
    });
    expect(store.auditEvents).toContainEqual(expect.objectContaining({
      action: "alert.notification_dead_letter", outcome: "failure",
      details: expect.objectContaining({
        notificationId: notification.id, alertId: alert.id, channel: "email", attempts: 5,
      }),
    }));
  });
});
