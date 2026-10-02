import type { ControlPlaneStore } from '../control-plane-store.js';
import { notificationOutbox } from '../notifications/infrastructure/outbox/notification-outbox.js';
import { CHANNEL_RETRY_POLICIES } from '../notifications/infrastructure/worker/notification-worker.js';
import type { RecordingCheck } from './types.js';

/** Actual configured tenant recipients; the existing durable worker owns delivery. */
export async function enqueueProtectionIncidentNotifications(store: ControlPlaneStore,
  incident: { id: string; tenantId: string; branchId: string; severity: string }, check: RecordingCheck): Promise<void> {
  const policy = await store.getAlertNotificationPolicy(incident.tenantId);
  const priority = incident.severity === 'P1' ? 'P1' : 'P2';
  const channels = priority === 'P1' ? ['email', 'sms', 'voice'] as const : ['email'] as const;
  for (const channel of channels) for (const destination of [...new Set(policy.recipientGroups[channel] ?? [])]) {
    if (!destination.trim()) continue;
    const text = `Recording assurance requires attention at branch ${incident.branchId}, camera ${check.cameraId}. ${check.reason}. ${check.gaps.length} recording gaps. Incident ${incident.id}.`;
    await notificationOutbox.enqueue({ tenantId: incident.tenantId, alertId: incident.id, channel, priority,
      destination, payload: { subject: 'Branch recording assurance', text, voiceText: text, data: { incidentId: incident.id, branchId: incident.branchId, cameraId: check.cameraId } },
      maxAttempts: CHANNEL_RETRY_POLICIES[channel].maxAttempts, idempotencyKey: `protection:${incident.id}:${channel}:${destination}` });
  }
}
