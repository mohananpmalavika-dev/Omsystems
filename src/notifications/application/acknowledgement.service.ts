/**
 * Notification Acknowledgement & Escalation Cancellation Service
 */

import { notificationOutbox, NotificationOutbox } from "../infrastructure/outbox/notification-outbox.js";

export interface AcknowledgementResult {
  success: boolean;
  alertId: string;
  acknowledgedNotifications: number;
  cancelledPendingNotifications: number;
  acknowledgedBy: {
    channel: string;
    actorReference?: string | undefined;
    occurredAt: Date;
  };
}

export class NotificationAcknowledgementService {
  constructor(private readonly outbox: NotificationOutbox = notificationOutbox) {}

  async acknowledgeFromChannel(
    alertId: string,
    channel: "VOICE_IVR" | "SMS_REPLY" | "EMAIL_ACTION" | "DASHBOARD",
    actorReference?: string | undefined
  ): Promise<AcknowledgementResult> {
    const now = new Date();

    // 1. Mark existing delivered/sent notifications as ACKNOWLEDGED
    const ackCount = await this.outbox.markAcknowledgedByAlert(alertId, now);

    // 2. Cancel any pending repeats or future escalation notifications
    const cancelledCount = await this.outbox.cancelPendingForAlert(
      alertId,
      `CANCELLED_DUE_TO_ACKNOWLEDGEMENT_VIA_${channel}`,
      now
    );

    return {
      success: true,
      alertId,
      acknowledgedNotifications: ackCount,
      cancelledPendingNotifications: cancelledCount,
      acknowledgedBy: {
        channel,
        actorReference,
        occurredAt: now,
      },
    };
  }
}

export const notificationAcknowledgementService = new NotificationAcknowledgementService();
