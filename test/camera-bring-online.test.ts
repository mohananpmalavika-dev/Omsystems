import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MemoryStore } from '../src/store.js';
import { registerOperationalHealthRoutes } from '../src/routes/operational-health.routes.js';

describe('Make online requests verified camera recovery', () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;
  beforeEach(async () => {
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent('branch-blr-001', 'Camera recovery gateway', '1.0.0');
    agentId = agent.id;
    await store.heartbeatEdgeAgent(agentId, '1.0.0');
    const camera = store.cameras.get('cam-001')!;
    camera.branchId = 'branch-blr-001';
    camera.edgeAgentId = agentId;
    camera.status = 'offline';
    store.nodes.get(camera.nodeId)!.path = ['company-1', 'division-retail', 'region-south', 'branch-blr-001', camera.nodeId];
    app = Fastify();
    app.addHook('preHandler', async request => {
      request.currentUser = (await store.getUser(String(request.headers['x-user-id'] || 'user-global-admin')))!;
    });
    await registerOperationalHealthRoutes(app, store);
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  const request = { method: 'POST' as const, url: '/v1/operations/health/cameras/bring-online', payload: { cameraId: 'cam-001' } };

  it('queues a real edge recovery without changing status or inventing telemetry', async () => {
    const update = vi.spyOn(store, 'updateCameraStatus');
    const ingest = vi.spyOn(store, 'ingestOperationalTelemetry');
    const response = await app.inject(request);
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ queuedCount: 1, cameraIds: ['cam-001'], skipped: [] });
    expect(response.json().message).toContain('verifies the stream');
    expect((await store.listEdgeCommands('branch-blr-001'))[0]).toMatchObject({
      type: 'recover-camera', edgeAgentId: agentId, payload: { cameraId: 'cam-001', branchId: 'branch-blr-001' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
    expect((await store.getCamera('cam-001'))!.status).toBe('offline');
  });

  it('reports the missing database migration without returning 500 or forcing online', async () => {
    vi.spyOn(store, 'createEdgeCommand').mockRejectedValue(Object.assign(new Error('check constraint violation'), {
      code: '23514', constraint: 'edge_commands_command_type_check',
    }));
    const response = await app.inject(request);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, error: 'camera_recovery_schema_update_required', requiredMigration: '20261006_edge_camera_recovery_commands.sql' });
    expect(response.json().message).toContain('database needs an update');
    expect((await store.getCamera('cam-001'))!.status).toBe('offline');
  });

  it('preserves queued bulk requests when another camera encounters the schema constraint', async () => {
    const original = store.cameras.get('cam-001')!;
    store.cameras.set('recovery-second', { ...original, id: 'recovery-second', name: 'Second camera' });
    const create = store.createEdgeCommand.bind(store);
    vi.spyOn(store, 'createEdgeCommand').mockImplementation(input => input.payload.cameraId === 'recovery-second'
      ? Promise.reject(Object.assign(new Error('check constraint violation'), { code: '23514', constraint: 'edge_commands_command_type_check' }))
      : create(input));
    const response = await app.inject({ ...request, payload: { branchId: 'branch-blr-001' } });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ queuedCount: 1, cameraIds: ['cam-001'], skipped: [{ cameraId: 'recovery-second', error: 'camera_recovery_schema_update_required' }] });
  });

  it('prioritizes the database update error when a bulk request also has an unassigned camera', async () => {
    const original = store.cameras.get('cam-001')!;
    store.cameras.set('recovery-assigned', { ...original, id: 'recovery-assigned', name: 'Assigned camera' });
    original.edgeAgentId = undefined;
    vi.spyOn(store, 'createEdgeCommand').mockRejectedValue(Object.assign(new Error('check constraint violation'), {
      code: '23514', constraint: 'edge_commands_command_type_check',
    }));
    const response = await app.inject({ ...request, payload: { branchId: 'branch-blr-001' } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('camera_recovery_schema_update_required');
    expect(response.json().message).toContain('database needs an update');
    expect(response.json().data.skipped).toHaveLength(2);
  });

  it('does not mask a different database failure as a missing migration', async () => {
    vi.spyOn(store, 'createEdgeCommand').mockRejectedValue(Object.assign(new Error('different constraint'), {
      code: '23514', constraint: 'edge_commands_status_check',
    }));
    expect((await app.inject(request)).statusCode).toBe(500);
  });

  it('reuses a pending recovery when the operator retries', async () => {
    const first = (await app.inject(request)).json();
    const second = (await app.inject(request)).json();
    expect(second.data.commands[0].id).toBe(first.data.commands[0].id);
    expect(await store.listEdgeCommands('branch-blr-001')).toHaveLength(1);
  });

  it('rejects an offline, stale, or revoked gateway without claiming camera recovery', async () => {
    const agent = store.edgeAgents.get(agentId)!;
    for (const state of [
      { status: 'offline' as const, lastSeenAt: new Date().toISOString(), credentialStatus: 'active' as const },
      { status: 'online' as const, lastSeenAt: new Date(Date.now() - 91_000).toISOString(), credentialStatus: 'active' as const },
      { status: 'online' as const, lastSeenAt: new Date().toISOString(), credentialStatus: 'revoked' as const },
    ]) {
      Object.assign(agent, state);
      expect((await app.inject(request)).statusCode).toBe(409);
    }
    expect(await store.listEdgeCommands('branch-blr-001')).toHaveLength(0);
    expect((await store.getCamera('cam-001'))!.status).toBe('offline');
  });

  it('reports an unassigned camera and rejects a different branch', async () => {
    store.cameras.get('cam-001')!.edgeAgentId = undefined;
    const response = await app.inject(request);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('camera_recovery_requires_edge_agent');
    expect((await app.inject({ ...request, payload: { cameraId: 'cam-001', branchId: 'A005' } })).statusCode).toBe(404);
  });

  it('requires configuration permission for both single and bulk recovery', async () => {
    for (const payload of [{ cameraId: 'cam-001' }, { branchId: 'branch-blr-001' }]) {
      const response = await app.inject({ ...request, headers: { 'x-user-id': 'user-south-operator' }, payload });
      expect(response.statusCode).toBe(403);
    }
    expect(await store.listEdgeCommands('branch-blr-001')).toHaveLength(0);
  });

  it('queues eligible cameras and reports missing gateway assignments in a bulk request', async () => {
    const original = store.cameras.get('cam-001')!;
    store.cameras.set('recovery-unassigned', { ...original, id: 'recovery-unassigned', name: 'Unassigned camera', edgeAgentId: undefined });
    const response = await app.inject({ ...request, payload: { branchId: 'branch-blr-001' } });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ queuedCount: 1, skipped: [{ cameraId: 'recovery-unassigned', error: 'camera_recovery_requires_edge_agent' }] });
    expect(response.json().message).toContain('could not be queued');
  });

  it('keeps authoritative health offline while queued and updates only from actual edge evidence', async () => {
    const camera = store.cameras.get('cam-001')!;
    const branch = (await store.getNode(camera.branchId))!;
    const observedAt = new Date().toISOString();
    await store.ingestOperationalTelemetry({
      tenantId: branch.tenantId, branchId: branch.id, edgeAgentId: agentId,
      deviceType: 'camera', deviceId: camera.id, source: 'rtsp', quality: 'verified',
      observedAt, receivedAt: observedAt, idempotencyKey: 'real-offline',
      metrics: { status: 'offline', streamActive: false }, reasonCodes: ['rtsp_unreachable'],
    });
    await app.inject(request);
    const offline = (await app.inject({ url: '/v1/operations/health/cameras?branchId=branch-blr-001' })).json().data.cameras[0];
    expect(offline.onlineStatus).toBe('offline');
    const verified = await app.inject({ method: 'POST', url: `/v1/edge-agents/${agentId}/telemetry`, payload: {
      branchId: branch.id, edgeAgentId: agentId, deviceType: 'camera', deviceId: camera.id,
      source: 'rtsp', quality: 'verified', observedAt: new Date(Date.now() + 1).toISOString(),
      idempotencyKey: 'real-recovery', metrics: { status: 'online', streamActive: true }, reasonCodes: ['rtsp_reconnect_succeeded'],
    } });
    expect(verified.statusCode).toBe(202);
    const online = (await app.inject({ url: '/v1/operations/health/cameras?branchId=branch-blr-001' })).json().data.cameras[0];
    expect(online).toMatchObject({ onlineStatus: 'online', streamAvailable: true });
    expect(online.currentFps).toBeNull();
    expect(camera.status).toBe('online');
  });
});
