/**
 * Notification Renderer
 * 
 * Generates channel-tailored messages (Voice spoken scripts, concise SMS,
 * rich HTML emails, and real-time dashboard payloads) from canonical alert context.
 */

import type {
  NotificationChannel,
  NotificationContext,
  ResolvedRecipient,
  RenderedPayload,
} from "../domain/notification.types.js";

export class NotificationRenderer {
  render(context: NotificationContext, channel: NotificationChannel, recipient: ResolvedRecipient): RenderedPayload {
    const branch = context.branchName || context.branchId || "Central Site";
    const camera = context.cameraName || context.cameraId || "Surveillance Sensor";
    const detection = context.detectionType || context.title;

    switch (channel) {
      case "voice": {
        const spokenText = `Critical surveillance alert. ${detection}. Branch ${branch}. Camera ${camera}. Severity ${context.priority}. Press 1 to acknowledge. Press 2 to repeat.`;
        return {
          text: spokenText,
          voiceText: spokenText,
          ivrActions: {
            acknowledgeDigit: "1",
            repeatDigit: "2",
          },
        };
      }

      case "sms": {
        const smsText = `[${context.priority}] ${context.title} - Branch: ${branch}, Cam: ${camera}. Alert ID: ${context.alertId}. Open Sentinel to view live video.`;
        return {
          text: smsText.substring(0, 160),
        };
      }

      case "email": {
        const subject = `[${context.priority}] Surveillance Alert: ${context.title} (${branch})`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: ${context.priority === "P1" ? "#b91c1c" : "#c2410c"}; padding: 16px; color: #ffffff;">
              <h2 style="margin: 0; font-size: 18px;">[${context.priority}] ${context.title}</h2>
            </div>
            <div style="padding: 20px; color: #1e293b; font-size: 14px; line-height: 1.6;">
              <p><strong>Branch:</strong> ${branch}</p>
              <p><strong>Camera:</strong> ${camera}</p>
              <p><strong>Detection:</strong> ${detection}</p>
              <p><strong>Occurred At:</strong> ${context.occurredAt.toLocaleString()}</p>
              <p><strong>Alert ID:</strong> <span style="font-family: monospace;">${context.alertId}</span></p>
              <div style="margin-top: 24px;">
                <a href="https://sentinel.bank-corp.internal/operations/alerts" style="background-color: #0284c7; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Command Center</a>
              </div>
            </div>
            <div style="background-color: #f8fafc; padding: 12px 20px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              Aditi Sentinel Banking Surveillance System • Confidential
            </div>
          </div>
        `;
        return {
          subject,
          text: `[${context.priority}] ${context.title}\nBranch: ${branch}\nCamera: ${camera}\nTime: ${context.occurredAt.toISOString()}\nAlert ID: ${context.alertId}`,
          html,
        };
      }

      case "dashboard": {
        return {
          text: `${context.priority}: ${context.title} at ${branch}`,
          data: {
            alertId: context.alertId,
            priority: context.priority,
            branchId: context.branchId,
            branchName: branch,
            cameraId: context.cameraId,
            cameraName: camera,
            detectionType: context.detectionType,
            occurredAt: context.occurredAt.toISOString(),
            soundPriority: context.priority,
          },
        };
      }

      case "push": {
        return {
          subject: `[${context.priority}] ${context.title}`,
          text: `${branch} • ${camera} • ${detection}`,
          data: {
            alertId: context.alertId,
            url: `/operations/alerts?id=${context.alertId}`,
          },
        };
      }

      case "system_log":
      default: {
        return {
          text: `[AUDIT_LOG] Alert ${context.alertId} (${context.priority}): ${context.title} at ${branch} [${camera}]`,
          data: { ...context },
        };
      }
    }
  }
}

export const notificationRenderer = new NotificationRenderer();
