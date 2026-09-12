import { describe, it, expect, beforeEach } from "vitest";
import { PostgresNotificationOutbox } from "../../src/notifications/infrastructure/outbox/postgres-notification-outbox.js";
import { PushNotificationProvider } from "../../src/notifications/infrastructure/providers/push.provider.js";
import { SmsNotificationProvider } from "../../src/notifications/infrastructure/providers/sms.provider.js";
import { SmtpEmailProvider } from "../../src/notifications/infrastructure/providers/smtp-email.provider.js";
import { RecipientResolver } from "../../src/notifications/application/recipient-resolver.js";
import { OrganizationalDirectoryService } from "../../src/notifications/application/organizational-directory.service.js";
import { UserDirectoryService } from "../../src/notifications/application/user-directory.service.js";

describe("Durable Notification Platform & Providers", () => {
  let outbox: PostgresNotificationOutbox;

  beforeEach(() => {
    outbox = new PostgresNotificationOutbox(); // Standalone / test mode
  });

  it("enqueues jobs and enforces idempotency", async () => {
    const job1 = await outbox.enqueue({
      tenantId: "tenant-bank-1",
      alertId: "alert-101",
      channel: "sms",
      priority: "P1",
      destination: "+919876543210",
      payload: { text: "Critical Vault Alarm" },
      maxAttempts: 3,
      idempotencyKey: "idemp-key-alert-101-sms",
    });

    expect(job1.id).toBeDefined();
    expect(job1.status).toBe("PENDING");

    // Second enqueue with same key must return existing job
    const job2 = await outbox.enqueue({
      tenantId: "tenant-bank-1",
      alertId: "alert-101",
      channel: "sms",
      priority: "P1",
      destination: "+919876543210",
      payload: { text: "Critical Vault Alarm Duplicate" },
      maxAttempts: 3,
      idempotencyKey: "idemp-key-alert-101-sms",
    });

    expect(job2.id).toBe(job1.id);
  });

  it("claims pending jobs and updates state machine transitions", async () => {
    const job = await outbox.enqueue({
      tenantId: "tenant-bank-1",
      alertId: "alert-202",
      channel: "email",
      priority: "P1",
      destination: "security@bank.internal",
      payload: { text: "ATM Tamper" },
      maxAttempts: 2,
      idempotencyKey: "idemp-alert-202-email",
    });

    const claimed = await outbox.claimPending(10);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed[0].id).toBe(job.id);
    expect(claimed[0].status).toBe("PROCESSING");

    // Mark sent
    const sent = await outbox.markSent(job.id, {
      accepted: true,
      provider: "smtp-relay",
      providerMessageId: "msg-12345",
      state: "SENT",
    });

    expect(sent?.status).toBe("SENT");
    expect(sent?.provider).toBe("smtp-relay");
  });

  it("transitions to DEAD_LETTER when max attempts exceeded", async () => {
    const job = await outbox.enqueue({
      tenantId: "tenant-bank-1",
      alertId: "alert-303",
      channel: "push",
      priority: "P1",
      destination: "fcm:token123",
      payload: { text: "Intrusion" },
      maxAttempts: 1,
      idempotencyKey: "idemp-alert-303-push",
    });

    // Mark failed without retry (or max attempts reached)
    const failed = await outbox.markFailedOrRetry(job.id, "Gateway timeout", undefined);
    expect(failed?.status).toBe("DEAD_LETTER");
    expect(failed?.lastError).toBe("Gateway timeout");
  });

  it("acknowledges and cancels pending notifications upon alert resolution", async () => {
    await outbox.enqueue({
      tenantId: "tenant-bank-1",
      alertId: "alert-404",
      channel: "sms",
      priority: "P2",
      destination: "+919999999999",
      payload: { text: "Cash counter unattended" },
      maxAttempts: 3,
      idempotencyKey: "idemp-alert-404-sms",
    });

    const cancelledCount = await outbox.cancelPendingForAlert("alert-404", "Operator acknowledged in UI");
    expect(cancelledCount).toBe(1);

    const checkJob = (await outbox.getJobsByAlert("alert-404"))[0];
    expect(checkJob.status).toBe("CANCELLED");
    expect(checkJob.cancelReason).toBe("Operator acknowledged in UI");
  });

  it("rejects simulated success and returns PROVIDER_NOT_CONFIGURED when unconfigured", async () => {
    // Empty configs
    const pushProvider = new PushNotificationProvider({});
    const smsProvider = new SmsNotificationProvider({});
    const emailProvider = new SmtpEmailProvider({});

    const mockJob: any = {
      id: "job-test",
      tenantId: "tenant-1",
      alertId: "alert-1",
      destination: "any-dest",
      priority: "P1",
      payload: { text: "Alert text" },
    };

    const pushRes = await pushProvider.send(mockJob);
    expect(pushRes.accepted).toBe(false);
    expect(pushRes.error).toBe("PROVIDER_NOT_CONFIGURED");

    const smsRes = await smsProvider.send(mockJob);
    expect(smsRes.accepted).toBe(false);
    expect(smsRes.error).toBe("PROVIDER_NOT_CONFIGURED");

    const emailRes = await emailProvider.send(mockJob);
    expect(emailRes.accepted).toBe(false);
    expect(emailRes.error).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("resolves shift and on-call recipients truthfully", async () => {
    const orgDir = new OrganizationalDirectoryService();
    const userDir = new UserDirectoryService();
    const resolver = new RecipientResolver(orgDir, userDir);

    const now = new Date();
    const result = await resolver.resolveComprehensive({
      context: {
        tenantId: "tenant-bank-01",
        alertId: "alert-p1-intrusion",
        branchId: "branch-thrissur-14",
        priority: "P1",
        alertType: "INTRUSION",
        occurredAt: now,
        escalationLevel: 1,
      },
      selectors: [
        { type: "BRANCH_ROLE", role: "BRANCH_MANAGER" },
        { type: "TENANT_ROLE", role: "HO_OPERATOR" },
        { type: "ON_CALL", scheduleKey: "SURVEILLANCE_AFTER_HOURS" },
      ],
      requiredChannels: ["sms", "email"],
    });

    expect(result.recipients.length).toBeGreaterThan(0);
    const roles = result.recipients.flatMap((r) => r.reasons);
    expect(roles).toContain("BRANCH_MANAGER");
    expect(roles).toContain("HO_OPERATOR");
  });
});
