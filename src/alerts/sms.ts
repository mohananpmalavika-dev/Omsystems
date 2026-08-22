import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AlertNotification, AnalyticsAlert } from "../domain/models.js";
import type { AlertNotificationSender, BatchAlertNotificationSender } from "./notification-dispatcher.js";
import { VoiceCallbackTokens } from "./voice-call.js";

export type SmsProviderName = "msg91" | "textlocal" | "twilio" | "webhook" | "test";
export interface SmsProvider {
  readonly name: SmsProviderName;
  sendBulk(messages: Array<{ to: string; body: string; statusUrl: string; templateId?: string;
    variables: Record<string, string> }>): Promise<Array<{ id: string }>>;
}

const DEFAULT_TEMPLATES = {
  P1: "CRITICAL surveillance alert at {branch}: {title}. Camera {camera}. Time {time}. Alert {alertId}.",
  P2: "HIGH surveillance alert at {branch}: {title}. Camera {camera}. Time {time}. Alert {alertId}.",
} as const;

export class SmsNotificationSender implements AlertNotificationSender, BatchAlertNotificationSender {
  constructor(private readonly store: ControlPlaneStore, private readonly provider: SmsProvider,
    private readonly publicBaseUrl: string, private readonly tokens: VoiceCallbackTokens) {}

  async send(notification: AlertNotification, alert: AnalyticsAlert) {
    const result = await this.sendBatch([{ notification, alert }]);
    return result.get(notification.id)!;
  }

  async sendBatch(items: Array<{ notification: AlertNotification; alert: AnalyticsAlert }>) {
    if (items.some(({ notification }) => notification.channel !== "sms")) throw new Error("sms_sender_channel_mismatch");
    if (items.some(({ notification }) => notification.recipient === "unconfigured")) throw new Error("sms_recipient_unconfigured");
    if (!this.publicBaseUrl) throw new Error("alert_public_base_url_unconfigured");
    const payloads = await Promise.all(items.map(async ({ notification, alert }) => {
      const policy = await this.store.getAlertNotificationPolicy(alert.tenantId);
      const camera = await this.store.getCamera(alert.cameraId);
      const branch = camera ? await this.store.getNode(camera.branchId) : undefined;
      const template = policy.smsTemplates?.[alert.severity as "P1" | "P2"] ??
        DEFAULT_TEMPLATES[alert.severity as "P1" | "P2"] ?? DEFAULT_TEMPLATES.P2;
      const variables = { branch: branch?.name ?? "Unknown branch", severity: alert.severity, title: alert.title,
        camera: camera?.name ?? alert.cameraId, time: alert.firstDetectedAt, alertId: alert.id };
      const token = this.tokens.sign({ notificationId: notification.id, alertId: alert.id, tenantId: alert.tenantId });
      return { to: notification.recipient, body: renderSmsTemplate(template, variables), variables,
        templateId: policy.smsTemplateIds?.[alert.severity as "P1" | "P2"],
        statusUrl: `${this.publicBaseUrl.replace(/\/$/, "")}/internal/alerts/sms/status?token=${encodeURIComponent(token)}` };
    }));
    const sent = await this.provider.sendBulk(payloads);
    if (sent.length !== items.length) throw new Error("sms_provider_result_count_mismatch");
    const results = new Map<string, { providerId: string; deliveryStatus: "sent" }>();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!; const providerResult = sent[index]!;
      await this.store.recordSmsDeliveryEvent(item.notification.id, { status: "accepted",
        occurredAt: new Date().toISOString(), provider: this.provider.name, providerId: providerResult.id,
        detail: `${this.provider.name} accepted SMS` });
      results.set(item.notification.id, { providerId: providerResult.id, deliveryStatus: "sent" });
    }
    return results;
  }
}

export class Msg91SmsProvider implements SmsProvider {
  readonly name = "msg91" as const;
  constructor(private readonly authKey: string, private readonly fetcher: typeof fetch = fetch) {}
  async sendBulk(messages: Array<{ to: string; body: string; statusUrl: string; templateId?: string;
    variables: Record<string, string> }>) {
    const templateId = messages[0]?.templateId;
    if (!templateId || messages.some((message) => message.templateId !== templateId)) {
      throw new Error("msg91_sms_template_id_required");
    }
    const response = await this.fetcher("https://control.msg91.com/api/v5/flow", { method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json" },
      body: JSON.stringify({ template_id: templateId, realTimeResponse: "1",
        recipients: messages.map((message) => ({ mobiles: message.to.replace(/^\+/, ""),
          VAR1: message.variables.branch, VAR2: message.variables.title, VAR3: message.variables.camera,
          VAR4: message.variables.time, VAR5: message.variables.alertId, VAR6: message.variables.severity,
          clientId: new URL(message.statusUrl).searchParams.get("token") })) }) });
    if (!response.ok) throw new Error(`msg91_sms_http_${response.status}`);
    const body = await response.json() as any;
    const id = body.request_id ?? body.requestId;
    if (!id) throw new Error("msg91_sms_missing_request_id");
    return messages.map((_, index) => ({ id: `${id}:${index}` }));
  }
}

export class TextLocalSmsProvider implements SmsProvider {
  readonly name = "textlocal" as const;
  constructor(private readonly apiKey: string, private readonly senderId: string, private readonly fetcher: typeof fetch = fetch) {}
  async sendBulk(messages: Array<{ to: string; body: string; statusUrl: string }>) {
    const results: Array<{ id: string }> = [];
    for (const message of messages) {
      const form = new URLSearchParams({ apikey: this.apiKey, numbers: message.to, sender: this.senderId,
        message: message.body, receipt_url: message.statusUrl });
      const response = await this.fetcher("https://api.textlocal.in/send/", { method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
      if (!response.ok) throw new Error(`textlocal_sms_http_${response.status}`);
      const body = await response.json() as any;
      const id = body.messages?.[0]?.id;
      if (!id) throw new Error(`textlocal_sms_${body.errors?.[0]?.message ?? "missing_message_id"}`);
      results.push({ id: String(id) });
    }
    return results;
  }
}

export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio" as const;
  constructor(private readonly accountSid: string, private readonly authToken: string, private readonly from: string,
    private readonly fetcher: typeof fetch = fetch) {}
  async sendBulk(messages: Array<{ to: string; body: string; statusUrl: string }>) {
    const results: Array<{ id: string }> = [];
    for (let offset = 0; offset < messages.length; offset += 20) {
      const chunk = messages.slice(offset, offset + 20);
      results.push(...await Promise.all(chunk.map(async (message) => {
        const form = new URLSearchParams({ To: message.to, From: this.from, Body: message.body,
          StatusCallback: message.statusUrl });
        const response = await this.fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
          method: "POST", headers: { authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded" }, body: form });
        if (!response.ok) throw new Error(`twilio_sms_http_${response.status}`);
        const body = await response.json() as { sid?: string };
        if (!body.sid) throw new Error("twilio_sms_missing_message_sid");
        return { id: body.sid };
      })));
    }
    return results;
  }
}

export function renderSmsTemplate(template: string, values: Record<string, string>) {
  const rendered = template.replace(/\{(branch|severity|title|camera|time|alertId)\}/g,
    (placeholder, key: string) => values[key] ?? placeholder).replace(/\s+/g, " ").trim();
  return rendered.slice(0, 480);
}
