/**
 * Push Notification Provider
 */

import type {
  NotificationJob,
  ProviderSendResult,
  ProviderHealth,
} from "../../domain/notification.types.js";
import type { NotificationProvider } from "./notification-provider.interface.js";

export class PushNotificationProvider implements NotificationProvider {
  readonly channel = "push" as const;

  async send(job: NotificationJob): Promise<ProviderSendResult> {
    return {
      accepted: true,
      provider: "web-push",
      providerMessageId: `push-${Date.now()}`,
      state: "DELIVERED",
      metadata: {
        to: job.destination,
        title: job.payload.subject,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: "web-push",
      channel: this.channel,
      status: "HEALTHY",
      latencyMs: 8.7,
      consecutiveFailures: 0,
      observedAt: new Date(),
    };
  }
}
