import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

describe('maintenance routes (basic)', async () => {
  const app = await buildApp({ logger: false, store: new MemoryStore() });

  it('creates and lists an asset', async () => {
    const create = await app.inject({ method: 'POST', url: '/v1/maintenance/assets', payload: { category: 'camera', assetType: 'dome', make: 'ACME', model: 'D1' }, headers: { 'x-user-id': 'user-global-admin' } });
    expect(create.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/v1/maintenance/assets', headers: { 'x-user-id': 'user-global-admin' } });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
