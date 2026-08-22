/**
 * System Audit Log Notification Provider (SIEM Integration)
 */

import type {
  NotificationJob,
  ProviderSendResult,
  ProviderHealth,
} from "../../domain/notification.types.js";
import type { NotificationProvider } from "./notification-provider.interface.js";

export class SystemLogNotificationProvider implements NotificationProvider {
  readonly channel = "system_log" as const;

  async send(job: NotificationJob): Promise<ProviderSendResult> {
    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // In production, outputs to ELK/SIEM or central audit log
    return {
      accepted: true,
      provider: "siem-audit-log",
      providerMessageId: logId,
      state: "DELIVERED",
      metadata: {
        destination: job.destination,
        loggedAt: new Date().toISOString(),
      },
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: "siem-audit-log",
      channel: this.channel,
      status: "HEALTHY",
      latencyMs: 0.5,
      consecutiveFailures: 0,
      observedAt: new Date(),
    };
  }
}
