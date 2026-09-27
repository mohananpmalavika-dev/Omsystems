/**
 * Voice Notification Provider
 * 
 * Supports on-premise Asterisk PBX / SIP Trunk / GSM gateway calling
 * and wraps Twilio / Exotel / Webhook transports with signed IVR callbacks.
 */

import type {
  NotificationJob,
  ProviderSendResult,
  ProviderHealth,
} from "../../domain/notification.types.js";
import type { NotificationProvider } from "./notification-provider.interface.js";
import { VoiceCallbackTokens } from "../../../alerts/voice-call.js";
import { randomBytes } from "node:crypto";

export interface VoiceTransport {
  name: "asterisk" | "twilio" | "exotel" | "webhook" | "test";
  placeCall(input: {
    to: string;
    spokenText: string;
    messageUrl: string;
    statusUrl: string;
    recordingUrl: string;
  }): Promise<{ id: string }>;
  healthCheck?(): Promise<ProviderHealth>;
}

export class VoiceNotificationProvider implements NotificationProvider {
  readonly channel = "voice" as const;
  private readonly tokens: VoiceCallbackTokens;

  constructor(
    private readonly transport?: VoiceTransport,
    private readonly publicBaseUrl = process.env.PUBLIC_BASE_URL || "",
    tokenSecret = process.env.VOICE_TOKEN_SECRET
  ) {
    if (transport && process.env.NODE_ENV === "production") {
      if (transport.name === "test") throw new Error("production_test_voice_transport_forbidden");
      if (!tokenSecret || !/^https:\/\//i.test(publicBaseUrl)) throw new Error("voice_callback_configuration_required");
    }
    this.tokens = new VoiceCallbackTokens(tokenSecret || randomBytes(32).toString("hex"));
  }

  getTokens(): VoiceCallbackTokens {
    return this.tokens;
  }

  async send(job: NotificationJob): Promise<ProviderSendResult> {
    if (!this.transport || !this.publicBaseUrl) {
      return { accepted: false, state: "FAILED", provider: "voice", error: "PROVIDER_NOT_CONFIGURED" };
    }
    const token = this.tokens.sign({
      notificationId: job.id,
      alertId: job.alertId,
      tenantId: job.tenantId,
    });

    const base = `${this.publicBaseUrl.replace(/\/$/, "")}/api/v1/notifications/voice`;
    const messageUrl = `${base}/ivr?token=${encodeURIComponent(token)}`;
    const statusUrl = `${base}/status?token=${encodeURIComponent(token)}`;
    const recordingUrl = `${base}/recording?token=${encodeURIComponent(token)}`;

    const spokenText = job.payload.voiceText || job.payload.text;

    const callResult = await this.transport.placeCall({
      to: job.destination,
      spokenText,
      messageUrl,
      statusUrl,
      recordingUrl,
    });
    if (!callResult.id) throw new Error("voice_provider_receipt_missing");

    return {
      accepted: true,
      provider: `voice-${this.transport.name}`,
      providerMessageId: callResult.id,
      state: "SENT",
      metadata: {
        to: job.destination,
        callId: callResult.id,
        spokenTextLength: spokenText.length,
        ivrAcknowledgeDigit: "1",
        ivrRepeatDigit: "2",
      },
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (this.transport?.healthCheck && this.publicBaseUrl) return this.transport.healthCheck();
    return {
      provider: this.transport ? `voice-${this.transport.name}` : "voice",
      channel: this.channel,
      status: this.transport && this.publicBaseUrl ? "DEGRADED" : "UNAVAILABLE",
      error: this.transport && this.publicBaseUrl ? "PROVIDER_HEALTH_UNVERIFIED" : "PROVIDER_NOT_CONFIGURED",
      observedAt: new Date(),
    };
  }
}
