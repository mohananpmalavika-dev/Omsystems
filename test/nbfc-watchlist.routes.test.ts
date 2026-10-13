import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerNbfcWatchlistRoutes } from '../src/routes/nbfc-watchlist.routes.js';
import { operationalSqlApp } from './fixtures/operational-sql-app.js';
import { fixtureUuid } from './fixtures/sql-identity.js';

describe('Watchlist PostgreSQL contract', () => {
  let ctx: Awaited<ReturnType<typeof operationalSqlApp>>;
  beforeEach(async () => { ctx = await operationalSqlApp('watchlist', registerNbfcWatchlistRoutes); });
  afterEach(async () => { await ctx?.close(); });
  const create = (extra = {}) => ctx.app.inject({ method: 'POST', url: '/v1/watchlist/nbfc', payload: {
    fullName: 'QA Operator', watchlistType: 'authorized', branchIds: [ctx.branchId], areaAccess: ['vault'],
    validFrom: new Date().toISOString(), reason: 'Isolated QA authorization', ...extra } });
  const detect = (watchlistEntryId: string, extra = {}) => ctx.app.inject({ method: 'POST', url: '/v1/watchlist/nbfc/detections', payload: {
    watchlistEntryId, cameraId: fixtureUuid('watchlist-camera'), cameraName: 'QA gate', branchId: ctx.branchId, confidence: 0.95, ...extra } });
  it.each(['authorized', 'visitor', 'vip'])('persists and retrieves %s entries', async watchlistType => {
    const response = await create({ watchlistType }); expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({ fullName: 'QA Operator', watchlistType, addedBy: ctx.userId });
    const saved = await ctx.pool.query('SELECT branch_ids, area_access FROM nbfc_watchlist_entries WHERE id=$1', [response.json().data.id]);
    expect(saved.rows[0]).toEqual({ branch_ids: [ctx.branchId], area_access: ['vault'] });
    const detail = await ctx.app.inject({ method: 'GET', url: `/v1/watchlist/nbfc/${response.json().data.id}` });
    expect(detail.statusCode, detail.body).toBe(200); expect(detail.json().data.watchlistType).toBe(watchlistType);
  });
  it('requires face enrollment for blacklist entries and validates area access', async () => {
    const blacklist = await create({ watchlistType: 'blacklist' });
    expect(blacklist.statusCode).toBe(400); expect(blacklist.json().error).toBe('face_enrollment_required');
    expect((await create({ areaAccess: ['invalid-zone'] })).statusCode).toBe(400);
    expect((await create({ watchlistType: 'blacklist', faceEnrolled: true })).statusCode).toBe(201);
  });
  it('denies read-only and suspended writes and foreign-branch entries', async () => {
    expect((await create({ branchIds: [fixtureUuid('foreign-branch')] })).statusCode).toBe(404);
    ctx.setRole('viewer'); expect((await create()).statusCode).toBe(403);
    ctx.setRole('operator'); ctx.setStatus('suspended'); expect((await create()).statusCode).toBe(401);
  });
  it('keeps the last detection fields from the same newest row', async () => {
    const entry = await create(); const id = entry.json().data.id;
    const older = await detect(id, { cameraName: 'Z Old camera', confidence: 0.99 });
    await ctx.pool.query("UPDATE nbfc_watchlist_detections SET detected_at=now()-interval '1 hour' WHERE id=$1", [older.json().data.id]);
    await detect(id, { cameraName: 'A New camera', confidence: 0.75 });
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/watchlist/nbfc' });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data[0].lastDetected).toMatchObject({ cameraName: 'A New camera', confidence: 0.75 });
  });
  it('filters type, status, search and branch against stored values', async () => {
    await create(); await create({ fullName: 'Other Visitor', watchlistType: 'visitor', branchIds: [ctx.otherBranchId] });
    const response = await ctx.app.inject({ method: 'GET', url: `/v1/watchlist/nbfc?type=authorized&status=active&search=Operator&branchId=${ctx.branchId}` });
    expect(response.statusCode, response.body).toBe(200); expect(response.json().data).toHaveLength(1);
    expect(response.json().summary).toMatchObject({ authorizedPersons: 1, activeEntries: 1 });
  });
  it('updates persisted access and rejects empty updates', async () => {
    const entry = await create(); const url = `/v1/watchlist/nbfc/${entry.json().data.id}`;
    expect((await ctx.app.inject({ method: 'PATCH', url, payload: {} })).statusCode).toBe(400);
    const response = await ctx.app.inject({ method: 'PATCH', url, payload: { status: 'suspended', areaAccess: ['atm'], notes: 'QA suspension' } });
    expect(response.statusCode, response.body).toBe(200); expect(response.json().data).toMatchObject({ status: 'suspended', areaAccess: ['atm'] });
    expect((await ctx.app.inject({ method: 'GET', url })).json().data.notes).toBe('QA suspension');
  });
  it('persists timestamped detections and exposes actual detection counts', async () => {
    const entry = await create(); const id = entry.json().data.id;
    const response = await detect(id); expect(response.statusCode, response.body).toBe(201); expect(response.json().data.detectedAt).toBeDefined();
    const detections = await ctx.app.inject({ method: 'GET', url: `/v1/watchlist/nbfc/${id}/detections` });
    expect(detections.statusCode, detections.body).toBe(200); expect(detections.json().data).toHaveLength(1);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/watchlist/nbfc' })).json().data[0].detectionCount24h).toBe(1);
  });
  it('does not claim an alert was created by an unconfigured integration', async () => {
    const entry = await create({ watchlistType: 'blacklist', faceEnrolled: true });
    const response = await detect(entry.json().data.id); expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ alert: false, alertRequired: true, alertStatus: 'unconfigured' });
  });
  it('expires old entries once', async () => {
    await create({ validFrom: new Date(Date.now() - 7200000).toISOString(), validUntil: new Date(Date.now() - 3600000).toISOString() });
    const first = await ctx.app.inject({ method: 'POST', url: '/v1/watchlist/nbfc/check-expired' });
    expect(first.statusCode, first.body).toBe(200); expect(first.json().expiredCount).toBe(1);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/watchlist/nbfc/check-expired' })).json().expiredCount).toBe(0);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/watchlist/nbfc?status=expired' })).json().data[0].status).toBe('expired');
  });
  it('deletes entries and their detections', async () => {
    const entry = await create(); const id = entry.json().data.id; await detect(id);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/v1/watchlist/nbfc/${id}` })).statusCode).toBe(200);
    expect((await ctx.pool.query('SELECT count(*)::int AS count FROM nbfc_watchlist_detections WHERE watchlist_entry_id=$1', [id])).rows[0].count).toBe(0);
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/watchlist/nbfc/${id}` })).statusCode).toBe(404);
  });
  it('hides another tenant records and denies all mutations by ID', async () => {
    const entry = await create(); const id = entry.json().data.id; ctx.switchTenant();
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/watchlist/nbfc' }); expect(list.statusCode, list.body).toBe(200); expect(list.json().data).toEqual([]);
    expect((await detect(id)).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/watchlist/nbfc/${id}/detections` })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/v1/watchlist/nbfc/${id}`, payload: { status: 'suspended' } })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/v1/watchlist/nbfc/${id}` })).statusCode).toBe(404);
  });
});
