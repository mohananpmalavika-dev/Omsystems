/**
 * Unified Notification Engine
 * 
 * Replaces the old notification-engine.ts
 * Now calls the unified /internal/notifications endpoint
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
  tenantId: string;
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
  notificationId: string;
  deliveryIds: string[];
  status: "queued";
}

export class UnifiedNotificationEngine {
  private readonly controlPlaneUrl: string;
  private readonly sharedKey: string;

  constructor(options: { controlPlaneUrl: string; sharedKey: string }) {
    this.controlPlaneUrl = options.controlPlaneUrl;
    this.sharedKey = options.sharedKey;
  }

  /**
   * Send notification via unified endpoint
   * 
   * This replaces the old channel-specific calls:
   * - /internal/email
   * - /internal/sms
   * - /internal/push
   * 
   * With a single endpoint:
   * - /internal/notifications
   */
  async sendNotification(
    payload: NotificationPayload,
    channels: NotificationChannel[]
  ): Promise<NotificationResult> {
    try {
      // Map channel types to unified format
      const unifiedChannels = this.mapChannels(channels);

      // Build unified notification request
      const notificationRequest = {
        tenantId: payload.tenantId,
        type: "analytics_alert",
        channels: unifiedChannels,
        recipient: this.buildRecipient(channels),
        subject: `[${payload.severity}] ${payload.title}`,
        title: payload.title,
        body: this.buildBody(payload),
        priority: this.mapPriority(payload.severity),
        metadata: {
          alertId: payload.alertId,
          cameraId: payload.cameraId,
          cameraName: payload.cameraName,
          branchName: payload.branchName,
          severity: payload.severity,
          timestamp: payload.timestamp,
          snapshotUrl: payload.snapshotUrl,
          liveViewUrl: payload.liveViewUrl,
          actionUrls: payload.actionUrls,
        },
        idempotencyKey: `alert:${payload.alertId}`,
        source: {
          type: "detection",
          id: payload.alertId,
        },
      };

      // Call unified notification endpoint
      const response = await fetch(
        new URL("/internal/notifications", this.controlPlaneUrl),
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": this.sharedKey,
          },
          body: JSON.stringify(notificationRequest),
        }
      );

      if (!response.ok) {
        throw new Error(`Notification API returned ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();

      console.log("Notification enqueued successfully", {
        alertId: payload.alertId,
        notificationId: result.notificationId,
        channels: unifiedChannels,
        deliveries: result.deliveryIds.length,
      });

      return result;
    } catch (error) {
      console.error("Failed to send notification", {
        alertId: payload.alertId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Map channel types to unified format
   */
  private mapChannels(
    channels: NotificationChannel[]
  ): Array<"in_app" | "email" | "sms" | "webhook" | "push"> {
    const mapped: Set<"in_app" | "email" | "sms" | "webhook" | "push"> = new Set();

    for (const channel of channels) {
      switch (channel.type) {
        case "in-app":
          mapped.add("in_app");
          break;
        case "email":
          mapped.add("email");
          break;
        case "sms":
          mapped.add("sms");
          break;
        case "webhook":
          mapped.add("webhook");
          break;
        case "push":
          mapped.add("push");
          break;
      }
    }

    return Array.from(mapped);
  }

  /**
   * Build recipient from channels
   * 
   * Ideally, analytics should only send userId and let backend resolve
   * email/phone/pushToken. For now, we support both patterns.
   */
  private buildRecipient(
    channels: NotificationChannel[]
  ): {
    userId?: string;
    email?: string;
    phone?: string;
    webhookUrl?: string;
    pushToken?: string;
  } {
    const recipient: {
      userId?: string;
      email?: string;
      phone?: string;
      webhookUrl?: string;
      pushToken?: string;
    } = {};

    for (const channel of channels) {
      switch (channel.type) {
        case "in-app":
          recipient.userId = channel.recipient;
          break;
        case "email":
          recipient.email = channel.recipient;
          break;
        case "sms":
          recipient.phone = channel.recipient;
          break;
        case "webhook":
          recipient.webhookUrl = channel.recipient;
          break;
        case "push":
          recipient.pushToken = channel.recipient;
          break;
      }
    }

    return recipient;
  }

  /**
   * Build notification body
   */
  private buildBody(payload: NotificationPayload): string {
    let body = payload.description || payload.title;

    if (payload.cameraName) {
      body += `\n\nCamera: ${payload.cameraName}`;
    } else {
      body += `\n\nCamera ID: ${payload.cameraId}`;
    }

    if (payload.branchName) {
      body += `\nBranch: ${payload.branchName}`;
    }

    body += `\nTime: ${new Date(payload.timestamp).toLocaleString()}`;

    if (payload.liveViewUrl) {
      body += `\n\nView Live: ${payload.liveViewUrl}`;
    }

    if (payload.actionUrls?.viewDetails) {
      body += `\nView Details: ${payload.actionUrls.viewDetails}`;
    }

    return body;
  }

  /**
   * Map severity to priority
   */
  private mapPriority(
    severity: string
  ): "low" | "normal" | "high" | "critical" {
    switch (severity) {
      case "P1":
        return "critical";
      case "P2":
        return "high";
      case "P3":
        return "normal";
      case "P4":
      case "P5":
        return "low";
      default:
        return "normal";
    }
  }

  /**
   * Get queue status (for backward compatibility)
   */
  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
  } {
    // Unified system doesn't have a local queue
    return {
      queueLength: 0,
      isProcessing: false,
    };
  }
}
