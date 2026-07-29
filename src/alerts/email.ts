import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AlertNotification, AnalyticsAlert } from "../domain/models.js";
import type { AlertNotificationSender, BatchAlertNotificationSender } from "./notification-dispatcher.js";

export type EmailProviderName = "smtp" | "sendgrid" | "ses" | "webhook" | "test";
export interface EmailProvider {
  readonly name: EmailProviderName;
  send(input: { to: string; subject: string; text?: string; html?: string }): Promise<{ id: string }>;
}

const DEFAULT_SUBJECT = (alert: AnalyticsAlert) => `${alert.severity} alert: ${alert.title}`;
const DEFAULT_BODY = (alert: AnalyticsAlert) => `${alert.title}\n\n${alert.description ?? ""}\n\nAlert: ${alert.id}\nSeverity: ${alert.severity}`;

export class EmailNotificationSender implements AlertNotificationSender {
  constructor(private readonly store: ControlPlaneStore, private readonly provider: EmailProvider) {}

  async send(notification: AlertNotification, alert: AnalyticsAlert) {
    if (notification.channel !== "email") throw new Error("email_sender_channel_mismatch");
    if (notification.recipient === "unconfigured") throw new Error("email_recipient_unconfigured");
    const subject = DEFAULT_SUBJECT(alert);
    const text = DEFAULT_BODY(alert);
    const result = await this.provider.send({ to: notification.recipient, subject, text });
    const now = new Date().toISOString();
    await this.store.recordEmailDeliveryEvent(notification.id, { status: "sent", occurredAt: now,
      providerId: result.id, provider: this.provider.name, subject });
    return { providerId: result.id, deliveryStatus: "sent" as const };
  }
}

export class NodemailerSmtpProvider implements EmailProvider {
  readonly name = "smtp" as const;
  constructor(private readonly config: any) {}
  async send(input: { to: string; subject: string; text?: string; html?: string }) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(this.config);
    const info = await transport.sendMail({ from: this.config.from, to: input.to, subject: input.subject, text: input.text, html: input.html });
    return { id: info.messageId ?? (info as any)?.response ?? "nodemailer:unknown" };
  }
}

export class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid" as const;
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch, private readonly from = process.env.ALERT_EMAIL_FROM ?? "alerts@example.com") {}
  async send(input: { to: string; subject: string; text?: string; html?: string }) {
    const payload = {
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: this.from },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text ?? "" }],
    } as any;
    if (input.html) payload.content.unshift({ type: "text/html", value: input.html });
    const res = await this.fetcher("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`sendgrid_http_${res.status}`);
    return { id: `sendgrid:${res.status}` };
  }
}

export class SesEmailProvider implements EmailProvider {
  readonly name = "ses" as const;
  constructor(private readonly client: any, private readonly from = process.env.ALERT_EMAIL_FROM ?? "alerts@example.com") {}
  async send(input: { to: string; subject: string; text?: string; html?: string }) {
    const { SendEmailCommand } = await import("@aws-sdk/client-ses");
    const params = {
      Destination: { ToAddresses: [input.to] },
      Message: { Subject: { Data: input.subject }, Body: { Text: { Data: input.text ?? "" } } },
      Source: this.from,
    } as any;
    if (input.html) params.Message.Body.Html = { Data: input.html };
    const cmd = new SendEmailCommand(params);
    const res = await this.client.send(cmd);
    return { id: String(res.MessageId ?? "ses:unknown") };
  }
}

export default EmailNotificationSender;
