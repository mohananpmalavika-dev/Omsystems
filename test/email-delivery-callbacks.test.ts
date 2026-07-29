import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { VoiceCallbackTokens } from "../src/alerts/voice-call.js";

describe("Email delivery callbacks and audit history", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("records delivery and bounce events through the email callback endpoint", async () => {
    const store = new MemoryStore();
    const secret = "email-callback-secret";
    app = await buildApp({ store, voiceCallbackSecret: secret, alertNotificationSender: {
      async send(notification) {
        return { providerId: `fake-${notification.id}` };
      },
    }});

    const [notification] = await store.enqueueAlertNotifications([{ tenantId: "omsystems",
      alertId: crypto.randomUUID(), channel: "email", recipient: "user@example.com",
      emailDelivery: { provider: "smtp", status: "queued", subject: "P2 alert: test", events: [] } }]);
    const token = new VoiceCallbackTokens(secret).sign({ notificationId: notification!.id,
      alertId: notification!.alertId, tenantId: notification!.tenantId });

    const delivered = await app.inject({ method: "POST",
      url: `/internal/alerts/email/status?token=${encodeURIComponent(token)}`,
      payload: { status: "delivered", MessageId: "MSG123", subject: "P2 alert: test" },
    });
    expect(delivered.statusCode).toBe(200);
    expect(store.analyticsNotifications[0]).toMatchObject({ status: "delivered", providerId: "MSG123",
      emailDelivery: { status: "delivered", provider: "webhook", subject: "P2 alert: test" } });

    const bounced = await app.inject({ method: "POST",
      url: `/internal/alerts/email/status?token=${encodeURIComponent(token)}`,
      payload: { status: "bounced", MessageId: "MSG123", subject: "P2 alert: test" },
    });
    expect(bounced.statusCode).toBe(200);
    expect(store.analyticsNotifications[0]).toMatchObject({ status: "failed", lastError: "email_bounced",
      emailDelivery: { status: "bounced", provider: "webhook" } });
  });
});
