/**
 * Notification Engine (Analytics Facade)
 * 
 * @deprecated Legacy analytics notification engine facade.
 * All notification routing, policies, and outbox delivery are owned and executed
 * authoritatively by `src/notifications/` (NotificationService) in the control plane.
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

  constructor(options: { controlPlaneUrl: string; sharedKey: string }) {
    this.controlPlaneUrl = options.controlPlaneUrl;
    this.sharedKey = options.sharedKey;
  }

  getStatus() {
    return {
      status: "operational",
      controlPlaneUrl: this.controlPlaneUrl,
      mode: "authoritative-control-plane",
    };
  }

  /**
   * Queue notification intent for authoritative delivery by control plane
   */
  async queueNotification(
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channel of channels) {
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
              channel: channel.type,
              recipient: channel.recipient,
              title: payload.title,
              message: payload.description || payload.title,
              severity: payload.severity,
              alertId: payload.alertId,
              cameraId: payload.cameraId,
              metadata: {
                ...channel.metadata,
                cameraName: payload.cameraName,
                branchName: payload.branchName,
                snapshotUrl: payload.snapshotUrl,
                actionUrls: payload.actionUrls,
              },
            }),
          }
        );

        results.push({
          channel,
          status: response.ok ? "sent" : "failed",
          sentAt: response.ok ? new Date().toISOString() : undefined,
          error: response.ok ? undefined : `Control plane returned ${response.status}`,
        });
      } catch (err) {
        results.push({
          channel,
          status: "failed",
          error: err instanceof Error ? err.message : "Delivery dispatch failed",
        });
      }
    }

    return results;
  }
}
