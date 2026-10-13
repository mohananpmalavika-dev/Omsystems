import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerAnprLogisticsRoutes } from '../src/routes/anpr-logistics.routes.js';
import { operationalSqlApp } from './fixtures/operational-sql-app.js';
import { fixtureUuid } from './fixtures/sql-identity.js';

describe('ANPR logistics PostgreSQL contract', () => {
  let ctx: Awaited<ReturnType<typeof operationalSqlApp>>;
  beforeEach(async () => { ctx = await operationalSqlApp('anpr', registerAnprLogisticsRoutes); });
  afterEach(async () => { await ctx?.close(); });
  const create = (extra = {}) => ctx.app.inject({ method: 'POST', url: '/v1/logistics/anpr-sessions', payload: {
    branchId: ctx.branchId, vehiclePlate: 'QA 01 AB 1234', vehicleType: 'cash_van', scheduledArrival: new Date(Date.now() + 3600000).toISOString(), ...extra } });
  const detection = (sessionId: string, confidence = 0.9) => ctx.app.inject({ method: 'POST', url: '/v1/logistics/anpr-detections', payload: {
    sessionId, cameraId: fixtureUuid('anpr-camera'), cameraName: 'QA gate', location: 'Gate', confidence, snapshotPath: 'qa/gate.jpg' } });
  it('creates, persists and lists a session with consistent API fields', async () => {
    const response = await create(); expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({ branchId: ctx.branchId, vehiclePlate: 'QA 01 AB 1234', status: 'on_route' });
    const saved = await ctx.pool.query('SELECT vehicle_plate FROM anpr_logistics_sessions WHERE id=$1', [response.json().data.id]);
    expect(saved.rows[0].vehicle_plate).toBe('QA 01 AB 1234');
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/logistics/anpr-sessions' });
    expect(list.statusCode, list.body).toBe(200); expect(list.json().data).toHaveLength(1);
    expect(list.json().summary.activeSessions).toBe(1);
  });
  it('rejects invalid sessions and empty updates', async () => {
    expect((await create({ vehicleType: 'invalid' })).statusCode).toBe(400);
    expect((await create({ scheduledArrival: 'tomorrow' })).statusCode).toBe(400);
    const session = await create();
    expect((await ctx.app.inject({ method: 'PATCH', url: `/v1/logistics/anpr-sessions/${session.json().data.id}`, payload: {} })).statusCode).toBe(400);
  });
  it('denies read-only, suspended and foreign-branch submissions', async () => {
    expect((await create({ branchId: fixtureUuid('foreign-branch') })).statusCode).toBe(404);
    ctx.setRole('viewer'); expect((await create()).statusCode).toBe(403);
    ctx.setRole(''); expect((await create()).statusCode).toBe(403);
    ctx.setRole('operator'); ctx.setStatus('suspended'); expect((await create()).statusCode).toBe(401);
  });
  it('filters branch and status and respects result limits', async () => {
    await create(); const other = await create({ branchId: ctx.otherBranchId });
    await ctx.app.inject({ method: 'PATCH', url: `/v1/logistics/anpr-sessions/${other.json().data.id}`, payload: { status: 'arrived' } });
    const list = await ctx.app.inject({ method: 'GET', url: `/v1/logistics/anpr-sessions?branchId=${ctx.branchId}&status=on_route&limit=1` });
    expect(list.statusCode, list.body).toBe(200); expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].branchId).toBe(ctx.branchId);
  });
  it('computes dwell time from persisted arrival and departure', async () => {
    const session = await create();
    const response = await ctx.app.inject({ method: 'PATCH', url: `/v1/logistics/anpr-sessions/${session.json().data.id}`, payload: {
      status: 'departed', actualArrival: '2026-10-13T10:00:00Z', departureTime: '2026-10-13T10:30:00Z' } });
    expect(response.statusCode, response.body).toBe(200); expect(response.json().data.dwellTimeMinutes).toBe(30);
  });
  it('persists timestamped detections and retains the highest confidence', async () => {
    const session = await create(); const id = session.json().data.id;
    const response = await detection(id); expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data.detectedAt).toBeDefined(); await detection(id, 0.6);
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/logistics/anpr-sessions' });
    expect(list.json().data[0].detectionPoints).toHaveLength(2); expect(list.json().data[0].confidence).toBe(0.9);
  });
  it('persists violations and updates compliance', async () => {
    const session = await create();
    const response = await ctx.app.inject({ method: 'POST', url: '/v1/logistics/anpr-violations', payload: {
      sessionId: session.json().data.id, violationCode: 'ROUTE_DEVIATION', severity: 'critical', message: 'Unexpected route' } });
    expect(response.statusCode, response.body).toBe(201); expect(response.json().data.detectedAt).toBeDefined();
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/logistics/anpr-sessions' });
    expect(list.json().data[0].routeCompliance).toBe('route_deviation'); expect(list.json().summary.criticalViolations).toBe(1);
  });
  it('marks overdue sessions once and records one schedule violation', async () => {
    const session = await create({ scheduledArrival: new Date(Date.now() - 3600000).toISOString() });
    const first = await ctx.app.inject({ method: 'POST', url: '/v1/logistics/check-overdue' });
    expect(first.statusCode, first.body).toBe(200); expect(first.json().overdueCount).toBe(1);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/logistics/check-overdue' })).json().overdueCount).toBe(0);
    expect((await ctx.pool.query('SELECT count(*)::int AS count FROM anpr_logistics_violations WHERE session_id=$1', [session.json().data.id])).rows[0].count).toBe(1);
  });
  it('reports real aggregate summary values', async () => {
    await create(); await create({ scheduledArrival: new Date(Date.now() - 3600000).toISOString() });
    await ctx.app.inject({ method: 'POST', url: '/v1/logistics/check-overdue' });
    const response = await ctx.app.inject({ method: 'GET', url: '/v1/logistics/anpr-sessions/summary' });
    expect(response.statusCode, response.body).toBe(200); expect(response.json().data).toMatchObject({ totalVehicles: 2, overdue: 1 });
  });
  it('hides another tenant sessions and blocks child writes and updates', async () => {
    const session = await create(); const id = session.json().data.id; ctx.switchTenant();
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/logistics/anpr-sessions' });
    expect(list.statusCode, list.body).toBe(200); expect(list.json().data).toEqual([]);
    expect((await detection(id)).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/v1/logistics/anpr-sessions/${id}`, payload: { status: 'arrived' } })).statusCode).toBe(404);
  });
});
