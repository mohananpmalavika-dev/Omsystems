/**
 * SMS Notification Provider (Twilio / Karix / Gupshup / SMPP Gateway)
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

export type SmsGateway = "twilio" | "karix" | "gupshup" | "smpp" | "gsm-gateway";

export interface SmsProviderConfig {
  gateway?: SmsGateway;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  karixApiKey?: string;
  karixSenderId?: string;
  gupshupApiKey?: string;
  gupshupAppName?: string;
  smppHost?: string;
  smppPort?: number;
  smppSystemId?: string;
  smppPassword?: string;
}

export class SmsNotificationProvider implements NotificationProvider {
  readonly channel = "sms" as const;
  private readonly config: SmsProviderConfig;

  constructor(config?: SmsProviderConfig) {
    this.config = config || {
      gateway: (process.env.SMS_GATEWAY as SmsGateway) || undefined,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
      karixApiKey: process.env.KARIX_API_KEY,
      karixSenderId: process.env.KARIX_SENDER_ID,
      gupshupApiKey: process.env.GUPSHUP_API_KEY,
      gupshupAppName: process.env.GUPSHUP_APP_NAME,
      smppHost: process.env.SMPP_HOST,
      smppPort: process.env.SMPP_PORT ? Number(process.env.SMPP_PORT) : undefined,
      smppSystemId: process.env.SMPP_SYSTEM_ID,
      smppPassword: process.env.SMPP_PASSWORD,
    };
  }

  private isConfigured(): boolean {
    if (this.config.twilioAccountSid && this.config.twilioAuthToken && this.config.twilioFromNumber) {
      return true;
    }
    if (this.config.karixApiKey && this.config.karixSenderId) {
      return true;
    }
    if (this.config.gupshupApiKey && this.config.gupshupAppName) {
      return true;
    }
    if (this.config.smppHost && this.config.smppSystemId && this.config.smppPassword) {
      return true;
    }
    return false;
  }

  async send(job: NotificationJob): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      return {
        accepted: false,
        provider: "sms-gateway",
        state: "FAILED",
        error: "PROVIDER_NOT_CONFIGURED",
        metadata: {
          reason: "No SMS gateway credentials configured (Twilio, Karix, Gupshup, or SMPP required)",
          destination: job.destination,
        },
      };
    }

    const gateway = this.config.gateway || (this.config.twilioAccountSid ? "twilio" : this.config.karixApiKey ? "karix" : "gupshup");

    if (gateway === "twilio") {
      return this.sendTwilio(job);
    } else if (gateway === "karix") {
      return this.sendKarix(job);
    } else if (gateway === "gupshup") {
      return this.sendGupshup(job);
    }

    return {
      accepted: false,
      provider: gateway,
      state: "FAILED",
      error: "UNSUPPORTED_SMS_GATEWAY",
    };
  }

  private async sendTwilio(job: NotificationJob): Promise<ProviderSendResult> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: job.destination,
        From: this.config.twilioFromNumber!,
        Body: job.payload.text,
      });

      const auth = Buffer.from(`${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`).toString("base64");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          accepted: false,
          provider: "twilio",
          state: "FAILED",
          error: `TWILIO_ERROR_${res.status}: ${errText}`,
        };
      }

      const json = (await res.json()) as { sid?: string; status?: string };
      return {
        accepted: true,
        provider: "twilio",
        providerMessageId: json.sid || `sms-${Date.now()}`,
        state: json.status === "delivered" ? "DELIVERED" : "SENT",
        metadata: { to: job.destination, gateway: "twilio" },
      };
    } catch (err: any) {
      return {
        accepted: false,
        provider: "twilio",
        state: "FAILED",
        error: err?.message || "TWILIO_SEND_FAILED",
      };
    }
  }

  private async sendKarix(job: NotificationJob): Promise<ProviderSendResult> {
    // Karix enterprise SMS API for Indian banks
    try {
      const res = await fetch("https://api.karix.io/v1/message", {
        method: "POST",
        headers: {
          Authentication: `Bearer ${this.config.karixApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: this.config.karixSenderId,
          destination: [job.destination],
          content: { text: job.payload.text },
        }),
      });

      if (!res.ok) {
        return {
          accepted: false,
          provider: "karix",
          state: "FAILED",
          error: `KARIX_HTTP_${res.status}`,
        };
      }

      const json = (await res.json()) as { message_id?: string };
      return {
        accepted: true,
        provider: "karix",
        providerMessageId: json.message_id || `karix-${Date.now()}`,
        state: "SENT",
        metadata: { to: job.destination, gateway: "karix" },
      };
    } catch (err: any) {
      return {
        accepted: false,
        provider: "karix",
        state: "FAILED",
        error: err?.message || "KARIX_SEND_FAILED",
      };
    }
  }

  private async sendGupshup(job: NotificationJob): Promise<ProviderSendResult> {
    // Gupshup Enterprise SMS API
    try {
      const url = `https://enterprise.smsgupshup.com/GatewayAuth?method=sendMessage&send_to=${encodeURIComponent(
        job.destination
      )}&msg=${encodeURIComponent(job.payload.text)}&userid=${encodeURIComponent(
        this.config.gupshupAppName || ""
      )}&password=${encodeURIComponent(this.config.gupshupApiKey || "")}&v=1.1&msg_type=TEXT&auth_scheme=plain`;

      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || text.includes("error")) {
        return {
          accepted: false,
          provider: "gupshup",
          state: "FAILED",
          error: `GUPSHUP_ERROR: ${text}`,
        };
      }

      return {
        accepted: true,
        provider: "gupshup",
        providerMessageId: `gs-${Date.now()}`,
        state: "SENT",
        metadata: { to: job.destination, gateway: "gupshup" },
      };
    } catch (err: any) {
      return {
        accepted: false,
        provider: "gupshup",
        state: "FAILED",
        error: err?.message || "GUPSHUP_SEND_FAILED",
      };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const configured = this.isConfigured();
    return {
      provider: this.config.gateway || "sms-gateway",
      channel: this.channel,
      status: configured ? "HEALTHY" : "UNAVAILABLE",
      healthy: configured,
      lastCheckedAt: new Date(),
      error: configured ? undefined : "PROVIDER_NOT_CONFIGURED",
    };
  }
}
