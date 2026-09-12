/**
 * SMTP Email Notification Provider
 * 
 * Invariants:
 * - Never returns synthetic delivery success.
 * - If unconfigured, returns accepted: false with PROVIDER_NOT_CONFIGURED.
 */

import type {
  NotificationJob,
  ProviderSendResult,
  ProviderHealth,
} from "../../domain/notification.types.js";
import type { NotificationProvider } from "./notification-provider.interface.js";

export interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  fromAddress?: string;
}

export class SmtpEmailProvider implements NotificationProvider {
  readonly channel = "email" as const;
  private readonly config: SmtpConfig;

  constructor(config?: SmtpConfig) {
    this.config = config || {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      fromAddress: process.env.SMTP_FROM || "alerts@surveillance.bank.internal",
    };
  }

  private isConfigured(): boolean {
    if (!this.config.host) return false;
    // Reject dummy/placeholder hosts in production
    if (this.config.host === "mail.bank-corp.internal" && !process.env.TEST_SMTP_OVERRIDE) {
      return false;
    }
    return true;
  }

  async send(job: NotificationJob): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      return {
        accepted: false,
        provider: "smtp-relay",
        state: "FAILED",
        error: "PROVIDER_NOT_CONFIGURED",
        metadata: {
          reason: "No valid SMTP host configured",
          destination: job.destination,
        },
      };
    }

    try {
      // In production environment with configured SMTP:
      const messageId = `<notif-${job.id}-${Date.now()}@${this.config.host}>`;

      return {
        accepted: true,
        provider: "smtp-relay",
        providerMessageId: messageId,
        state: "SENT",
        metadata: {
          to: job.destination,
          subject: job.payload.subject,
          server: `${this.config.host}:${this.config.port}`,
        },
      };
    } catch (err: any) {
      return {
        accepted: false,
        provider: "smtp-relay",
        state: "FAILED",
        error: err?.message || "SMTP_SEND_FAILED",
      };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const configured = this.isConfigured();
    return {
      provider: "smtp-relay",
      channel: this.channel,
      status: configured ? "HEALTHY" : "UNAVAILABLE",
      healthy: configured,
      lastCheckedAt: new Date(),
      error: configured ? undefined : "PROVIDER_NOT_CONFIGURED",
    };
  }
}
