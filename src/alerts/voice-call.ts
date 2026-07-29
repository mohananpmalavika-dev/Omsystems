import { createHmac, timingSafeEqual } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AlertNotification, AnalyticsAlert } from "../domain/models.js";
import type { AlertNotificationSender, BatchAlertNotificationSender } from "./notification-dispatcher.js";

export interface VoiceCallProvider {
  readonly name: "twilio" | "exotel" | "webhook" | "test";
  placeCall(input: { to: string; messageUrl: string; statusUrl: string; recordingUrl: string }): Promise<{ id: string }>;
}

export type VoiceCallbackClaims = {
  notificationId: string; alertId: string; tenantId: string; expiresAt: number;
};

export class VoiceCallbackTokens {
  constructor(private readonly secret: string) {}

  sign(claims: Omit<VoiceCallbackClaims, "expiresAt">, ttlSeconds = 86_400) {
    const payload = Buffer.from(JSON.stringify({ ...claims, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
    return `${payload}.${createHmac("sha256", this.secret).update(payload).digest("base64url")}`;
  }

  verify(token: string): VoiceCallbackClaims | undefined {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return undefined;
    const expected = createHmac("sha256", this.secret).update(payload).digest("base64url");
    const left = Buffer.from(signature); const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return undefined;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VoiceCallbackClaims;
      return claims.expiresAt >= Math.floor(Date.now() / 1000) ? claims : undefined;
    } catch { return undefined; }
  }
}

export class VoiceCallNotificationSender implements AlertNotificationSender {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly provider: VoiceCallProvider,
    private readonly publicBaseUrl: string,
    private readonly tokens: VoiceCallbackTokens,
  ) {}

  async send(notification: AlertNotification, alert: AnalyticsAlert) {
    if (notification.channel !== "voice") throw new Error("voice_sender_channel_mismatch");
    if (notification.recipient === "unconfigured") throw new Error("voice_recipient_unconfigured");
    if (!this.publicBaseUrl) throw new Error("alert_public_base_url_unconfigured");
    const token = this.tokens.sign({ notificationId: notification.id, alertId: alert.id,
      tenantId: alert.tenantId });
    const base = `${this.publicBaseUrl.replace(/\/$/, "")}/internal/alerts/voice`;
    const result = await this.provider.placeCall({
      to: notification.recipient, messageUrl: `${base}/ivr?token=${encodeURIComponent(token)}`,
      statusUrl: `${base}/status?token=${encodeURIComponent(token)}`,
      recordingUrl: `${base}/recording?token=${encodeURIComponent(token)}`,
    });
    await this.store.recordVoiceCallEvent(notification.id, {
      status: "initiated", occurredAt: new Date().toISOString(), providerId: result.id,
      provider: this.provider.name, detail: `${this.provider.name} accepted outbound call`,
    });
    return { providerId: result.id, deliveryStatus: "sent" as const };
  }
}

export class RoutedAlertNotificationSender implements BatchAlertNotificationSender {
  constructor(private readonly standard: AlertNotificationSender, private readonly voice: AlertNotificationSender,
    private readonly sms?: AlertNotificationSender, private readonly email?: AlertNotificationSender) {}
  send(notification: AlertNotification, alert: AnalyticsAlert) {
    if (notification.channel === "voice") return this.voice.send(notification, alert);
    if (notification.channel === "sms" && this.sms) return this.sms.send(notification, alert);
    if (notification.channel === "email" && this.email) return this.email.send(notification, alert);
    return this.standard.send(notification, alert);
  }
  async sendBatch(items: Array<{ notification: AlertNotification; alert: AnalyticsAlert }>) {
    const allSms = items.every((item) => item.notification.channel === "sms") && this.sms;
    const allEmail = items.every((item) => item.notification.channel === "email") && this.email;
    const target = allSms ? this.sms : allEmail ? this.email : this.standard;
    const batch = target as Partial<BatchAlertNotificationSender>;
    if (typeof batch.sendBatch === "function") return batch.sendBatch(items);
    return new Map(await Promise.all(items.map(async (item) => [item.notification.id,
      await this.send(item.notification, item.alert)] as const)));
  }
}

export class TwilioVoiceProvider implements VoiceCallProvider {
  readonly name = "twilio" as const;
  constructor(private readonly accountSid: string, private readonly authToken: string, private readonly from: string,
    private readonly fetcher: typeof fetch = fetch) {}
  async placeCall(input: { to: string; messageUrl: string; statusUrl: string; recordingUrl: string }) {
    const form = new URLSearchParams({ To: input.to, From: this.from, Url: input.messageUrl, Method: "GET",
      StatusCallback: input.statusUrl, StatusCallbackMethod: "GET",
      Record: "true",
      RecordingStatusCallback: input.recordingUrl, RecordingStatusCallbackMethod: "GET" });
    for (const event of ["initiated", "ringing", "answered", "completed"]) form.append("StatusCallbackEvent", event);
    const response = await this.fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Calls.json`, {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded" }, body: form,
    });
    if (!response.ok) throw new Error(`twilio_voice_http_${response.status}`);
    const body = await response.json() as { sid?: string };
    if (!body.sid) throw new Error("twilio_voice_missing_call_sid");
    return { id: body.sid };
  }
}

export class ExotelVoiceProvider implements VoiceCallProvider {
  readonly name = "exotel" as const;
  constructor(private readonly accountSid: string, private readonly apiKey: string, private readonly apiToken: string,
    private readonly callerId: string, private readonly subdomain = "api.exotel.com", private readonly fetcher: typeof fetch = fetch) {}
  async placeCall(input: { to: string; messageUrl: string; statusUrl: string; recordingUrl: string }) {
    const form = new URLSearchParams({ From: input.to, To: this.callerId, CallerId: this.callerId,
      Url: input.messageUrl, StatusCallback: input.statusUrl, Recording: "true", RecordingStatusCallback: input.recordingUrl });
    const response = await this.fetcher(`https://${this.subdomain}/v1/Accounts/${encodeURIComponent(this.accountSid)}/Calls/connect.json`, {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded" }, body: form,
    });
    if (!response.ok) throw new Error(`exotel_voice_http_${response.status}`);
    const body = await response.json() as any;
    const id = body?.Call?.Sid ?? body?.call?.sid ?? body?.sid;
    if (!id) throw new Error("exotel_voice_missing_call_sid");
    return { id: String(id) };
  }
}

export function voiceAlertMessage(alert: AnalyticsAlert, branchName?: string) {
  return `Critical surveillance alert. Branch ${branchName ?? "unknown"}. ${alert.title}. Severity ${alert.severity}. Press 1 to acknowledge. Press 2 to repeat.`;
}

export function twiml(message: string, actionUrl: string) {
  const escaped = message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const url = actionUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="1" action="${url}" method="GET" timeout="8"><Say>${escaped}</Say></Gather><Redirect method="GET">${url}${url.includes("?") ? "&amp;" : "?"}Digits=2</Redirect></Response>`;
}
