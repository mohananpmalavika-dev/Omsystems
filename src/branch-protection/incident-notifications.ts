import type { ControlPlaneStore } from '../control-plane-store.js';
import { notificationOutbox } from '../notifications/infrastructure/outbox/notification-outbox.js';
import { CHANNEL_RETRY_POLICIES } from '../notifications/infrastructure/worker/notification-worker.js';
import type { RecordingCheck } from './types.js';
import type { User } from '../domain/models.js';
import { createHash } from 'node:crypto';

/** Actual configured tenant recipients; the existing durable worker owns delivery. */
export async function enqueueProtectionIncidentNotifications(store: ControlPlaneStore,
  incident: { id: string; tenantId: string; branchId: string; severity: string; occurredAt?: string; assignedTo?: string; status?: string }, check: RecordingCheck, actor: User): Promise<void> {
  const policy = await store.getAlertNotificationPolicy(incident.tenantId);
  const priority = incident.severity === 'P1' ? 'P1' : 'P2';
  const secondsOpen = (Date.now() - Date.parse(incident.occurredAt ?? check.checkedAt)) / 1000;
  if (!incident.assignedTo && !['escalated', 'closed', 'resolved'].includes(incident.status ?? '') &&
    secondsOpen > (policy.escalationAfterSeconds[priority] ?? (priority === 'P1' ? 120 : 300)) &&
    (await store.checkAccess(actor, 'incident:escalate', incident.branchId))?.allowed) {
    await store.escalateIncident(incident.id, actor.id, 'Recording assurance incident remains unassigned beyond the configured response deadline', policy.recipientGroups.email ?? []);
    incident.status = 'escalated';
  }
  if ((await store.checkAccess(actor, 'analytics:view', incident.branchId))?.allowed && (await store.checkAccess(actor, 'incident:update', incident.branchId))?.allowed) {
    const related = await store.listAnalyticsAlerts(incident.tenantId, { branchId: incident.branchId, cameraId: check.cameraId,
      from: new Date(Date.parse(check.checkedAt) - 10 * 60_000).toISOString(), to: check.checkedAt, limit: 100 });
    for (const alert of related) if (!alert.incidentId && ['P1', 'P2'].includes(alert.severity)) {
      await store.linkAnalyticsAlertIncident(alert.id, incident.tenantId, incident.id);
    }
  }
  const channels = priority === 'P1' ? ['email', 'sms', 'voice'] as const : ['email'] as const;
  for (const channel of channels) for (const destination of [...new Set(policy.recipientGroups[channel] ?? [])]) {
    if (!destination.trim()) continue;
    const text = `Recording assurance requires attention at branch ${incident.branchId}, camera ${check.cameraId}. ${check.reason}. ${check.gaps.length} recording gaps. Incident ${incident.id}.`;
    await notificationOutbox.enqueue({ tenantId: incident.tenantId, alertId: incident.id, channel, priority,
      destination, payload: { subject: 'Branch recording assurance', text, voiceText: text, data: { incidentId: incident.id, branchId: incident.branchId, cameraId: check.cameraId } },
      maxAttempts: CHANNEL_RETRY_POLICIES[channel].maxAttempts, idempotencyKey: `protection:${incident.id}:${incident.status === 'escalated' ? 'escalation' : 'initial'}:${channel}:${createHash('sha256').update(destination).digest('hex')}` });
  }
}
