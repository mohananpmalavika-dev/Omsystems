import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';
import { TelemetryQualityService } from '../src/operational-health/services/telemetry-quality.service.js';
import { healthFreshnessEvaluator } from '../src/operational-health/services/health-freshness-evaluator.service.js';
import { StoreAndForwardOutboxService } from '../src/offline-sync/services/store-and-forward-outbox.service.js';
import { RecordingGapDetectorService } from '../src/recording/recovery/recording-gap-detector.service.js';
import { StepExecutorService } from '../src/incidents/services/step-executor.service.js';
import type { PlaybookStepDefinition, StepInstance } from '../src/incidents/domain/playbook.types.js';

describe('Security operations reliability', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  it('requires probe evidence before automatically completing a banking response step', async () => {
    const definition: PlaybookStepDefinition = { id: 'door', order: 1, type: 'AUTOMATED_CHECK', title: 'Verify door', description: 'Probe access controller', mandatory: true };
    const pending: StepInstance = { stepId: 'door', order: 1, type: 'AUTOMATED_CHECK', title: 'Verify door', description: 'Probe access controller', mandatory: true, status: 'PENDING' };
    expect((await new StepExecutorService().executeAutomatedCheck(definition, pending)).status).toBe('PENDING');
    const unverified = new StepExecutorService(async () => ({ verified: true, evidenceIds: [], data: { locked: true } }));
    expect((await unverified.executeAutomatedCheck(definition, pending)).status).toBe('PENDING');
    const verified = new StepExecutorService(async (_step, context) => ({ verified: true, evidenceIds: ['probe-123'], data: { tenantId: context.tenantId, locked: false } }));
    const result = await verified.executeAutomatedCheck(definition, pending, { tenantId: 'tenant-a' });
    expect(result.status).toBe('COMPLETED');
    expect(result.resultJson).toMatchObject({ verified: true, evidenceIds: ['probe-123'], tenantId: 'tenant-a', locked: false });
  });
  it('isolates duplicate device identifiers by tenant and branch', () => {
    const service = new TelemetryQualityService();
    for (const [tenantId, branchId, health] of [['a', 'one', 'HEALTHY'], ['b', 'two', 'CRITICAL'], ['a', 'three', 'WARNING']] as const) {
      service.ingestObservation({ tenantId, branchId, entityType: 'CAMERA', entityId: 'camera-1', health, observedAt: now, source: 'recorder' }, now);
    }
    expect(service.getEffectiveHealth('CAMERA', 'camera-1', now, { tenantId: 'a', branchId: 'one' }).state).toBe('HEALTHY');
    expect(service.getEffectiveHealth('CAMERA', 'camera-1', now, { tenantId: 'b', branchId: 'two' }).state).toBe('CRITICAL');
    expect(service.generateQualityReport(now, { tenantId: 'a', branchId: 'one' }).totalMonitoredBranches).toBe(1);
    expect(service.getObservation('CAMERA', 'camera-1')).toBeUndefined();
    service.ingestObservation({ tenantId: 'a', branchId: 'one', entityType: 'CAMERA', entityId: 'camera-1', health: 'CRITICAL', observedAt: '2026-10-02T09:00:00Z', source: 'replayed' }, now);
    expect(service.getEffectiveHealth('CAMERA', 'camera-1', now, { tenantId: 'a', branchId: 'one' }).state).toBe('HEALTHY');
    expect(service.getEffectiveHealth('DISK', 'missing', now).entityType).toBe('DISK');
  });
  it('rejects invalid timestamps and does not trust future observations', () => {
    const service = new TelemetryQualityService();
    const observation = { entityType: 'CAMERA' as const, entityId: 'camera-1', health: 'HEALTHY' as const, observedAt: 'invalid', source: 'recorder' };
    expect(() => service.ingestObservation(observation, now)).toThrow('invalid_health_observation_timestamp');
    expect(healthFreshnessEvaluator.evaluateFreshness(observation, now).state).toBe('UNKNOWN');
    service.ingestObservation({ ...observation, observedAt: '2026-10-02T11:00:00Z' }, now);
    expect(service.getEffectiveHealth('CAMERA', 'camera-1', now).state).toBe('UNKNOWN');
  });
  it('recovers interrupted offline batches from disk and preserves priority under quota pressure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sentinel-outbox-'));
    try {
      const journal = join(directory, 'queue.json');
      const original = new StoreAndForwardOutboxService(2, journal);
      const p1 = original.enqueue('branch', 'P1_INCIDENTS', { reason: 'duress' });
      original.enqueue('branch', 'AUDIT_LOGS', { action: 'verified' });
      original.nextBatch('branch');
      const restored = new StoreAndForwardOutboxService(2, journal);
      expect(restored.getQueue('branch').every(item => item.status === 'QUEUED')).toBe(true);
      expect(() => restored.enqueue('branch', 'HEALTH_TELEMETRY', {})).toThrow('outbox_quota_exceeded');
      restored.acknowledgeBatch('branch', [p1.id]);
      expect(new StoreAndForwardOutboxService(2, journal).getQueue('branch')).toHaveLength(1);
    } finally {
      const target = resolve(directory);
      if (!target.startsWith(resolve(tmpdir()) + '\\')) throw new Error('Unexpected test cleanup path');
      rmSync(target, { recursive: true, force: true });
    }
  });
  it('does not report phantom gaps between nested overlapping segments', async () => {
    const rows = [
      { id: 'long', started_at: '2026-10-02T10:00:00Z', ended_at: '2026-10-02T10:10:00Z' },
      { id: 'nested', started_at: '2026-10-02T10:01:00Z', ended_at: '2026-10-02T10:02:00Z' },
      { id: 'next', started_at: '2026-10-02T10:05:00Z', ended_at: '2026-10-02T10:09:00Z' },
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const service = new RecordingGapDetectorService({ query } as unknown as Pool);
    const options = { tenantId: 'tenant-a', cameraId: 'camera', startTime: '2026-10-02T10:00:00Z', endTime: '2026-10-02T10:10:00Z' };
    expect(await service.scanTimelineGaps(options)).toEqual([]);
    expect(query.mock.calls[0]?.[0]).toContain('tenant_id = $4');
    expect(query.mock.calls[0]?.[1]).toContain('tenant-a');
    await expect(service.scanTimelineGaps({ ...options, startTime: 'invalid' })).rejects.toThrow('Invalid time window');
  });
  it('does not manufacture a successful recovery rate without samples', async () => {
    const service = new RecordingGapDetectorService({ query: vi.fn().mockResolvedValue({ rows: [{ total_gaps: 0, healed_gaps: 0 }] }) } as unknown as Pool);
    expect((await service.getGapMetrics({ tenantId: 'tenant-a' })).healingSuccessRate).toBeNull();
  });
});
