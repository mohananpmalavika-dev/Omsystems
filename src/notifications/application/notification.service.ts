/**
 * Centralized Notification Service
 * 
 * Canonical coordinator for all surveillance alert notifications.
 * Evaluates policies, resolves recipients, renders channel templates,
 * enqueues to the durable transactional outbox, and coordinates delivery.
 */

import type {
  NotificationContext,
  NotificationJob,
  NotificationChannel,
  ResolvedRecipient,
} from "../domain/notification.types.js";
import { notificationPolicyEngine, NotificationPolicyEngine } from "./notification-policy-engine.js";
import { recipientResolver, RecipientResolver } from "./recipient-resolver.js";
import { notificationRenderer, NotificationRenderer } from "./notification-renderer.js";
import { notificationOutbox, NotificationOutbox } from "../infrastructure/outbox/notification-outbox.js";
import { notificationWorker, NotificationWorker, CHANNEL_RETRY_POLICIES } from "../infrastructure/worker/notification-worker.js";
import { notificationProviderRegistry } from "../infrastructure/providers/notification-provider.interface.js";
import { DashboardNotificationProvider } from "../infrastructure/providers/dashboard.provider.js";
import { SmtpEmailProvider } from "../infrastructure/providers/smtp-email.provider.js";
import { SmsNotificationProvider } from "../infrastructure/providers/sms.provider.js";
import { VoiceNotificationProvider } from "../infrastructure/providers/voice.provider.js";
import { PushNotificationProvider } from "../infrastructure/providers/push.provider.js";
import { SystemLogNotificationProvider } from "../infrastructure/providers/system-log.provider.js";

export class NotificationService {
  constructor(
    private readonly policyEngine: NotificationPolicyEngine = notificationPolicyEngine,
    private readonly resolver: RecipientResolver = recipientResolver,
    private readonly renderer: NotificationRenderer = notificationRenderer,
    private readonly outbox: NotificationOutbox = notificationOutbox,
    private readonly worker: NotificationWorker = notificationWorker
  ) {
    this.bootstrapProviders();
  }

  private bootstrapProviders() {
    if (!notificationProviderRegistry.has("dashboard")) {
      notificationProviderRegistry.register(new DashboardNotificationProvider());
    }
    if (!notificationProviderRegistry.has("email")) {
      notificationProviderRegistry.register(new SmtpEmailProvider());
    }
    if (!notificationProviderRegistry.has("sms")) {
      notificationProviderRegistry.register(new SmsNotificationProvider());
    }
    if (!notificationProviderRegistry.has("voice")) {
      notificationProviderRegistry.register(new VoiceNotificationProvider());
    }
    if (!notificationProviderRegistry.has("push")) {
      notificationProviderRegistry.register(new PushNotificationProvider());
    }
    if (!notificationProviderRegistry.has("system_log")) {
      notificationProviderRegistry.register(new SystemLogNotificationProvider());
    }
  }

  /**
   * Primary entry point: Emits notifications for a surveillance alert
   */
  async notifyAlert(context: NotificationContext, autoProcess = true): Promise<NotificationJob[]> {
    const policy = this.policyEngine.evaluate(context);
    const createdJobs: NotificationJob[] = [];

    for (const channel of policy.channels) {
      const recipients = await this.resolver.resolve(context, channel);

      for (const recipient of recipients) {
        const destination = this.getDestination(recipient, channel);
        const payload = this.renderer.render(context, channel, recipient);
        const recipientIdentifier = recipient.userId || destination || "unknown";
        const idempotencyKey = `${context.alertId}:${channel}:${recipientIdentifier}`;

        const retryPolicy = CHANNEL_RETRY_POLICIES[channel] || { maxAttempts: 3 };

        const job = await this.outbox.enqueue({
          tenantId: context.tenantId,
          alertId: context.alertId,
          channel,
          priority: context.priority,
          recipientId: recipient.userId,
          recipientName: recipient.name,
          destination,
          payload,
          maxAttempts: retryPolicy.maxAttempts,
          idempotencyKey,
        });

        createdJobs.push(job);
      }
    }

    if (autoProcess) {
      // Process batch asynchronously
      void this.worker.processBatch();
    }

    return createdJobs;
  }

  private getDestination(recipient: ResolvedRecipient, channel: NotificationChannel): string {
    switch (channel) {
      case "email":
        return recipient.email || "alerts@bank-corp.internal";
      case "sms":
      case "voice":
        return recipient.mobile || "+919876543210";
      case "push":
        return recipient.pushTokens?.[0] || recipient.userId || "push-dest";
      case "dashboard":
        return "control-room-websocket";
      case "system_log":
      default:
        return "siem-audit-stream";
    }
  }

  async processOutbox(limit = 50) {
    return this.worker.processBatch(limit);
  }

  getOutbox(): NotificationOutbox {
    return this.outbox;
  }

  getWorker(): NotificationWorker {
    return this.worker;
  }
}

export const notificationService = new NotificationService();
