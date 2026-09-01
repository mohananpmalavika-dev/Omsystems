import { afterAll, describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

describe('maintenance routes (basic)', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ logger: false, store });

  afterAll(async () => {
    await app.close();
  });

  it('creates and lists an asset', async () => {
    const create = await app.inject({ method: 'POST', url: '/v1/maintenance/assets', payload: { category: 'camera', assetType: 'dome', make: 'ACME', model: 'D1' }, headers: { 'x-user-id': 'user-global-admin' } });
    expect(create.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/v1/maintenance/assets', headers: { 'x-user-id': 'user-global-admin' } });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('returns work orders in the dashboard data envelope', async () => {
    const headers = { 'x-user-id': 'user-global-admin' };
    const create = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/workorders',
      headers,
      payload: {
        workOrderNumber: 'WO-MAINT-001',
        problem: 'Camera 12 requires a lens inspection.',
        severity: 'high',
        status: 'open',
      },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/v1/maintenance/workorders', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      data: [expect.objectContaining({
        workOrderNumber: 'WO-MAINT-001',
        problem: 'Camera 12 requires a lens inspection.',
        severity: 'high',
        status: 'open',
      })],
    });
  });

  it('generates a work-order number for dashboard submissions', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/workorders',
      headers: { 'x-user-id': 'user-global-admin' },
      payload: {
        problem: 'Recorder requires an urgent storage controller inspection.',
        severity: 'critical',
        eta: '2026-08-30T05:30:00.000Z',
      },
    });

    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      problem: 'Recorder requires an urgent storage controller inspection.',
      severity: 'critical',
      status: 'open',
    });
    expect(create.json().workOrderNumber).toMatch(/^WO-\d{8}-[A-F0-9]{8}$/);
  });

  it('does not expose another tenant work order by identifier', async () => {
    const foreign = await store.createWorkOrder({
      tenantId: 'tenant-foreign',
      workOrderNumber: 'WO-FOREIGN-001',
      problem: 'This work order belongs to a different tenant.',
      severity: 'low',
      createdBy: 'foreign-user',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/maintenance/workorders/${foreign.id}`,
      headers: { 'x-user-id': 'user-global-admin' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'workorder_not_found' });
  });

  it('exports only work orders matching the requested filters', async () => {
    const headers = { 'x-user-id': 'user-global-admin' };
    await store.createWorkOrder({
      tenantId: 'omsystems',
      workOrderNumber: 'WO-EXPORT-CLOSED',
      branchNodeId: 'A005',
      problem: 'Closed export verification work order.',
      severity: 'low',
      status: 'closed',
      createdBy: 'user-global-admin',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/work-orders?status=closed&severity=low&branchNodeId=A005',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain('WO-EXPORT-CLOSED');
    expect(response.body).not.toContain('WO-MAINT-001');
  });

  it('exports real camera and storage inventory and enforces maintenance scope', async () => {
    const headers = { 'x-user-id': 'user-global-admin' };
    await store.upsertRecordingStorageNode({
      tenantId: 'omsystems',
      externalId: 'storage-a005-export',
      name: 'A005 Recorder Storage',
      scopeNodeId: 'A005',
      supportedTiers: ['hot'],
      capacityBytes: 2 * 1024 ** 3,
      usedBytes: 1024 ** 3,
      availableBytes: 1024 ** 3,
      status: 'healthy',
    });

    const cameras = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/camera-health?branchNodeId=A005',
      headers,
    });
    expect(cameras.statusCode).toBe(200);
    expect(cameras.body).toContain('Main Entrance Camera');
    expect(cameras.body).toContain('1920x1080');

    const storage = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/storage-health?branchNodeId=A005',
      headers,
    });
    expect(storage.statusCode).toBe(200);
    expect(storage.body).toContain('A005 Recorder Storage');
    expect(storage.body).toContain('50.00');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/camera-health?branchNodeId=A005',
      headers: { 'x-user-id': 'user-branch-manager' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('scopes alert exports to cameras the operator can export', async () => {
    const a005 = [...store.cameras.values()].find((camera) => camera.branchId === 'A005');
    const a006 = [...store.cameras.values()].find((camera) => camera.branchId === 'A006');
    expect(a005).toBeDefined();
    expect(a006).toBeDefined();
    const now = new Date().toISOString();
    const alert = (id: string, cameraId: string, title: string) => ({
      id,
      tenantId: 'omsystems',
      cameraId,
      ruleId: `rule-${id}`,
      eventId: `event-${id}`,
      title,
      severity: 'P1' as const,
      status: 'new' as const,
      confidence: 0.99,
      objectClasses: ['person'],
      modelVersion: 'local-test',
      firstDetectedAt: now,
      lastDetectedAt: now,
      occurrenceCount: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    store.analyticsAlerts.push(
      alert('alert-a005-export', a005!.id, 'A005 Critical Export Alert'),
      alert('alert-a006-export', a006!.id, 'A006 Hidden Alert'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/alerts?severity=critical&status=active',
      headers: { 'x-user-id': 'user-branch-manager' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('A005 Critical Export Alert');
    expect(response.body).not.toContain('A006 Hidden Alert');
  });

  it('rejects invalid ranges and protects custom CSV filenames and formula cells', async () => {
    const headers = { 'x-user-id': 'user-global-admin' };
    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/maintenance/export/work-orders?startDate=2026-09-02T00%3A00%3A00.000Z&endDate=2026-09-01T00%3A00%3A00.000Z',
      headers,
    });
    expect(invalid.statusCode).toBe(400);

    const custom = await app.inject({
      method: 'POST',
      url: '/v1/maintenance/export/custom',
      headers,
      payload: {
        filename: '../unsafe-export',
        data: [{ value: '=SUM(1,2)' }],
      },
    });
    expect(custom.statusCode).toBe(200);
    expect(custom.headers['content-disposition']).toContain('filename="unsafe-export.csv"');
    expect(custom.body).toContain("'=SUM(1,2)");
  });
});
