/**
 * Notification Engine
 * Handles multi-channel notifications for analytics alerts
 */

export interface NotificationChannel {
  type: "in-app" | "email" | "sms" | "webhook" | "push";
  recipient: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationPayload {
  alertId: string;
  title: string;
  description?: string;
  severity: "P1" | "P2" | "P3" | "P4" | "P5";
  cameraId: string;
  cameraName?: string;
  branchName?: string;
  timestamp: string;
  snapshotUrl?: string;
  liveViewUrl?: string;
  actionUrls?: {
    acknowledge?: string;
    viewDetails?: string;
    createIncident?: string;
  };
}

export interface NotificationResult {
  channel: NotificationChannel;
  status: "sent" | "failed" | "queued";
  error?: string;
  sentAt?: string;
}

export class NotificationEngine {
  private readonly controlPlaneUrl: string;
  private readonly sharedKey: string;
  private notificationQueue: Array<{
    payload: NotificationPayload;
    channels: NotificationChannel[];
  }> = [];
  private isProcessing = false;

  constructor(options: { controlPlaneUrl: string; sharedKey: string }) {
    this.controlPlaneUrl = options.controlPlaneUrl;
    this.sharedKey = options.sharedKey;
  }

  /**
   * Queue notification for delivery
   */
  async queueNotification(
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): Promise<void> {
    this.notificationQueue.push({ payload, channels });
    
    // Start processing if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }
  }

  /**
   * Process notification queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.notificationQueue.length > 0) {
      const item = this.notificationQueue.shift();
      if (!item) continue;

      try {
        await this.sendNotifications(item.payload, item.channels);
      } catch (error) {
        console.error("Notification delivery failed:", error);
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  /**
   * Send notifications through all channels
   */
  private async sendNotifications(
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      try {
        const result = await this.sendToChannel(payload, channel);
        results.push(result);
      } catch (error) {
        results.push({
          channel,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    switch (channel.type) {
      case "in-app":
        return this.sendInAppNotification(payload, channel);
      case "email":
        return this.sendEmailNotification(payload, channel);
      case "sms":
        return this.sendSmsNotification(payload, channel);
      case "webhook":
        return this.sendWebhookNotification(payload, channel);
      case "push":
        return this.sendPushNotification(payload, channel);
      default:
        throw new Error(`Unsupported channel type: ${(channel as any).type}`);
    }
  }

  /**
   * Send in-app notification via control plane
   */
  private async sendInAppNotification(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    try {
      const response = await fetch(
        new URL("/internal/notifications", this.controlPlaneUrl),
        {
          method: "POST",
          signal: AbortSignal.timeout(5_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": this.sharedKey,
          },
          body: JSON.stringify({
            userId: channel.recipient,
            type: "analytics_alert",
            title: payload.title,
            message: payload.description,
            severity: payload.severity,
            data: {
              alertId: payload.alertId,
              cameraId: payload.cameraId,
              snapshotUrl: payload.snapshotUrl,
              actionUrls: payload.actionUrls,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Control plane returned ${response.status}`);
      }

      return {
        channel,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        channel,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    try {
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      const emailBody = this.formatEmailBody(payload);
      
      const response = await fetch(
        new URL("/internal/email", this.controlPlaneUrl),
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": this.sharedKey,
          },
          body: JSON.stringify({
            to: channel.recipient,
            subject: `[${payload.severity}] ${payload.title}`,
            html: emailBody,
            attachments: payload.snapshotUrl
              ? [{ url: payload.snapshotUrl, filename: "alert-snapshot.jpg" }]
              : undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Email service returned ${response.status}`);
      }

      return {
        channel,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        channel,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    try {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      const smsBody = this.formatSmsBody(payload);

      const response = await fetch(
        new URL("/internal/sms", this.controlPlaneUrl),
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": this.sharedKey,
          },
          body: JSON.stringify({
            to: channel.recipient,
            message: smsBody,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`SMS service returned ${response.status}`);
      }

      return {
        channel,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        channel,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    try {
      const webhookUrl = channel.recipient;
      
      const response = await fetch(webhookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "Aditi-Sentinel-Analytics/1.0",
        },
        body: JSON.stringify({
          event: "analytics_alert",
          timestamp: payload.timestamp,
          alert: payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      return {
        channel,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        channel,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<NotificationResult> {
    try {
      // TODO: Integrate with push notification service (Firebase, OneSignal, etc.)
      const response = await fetch(
        new URL("/internal/push", this.controlPlaneUrl),
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": this.sharedKey,
          },
          body: JSON.stringify({
            userId: channel.recipient,
            title: payload.title,
            body: payload.description,
            data: {
              alertId: payload.alertId,
              cameraId: payload.cameraId,
              severity: payload.severity,
            },
            icon: this.getSeverityIcon(payload.severity),
            badge: this.getSeverityBadge(payload.severity),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Push service returned ${response.status}`);
      }

      return {
        channel,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        channel,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Format email body HTML
   */
  private formatEmailBody(payload: NotificationPayload): string {
    const severityColor = this.getSeverityColor(payload.severity);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .footer { background: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 3px; margin: 10px 5px; }
          .details { margin: 15px 0; }
          .label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>[${payload.severity}] ${payload.title}</h2>
          </div>
          <div class="content">
            <div class="details">
              <p><span class="label">Camera:</span> ${payload.cameraName ?? payload.cameraId}</p>
              ${payload.branchName ? `<p><span class="label">Branch:</span> ${payload.branchName}</p>` : ""}
              <p><span class="label">Time:</span> ${new Date(payload.timestamp).toLocaleString()}</p>
              ${payload.description ? `<p><span class="label">Description:</span> ${payload.description}</p>` : ""}
            </div>
            ${payload.snapshotUrl ? `<p><img src="${payload.snapshotUrl}" alt="Alert Snapshot" style="max-width: 100%; height: auto;"></p>` : ""}
            <div style="margin-top: 20px;">
              ${payload.actionUrls?.acknowledge ? `<a href="${payload.actionUrls.acknowledge}" class="button">Acknowledge</a>` : ""}
              ${payload.actionUrls?.viewDetails ? `<a href="${payload.actionUrls.viewDetails}" class="button">View Details</a>` : ""}
              ${payload.liveViewUrl ? `<a href="${payload.liveViewUrl}" class="button">View Live</a>` : ""}
            </div>
          </div>
          <div class="footer">
            <p>Aditi Sentinel Video Analytics System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Format SMS body (limited to 160 characters)
   */
  private formatSmsBody(payload: NotificationPayload): string {
    const camera = payload.cameraName ?? payload.cameraId;
    const branch = payload.branchName ? ` at ${payload.branchName}` : "";
    return `[${payload.severity}] ${payload.title} - Camera ${camera}${branch}. Check Aditi Sentinel app.`;
  }

  /**
   * Get severity color
   */
  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      P1: "#dc3545", // Critical - Red
      P2: "#fd7e14", // High - Orange
      P3: "#ffc107", // Medium - Yellow
      P4: "#17a2b8", // Low - Blue
      P5: "#6c757d", // Info - Gray
    };
    return colors[severity] ?? "#6c757d";
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      P1: "🚨",
      P2: "⚠️",
      P3: "⚡",
      P4: "ℹ️",
      P5: "📊",
    };
    return icons[severity] ?? "📊";
  }

  /**
   * Get severity badge count
   */
  private getSeverityBadge(severity: string): number {
    const badges: Record<string, number> = {
      P1: 3,
      P2: 2,
      P3: 1,
      P4: 1,
      P5: 0,
    };
    return badges[severity] ?? 0;
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
  } {
    return {
      queueLength: this.notificationQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}
