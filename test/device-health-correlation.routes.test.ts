import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDeviceHealthCorrelationRoutes } from '../src/routes/device-health-correlation.routes.js';
import { operationalSqlApp } from './fixtures/operational-sql-app.js';
import { fixtureUuid } from './fixtures/sql-identity.js';

describe('Device health PostgreSQL contract', () => {
  let ctx: Awaited<ReturnType<typeof operationalSqlApp>>;
  beforeEach(async () => { ctx = await operationalSqlApp('health', registerDeviceHealthCorrelationRoutes); });
  afterEach(async () => { await ctx?.close(); });
  const snapshot = (branchId: string) => ({ branchId,
    cameras: { total: 10, online: 10, recording: 10, healthy: 10, warning: 0, critical: 0, offline: 0 },
    recorders: { total: 2, online: 2, healthy: 2, degraded: 0, full: 0, offline: 0 },
    network: { latencyMs: 25, packetLoss: 0.1, bandwidthMbps: 950 },
    power: { upsOnline: true, batteryPercent: 95, powerOutages24h: 0 } });
  const capture = (payload = snapshot(ctx.branchId)) => ctx.app.inject({ method: 'POST', url: '/v1/security/device-health/snapshot', payload });

  it('persists branch identity, metrics and a readable healthy snapshot', async () => {
    const response = await capture();
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({ branchId: ctx.branchId, deviceType: 'branch', overallHealth: 'healthy' });
    const saved = await ctx.pool.query('SELECT metrics, device_id FROM device_health_snapshots WHERE id=$1', [response.json().data.id]);
    expect(saved.rows[0].metrics).toEqual(snapshot(ctx.branchId));
    expect(saved.rows[0].device_id).toBe(`branch:${ctx.branchId}`);
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/security/device-health' });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().summary).toMatchObject({ totalBranches: 1, healthyBranches: 1 });
    expect(list.json().data[0].cameras.healthScore).toBe(100);
  });
  it('rejects incomplete and foreign-branch submissions without writing', async () => {
    expect((await capture({ branchId: ctx.branchId } as any)).statusCode).toBe(400);
    expect((await capture(snapshot(fixtureUuid('unknown-branch')))).statusCode).toBe(404);
    expect((await ctx.pool.query('SELECT count(*)::int AS count FROM device_health_snapshots WHERE tenant_id=$1', [ctx.tenantId])).rows[0].count).toBe(0);
  });
  it('denies read-only and suspended writes and foreign-branch issues', async () => {
    const issue = await ctx.app.inject({ method: 'POST', url: '/v1/security/device-health/issues', payload: {
      branchId: fixtureUuid('foreign-branch'), deviceType: 'camera', message: 'Offline' } });
    expect(issue.statusCode).toBe(404);
    ctx.setRole('auditor'); expect((await capture()).statusCode).toBe(403);
    ctx.setRole('operator'); ctx.setStatus('suspended'); expect((await capture()).statusCode).toBe(401);
  });
  it('treats an offline UPS and offline cameras as critical', async () => {
    const payload = snapshot(ctx.branchId);
    payload.power.upsOnline = false;
    payload.cameras.online = 9; payload.cameras.offline = 1; payload.cameras.healthy = 9; payload.cameras.recording = 9;
    const response = await capture(payload);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data.overallHealth).toBe('critical');
  });
  it.each(['power_camera_correlation', 'network_recorder_correlation', 'storage_recording_correlation'])('persists %s from actual snapshot metrics', async kind => {
    const payload = snapshot(ctx.branchId);
    if (kind === 'power_camera_correlation') { payload.power.upsOnline = false; payload.cameras.offline = 1; payload.cameras.online = 9; payload.cameras.recording = 9; payload.cameras.healthy = 9; }
    if (kind === 'network_recorder_correlation') { payload.network.latencyMs = 250; payload.recorders.degraded = 1; payload.recorders.healthy = 1; }
    if (kind === 'storage_recording_correlation') { payload.recorders.full = 1; payload.recorders.healthy = 1; payload.cameras.recording = 8; }
    const response = await capture(payload);
    expect(response.statusCode, response.body).toBe(201);
    const saved = await ctx.pool.query('SELECT event_type FROM device_correlated_events WHERE tenant_id=$1', [ctx.tenantId]);
    expect(saved.rows.map(row => row.event_type)).toContain(kind);
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/security/device-health' });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data[0].correlatedEvents[0].type).toBe(kind);
  });
  it('uses the newest snapshot and honours branch filters', async () => {
    const older = await capture(); await capture(snapshot(ctx.otherBranchId));
    await ctx.pool.query("UPDATE device_health_snapshots SET snapshot_time=now()-interval '1 hour' WHERE id=$1", [older.json().data.id]);
    const current = snapshot(ctx.branchId); current.network.latencyMs = 200;
    await capture(current);
    const list = await ctx.app.inject({ method: 'GET', url: `/v1/security/device-health?branchId=${ctx.branchId}` });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].network.latencyMs).toBe(200);
  });
  it('persists and resolves issues with the real actor', async () => {
    await capture();
    const issue = await ctx.app.inject({ method: 'POST', url: '/v1/security/device-health/issues', payload: {
      branchId: ctx.branchId, deviceType: 'camera', deviceId: 'qa-camera', severity: 'critical', message: 'Camera disconnected' } });
    expect(issue.statusCode, issue.body).toBe(201);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/security/device-health' })).json().data[0].criticalIssues).toHaveLength(1);
    const resolved = await ctx.app.inject({ method: 'PATCH', url: `/v1/security/device-health/issues/${issue.json().data.id}/resolve` });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json().data).toMatchObject({ resolved: true, resolvedBy: ctx.userId });
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/security/device-health' })).json().data[0].criticalIssues).toHaveLength(0);
  });
  it('cannot read or resolve another tenant data', async () => {
    await capture();
    const issue = await ctx.app.inject({ method: 'POST', url: '/v1/security/device-health/issues', payload: { branchId: ctx.branchId, deviceType: 'camera', message: 'Offline' } });
    ctx.switchTenant();
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/security/device-health' });
    expect(list.statusCode, list.body).toBe(200); expect(list.json().data).toEqual([]);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/v1/security/device-health/issues/${issue.json().data.id}/resolve` })).statusCode).toBe(404);
  });
});
