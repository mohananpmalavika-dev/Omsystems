import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store.js';
import type { AnalyticsAlert } from '../packages/contracts/src/index.js';

const time = '2026-09-28T00:00:00.000Z';
function alert(id: string, cameraId: string, severity: AnalyticsAlert['severity'], when = time): AnalyticsAlert {
  return {
    id, tenantId: 'omsystems', cameraId, ruleId: 'rule', eventId: id,
    title: 'Fixture alert', description: 'Fixture', severity, status: 'new', confidence: 0.9,
    objectClasses: ['person'], modelVersion: 'fixture', firstDetectedAt: when, lastDetectedAt: when,
    occurrenceCount: 1, version: 1, createdAt: when, updatedAt: when,
  };
}

describe('live wall alert scope under load', () => {
  it('filters camera scope before limiting a busy tenant alert queue', async () => {
    const store = new MemoryStore();
    store.analyticsAlerts.push(alert('branch-critical', 'cam-001', 'P1', '2026-09-27T00:00:00.000Z'));
    store.analyticsAlerts.push(...Array.from({ length: 1001 }, (_, i) => alert(`other-${i}`, 'cam-002', 'P1')));
    expect(await store.listAnalyticsAlerts('omsystems', { cameraIds: ['cam-001'], limit: 1, priorityFirst: true }))
      .toMatchObject([{ id: 'branch-critical' }]);
    expect(await store.listAnalyticsAlerts('omsystems', { cameraIds: [], limit: 10 })).toEqual([]);
  });
  it('keeps an older open critical alert ahead of newer low-priority and resolved alerts', async () => {
    const store = new MemoryStore();
    store.analyticsAlerts.push(alert('low', 'cam-001', 'P4'));
    store.analyticsAlerts.push({ ...alert('closed', 'cam-001', 'P1'), status: 'resolved' });
    store.analyticsAlerts.push(alert('critical', 'cam-001', 'P1', '2026-09-27T00:00:00.000Z'));
    expect(await store.listAnalyticsAlerts('omsystems', { cameraIds: ['cam-001'], limit: 1, priorityFirst: true }))
      .toMatchObject([{ id: 'critical' }]);
  });
});
