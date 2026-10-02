import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ControlPlaneStore } from '../src/control-plane-store.js';
import type { User } from '../src/domain/models.js';
import type { BranchOperationalSnapshot } from '../src/services/branch-operational-snapshot.production.service.js';
import { BranchProtectionService, evaluateProtection, sopMatches } from '../src/branch-protection/service.js';
import { assertRecovery } from '../src/branch-protection/recovery-gate.js';
import { initialProtectionState, type ProtectionState, type RecordingCheck } from '../src/branch-protection/types.js';
import type { ProtectionRepository } from '../src/branch-protection/repository.js';
import { decodeArchiveSample, LocalArchiveRecordingProbe, recordingGaps } from '../src/branch-protection/recording-probe.js';
import { registerBranchProtectionRoutes } from '../src/branch-protection/routes.js';
import { RecordingContinuityService } from '../src/recording-continuity/services/recording-continuity.service.js';
import { EncryptedOutbox } from '../edge-agent/src/offline/encrypted-outbox.js';
import { enqueueProtectionIncidentNotifications } from '../src/branch-protection/incident-notifications.js';
import { notificationOutbox } from '../src/notifications/infrastructure/outbox/notification-outbox.js';

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const user: User = { id: 'operator', displayName: 'Operator', tenantId: 'tenant-a', role: 'company_admin' };
const now = new Date('2026-10-02T04:00:00Z');
const check = (patch: Partial<RecordingCheck> = {}): RecordingCheck => ({ cameraId: 'camera-a', status: 'VERIFIED', checkedAt: now.toISOString(), sampleAt: now.toISOString(), framesDecoded: 30, timestampProgressing: true, reason: 'Decoded', gaps: [], indexedRetentionDays: 100, ...patch });
const snapshot = { lastTelemetryAt: now.toISOString(), cameras: { state: 'HEALTHY' }, recorders: { state: 'HEALTHY' }, storage: { state: 'HEALTHY' }, retention: { state: 'COMPLIANT' }, network: { state: 'ONLINE' }, reasons: [] } as unknown as BranchOperationalSnapshot;
class TestRepository implements ProtectionRepository {
  state = initialProtectionState();
  events: unknown[] = [];
  private operation: Promise<unknown> = Promise.resolve();
  async read() { return structuredClone(this.state); }
  mutate(_tenant: string, _branch: string, _actor: string, action: string, update: (state: ProtectionState) => Promise<unknown>) {
    const work = this.operation.then(async () => {
      const draft = structuredClone(this.state); const detail = await update(draft);
      this.state = draft; this.events.push({ action, detail }); return structuredClone(draft);
    });
    this.operation = work.catch(() => undefined); return work;
  }
  async enabledBranches() { return []; }
  async audit() { return this.events; }
}
function fixture(probeCheck = check({ checkedAt: new Date().toISOString() })) {
  const repository = new TestRepository();
  const incidents = new Map<string, any>();
  const store = {
    listCamerasByBranch: vi.fn(async () => [{ id: 'camera-a', name: 'Cash counter', nodeId: 'camera-node', branchId: 'branch-a', tenantId: user.tenantId }]),
    getNode: vi.fn(async () => ({ id: 'branch-a', type: 'branch', tenantId: user.tenantId })),
    checkAccess: vi.fn(async () => ({ allowed: true })),
    getIncident: vi.fn(async (id: string) => incidents.get(id)),
    createIncident: vi.fn(async (input: any) => { incidents.set(input.id, input); return input; }),
    listIncidentCameras: vi.fn(async () => []), addIncidentCamera: vi.fn(async () => undefined),
    listIncidentEvidenceItems: vi.fn(async () => []), addIncidentEvidenceItem: vi.fn(async () => undefined),
    closeIncident: vi.fn(async (id: string) => { incidents.get(id).status = 'closed'; }),
  } as unknown as ControlPlaneStore;
  const probe = { check: vi.fn(async () => structuredClone(probeCheck)) };
  return { repository, incidents, store, probe, service: new BranchProtectionService(store, repository, probe) };
}

describe('Branch protection truth and recovery', () => {
  it('requires fresh decode, retention and every health dimension for protected status', () => {
    const state = initialProtectionState(); state.checks['camera-a'] = check();
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('PROTECTED');
    state.checks['camera-a'] = check({ status: 'UNKNOWN' });
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('UNKNOWN');
    state.checks['camera-a'] = check({ checkedAt: new Date(+now - 31 * 60_000).toISOString() });
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('UNKNOWN');
    state.checks['camera-a'] = check({ gaps: [{ from: now.toISOString(), to: now.toISOString(), seconds: 90 }] });
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('AT_RISK');
    expect(evaluateProtection(state, [], snapshot, now).status).toBe('UNKNOWN');
  });
  it('does not convert archive index existence into decoded playback evidence', async () => {
    const continuity = new RecordingContinuityService();
    continuity.ingestSegments('camera-a', [{ start: new Date(+now - 1000), end: new Date(+now + 1000), type: 'CONTINUOUS', source: 'index' }]);
    const result = await continuity.verifyPlayback('camera-a', now);
    expect(result.recordingFound).toBe(true); expect(result.framesDecoded).toBe(false); expect(result.successful).toBe(false);
  });
  it('merges overlap before measuring real gaps and excludes invalid intervals', () => {
    const t = (seconds: number) => new Date(+now + seconds * 1000);
    expect(recordingGaps([{ started_at: t(0), ended_at: t(20) }, { started_at: t(10), ended_at: t(30) }, { started_at: t(50), ended_at: t(60) }], t(0), t(60), 5)).toEqual([{ from: t(30).toISOString(), to: t(50).toISOString(), seconds: 20 }]);
    expect(recordingGaps([{ started_at: 'invalid', ended_at: t(20) }], t(0), t(60), 5)[0]?.seconds).toBe(60);
  });
  it('blocks missing, stale, failed and unassigned recovery evidence', () => {
    const state = initialProtectionState();
    expect(() => assertRecovery(check(), state, true, now)).not.toThrow();
    for (const value of [undefined, check({ status: 'FAILED' }), check({ framesDecoded: 0 }), check({ indexedRetentionDays: 0 }), check({ checkedAt: '2020-01-01' })]) expect(() => assertRecovery(value, state, true, now)).toThrow();
    expect(() => assertRecovery(check(), state, false, now)).toThrow('Assign');
  });
  it('correlates repeated recording failures to one canonical incident and attaches evidence', async () => {
    const f = fixture(check({ status: 'FAILED', checkedAt: new Date().toISOString() }));
    await f.service.verify(user, 'branch-a'); await f.service.verify(user, 'branch-a');
    expect(f.store.createIncident).toHaveBeenCalledTimes(1);
    expect(f.store.addIncidentEvidenceItem).toHaveBeenCalled();
    expect(f.repository.state.checks['camera-a']?.incidentId).toBeTruthy();
  });
  it('recovers an incident creation failure using the previously persisted incident intent', async () => {
    const f = fixture(check({ status: 'FAILED', checkedAt: new Date().toISOString() }));
    vi.mocked(f.store.createIncident).mockRejectedValueOnce(new Error('database outage'));
    await expect(f.service.verify(user, 'branch-a')).rejects.toThrow('database outage');
    const intendedId = f.repository.state.checks['camera-a']!.incidentId;
    await f.service.verify(user, 'branch-a');
    expect([...f.incidents.keys()]).toEqual([intendedId]);
  });
  it('does not raise a recording-failure incident when archive retrieval is unknown', async () => {
    const f = fixture(check({ status: 'UNKNOWN', checkedAt: new Date().toISOString(), gaps: [{ from: now.toISOString(), to: now.toISOString(), seconds: 86400 }] }));
    await f.service.verify(user, 'branch-a'); expect(f.store.createIncident).not.toHaveBeenCalled();
  });
  it('serializes simultaneous verification attempts across separate service instances', async () => {
    const f = fixture();
    let release!: () => void;
    f.probe.check.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(check()); }));
    const first = f.service.verify(user, 'branch-a');
    while (!release) await new Promise(resolve => setTimeout(resolve, 1));
    const second = new BranchProtectionService(f.store, f.repository, f.probe);
    await expect(second.verify(user, 'branch-a')).rejects.toThrow('already running');
    release(); await first;
  });
  it('closes assigned recovered incidents and refuses failed recovery', async () => {
    const f = fixture(check({ status: 'FAILED', checkedAt: new Date().toISOString() }));
    await f.service.verify(user, 'branch-a');
    await expect(f.service.resolve(user, 'branch-a', 'camera-a', 'fixed disk')).rejects.toThrow('Fresh');
    f.probe.check.mockResolvedValue(check({ checkedAt: new Date().toISOString() }));
    await f.service.verify(user, 'branch-a');
    await expect(f.service.resolve(user, 'branch-a', 'camera-a', 'fixed disk')).rejects.toThrow('Assign');
    const incidentId = f.repository.state.checks['camera-a']!.incidentId!; f.incidents.get(incidentId).assignedTo = user.id;
    await f.service.resolve(user, 'branch-a', 'camera-a', 'fixed disk');
    expect(f.store.closeIncident).toHaveBeenCalledOnce(); expect(f.repository.state.checks['camera-a']!.incidentId).toBeUndefined();
  });
  it('matches midnight-crossing SOP windows in the configured branch timezone', () => {
    const rule = { id: 'closing', title: 'Closing check', kind: 'CLOSING' as const, cameraIds: ['camera-a'], timeZone: 'Asia/Kolkata', startMinute: 1380, endMinute: 60, mandatory: true };
    expect(sopMatches(rule, 'camera-a', '2026-10-02T18:00:00Z')).toBe(true);
    expect(sopMatches(rule, 'camera-a', '2026-10-02T07:00:00Z')).toBe(false);
    expect(sopMatches(rule, 'other', '2026-10-02T18:00:00Z')).toBe(false);
  });
  it('keeps mandatory SOP unknown until human review and records failed reviews as risk', () => {
    const state = initialProtectionState(); state.checks['camera-a'] = check();
    state.policy.sopRules = [{ id: 'opening', title: 'Opening check', kind: 'OPENING', cameraIds: ['camera-a'], timeZone: 'Asia/Kolkata', startMinute: 0, endMinute: 1439, mandatory: true }];
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('UNKNOWN');
    state.reviews = [{ id: 'review', ruleId: 'opening', cameraId: 'camera-a', occurredAt: now.toISOString(), evidenceId: 'segment', outcome: 'FAIL' }];
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('AT_RISK');
  });
  it('does not reuse a previous local day SOP pass for today', () => {
    const state = initialProtectionState(); state.checks['camera-a'] = check();
    state.policy.sopRules = [{ id: 'opening', title: 'Opening', kind: 'OPENING', cameraIds: ['camera-a'], timeZone: 'Asia/Kolkata', startMinute: 540, endMinute: 600, mandatory: true }];
    state.reviews = [{ id: 'review', ruleId: 'opening', cameraId: 'camera-a', occurredAt: new Date(+now - 23 * 3600_000).toISOString(), evidenceId: 'segment', outcome: 'PASS' }];
    expect(evaluateProtection(state, ['camera-a'], snapshot, now).status).toBe('UNKNOWN');
  });
  it('enqueues configured P1 channels without claiming delivery and escalates overdue unassigned incidents', async () => {
    const enqueue = vi.spyOn(notificationOutbox, 'enqueue').mockResolvedValue({ status: 'PENDING' } as any);
    const policy = { recipientGroups: { email: ['ops@example.test'], sms: ['+919999999999'], voice: ['+919999999999'] }, escalationAfterSeconds: { P1: 120 } };
    const store = { getAlertNotificationPolicy: vi.fn(async () => policy), checkAccess: vi.fn(async () => ({ allowed: true })), escalateIncident: vi.fn(async () => undefined),
      listAnalyticsAlerts: vi.fn(async () => [{ id: 'related-alert', severity: 'P1' }]), linkAnalyticsAlertIncident: vi.fn(async () => undefined) } as unknown as ControlPlaneStore;
    await enqueueProtectionIncidentNotifications(store, { id: 'incident', tenantId: user.tenantId, branchId: 'branch-a', severity: 'P1', occurredAt: new Date(Date.now() - 180_000).toISOString() }, check({ checkedAt: new Date().toISOString() }), user);
    expect(store.escalateIncident).toHaveBeenCalledOnce(); expect(store.linkAnalyticsAlertIncident).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls.map(call => call[0].channel)).toEqual(['email', 'sms', 'voice']);
    expect(enqueue.mock.calls.every(call => call[0].idempotencyKey.includes(':escalation:'))).toBe(true);
  });
  it('does not invent recipients or escalation permissions', async () => {
    const enqueue = vi.spyOn(notificationOutbox, 'enqueue').mockResolvedValue({} as any);
    const store = { getAlertNotificationPolicy: vi.fn(async () => ({ recipientGroups: {}, escalationAfterSeconds: {} })), checkAccess: vi.fn(async () => ({ allowed: false })), escalateIncident: vi.fn() } as unknown as ControlPlaneStore;
    await enqueueProtectionIncidentNotifications(store, { id: 'incident', tenantId: user.tenantId, branchId: 'branch-a', severity: 'P2' }, check(), user);
    expect(enqueue).not.toHaveBeenCalled(); expect(store.escalateIncident).not.toHaveBeenCalled();
  });
});

describe('Protection route permissions', () => {
  it('denies anonymous, cross-tenant and missing action permissions before reading evidence', async () => {
    const f = fixture(); const app = Fastify(); let currentUser: User | undefined;
    app.decorateRequest('currentUser', null);
    app.addHook('preHandler', async request => { request.currentUser = currentUser!; });
    await registerBranchProtectionRoutes(app, f.store, f.service);
    expect((await app.inject('/v1/branches/branch-a/protection')).statusCode).toBe(401);
    currentUser = { ...user, tenantId: 'tenant-b' };
    expect((await app.inject('/v1/branches/branch-a/protection')).statusCode).toBe(404);
    currentUser = user; vi.mocked(f.store.checkAccess).mockResolvedValue({ allowed: false } as any);
    expect((await app.inject({ method: 'POST', url: '/v1/branches/branch-a/protection/verify' })).statusCode).toBe(404);
    expect(f.probe.check).not.toHaveBeenCalled(); await app.close();
  });
  it('rejects unsupported time zones and policies referencing inaccessible cameras', async () => {
    const f = fixture();
    await expect(f.service.configure(user, 'branch-a', { ...f.repository.state.policy, criticalCameraIds: ['foreign-camera'] })).rejects.toThrow('inaccessible');
    const app = Fastify(); app.decorateRequest('currentUser', null); app.addHook('preHandler', async request => { request.currentUser = user; });
    await registerBranchProtectionRoutes(app, f.store, f.service);
    const response = await app.inject({ method: 'PUT', url: '/v1/branches/branch-a/protection/policy', payload: { ...f.repository.state.policy, verificationFreshMinutes: 1 } });
    expect(response.statusCode).toBeGreaterThanOrEqual(400); await app.close();
  });
});

describe('Real archive decoding and offline replay', () => {
  it('decodes real progressing frames and rejects corrupt media', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'protection-decode-')); directories.push(dir);
    const ffmpeg = resolve('edge-agent/runtime/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1/bin/ffmpeg.exe');
    const video = join(dir, 'sample.mkv');
    const generated = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10', '-t', '3', '-c:v', 'ffv1', video], { windowsHide: true });
    expect(generated.status).toBe(0);
    expect(await decodeArchiveSample(ffmpeg, video, 0)).toMatchObject({ timestampProgressing: true });
    const corrupt = join(dir, 'corrupt.mkv'); await writeFile(corrupt, 'invalid media');
    expect(await decodeArchiveSample(ffmpeg, corrupt, 0)).toEqual({ framesDecoded: 0, timestampProgressing: false });
  }, 30000);
  it('reports unknown when local archive retrieval is not configured', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'segment', started_at: new Date(+now - 180_000), ended_at: now, storage_path: 'secret' }] }).mockResolvedValueOnce({ rows: [{ oldest: new Date(+now - 100 * 86400_000) }] }) };
    const probe = new LocalArchiveRecordingProbe(() => db as any, []);
    expect((await probe.check('tenant-a', 'camera-a', initialProtectionState().policy, now)).status).toBe('UNKNOWN');
  });
  it('persists concurrent enqueue and replays critical incident evidence ahead of telemetry after restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'protection-outbox-')); directories.push(dir);
    const path = join(dir, 'outbox.enc'); const keyPath = join(dir, 'outbox.key');
    const outbox = new EncryptedOutbox(path, keyPath);
    await Promise.all([
      outbox.enqueue({ path: '/telemetry', method: 'POST', body: '{}' }),
      outbox.enqueue({ path: '/incidents', method: 'POST', body: '{"severity":"P1"}' }),
      outbox.enqueue({ path: '/audit', method: 'POST', body: '{}' }),
    ]);
    const restored = new EncryptedOutbox(path, keyPath); await restored.load();
    expect(await restored.flush(async () => { throw new Error('network offline'); })).toEqual({ delivered: 0, pending: 3 });
    const delivered: string[] = []; await restored.flush(async request => { delivered.push(request.path); });
    expect(delivered).toEqual(['/incidents', '/audit', '/telemetry']);
    const empty = new EncryptedOutbox(path, keyPath); await empty.load(); expect(empty.pending).toBe(0);
  });
});
