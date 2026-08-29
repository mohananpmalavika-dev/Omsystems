import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

describe('maintenance routes (basic)', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ logger: false, store });

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
});
