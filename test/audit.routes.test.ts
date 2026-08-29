import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlPlaneStore } from '../src/control-plane-store.js';
import type { AuditRepository } from '../src/database/audit-repository.js';
import { registerAuditRoutes } from '../src/routes/audit.routes.js';

const user = {
  id: 'user-1', tenantId: 'tenant-1', username: 'operator', displayName: 'Operator',
  role: 'global_admin', status: 'active',
};
const branch = { id: '00000000-0000-4000-8000-000000000101', name: 'Branch 101', type: 'branch' };
const camera = {
  id: '00000000-0000-4000-8000-000000000201', name: 'Entrance',
  branchId: branch.id, nodeId: branch.id, edgeAgentId: 'edge-1', status: 'online',
};

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    listAccessibleNodes: vi.fn().mockResolvedValue([branch]),
    listCamerasByBranch: vi.fn().mockResolvedValue([camera]),
    getCamera: vi.fn().mockResolvedValue(camera),
    checkAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'role_grant' }),
    getEdgeAgent: vi.fn().mockResolvedValue({ id: 'edge-1', branchId: branch.id, status: 'online' }),
    createEdgeCommand: vi.fn().mockResolvedValue({ id: 'command-1', status: 'queued' }),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ControlPlaneStore;
}

function makeAudits(overrides: Record<string, unknown> = {}) {
  return {
    getBranchComplianceSummary: vi.fn().mockResolvedValue([]),
    listLatestCameraHealthChecks: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AuditRepository;
}

describe('audit routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify({ logger: false });
    app.decorateRequest('currentUser', null);
    app.addHook('onRequest', async (request) => {
      request.currentUser = user as typeof request.currentUser;
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('summarizes only persisted, accessible camera audit evidence', async () => {
    const audits = makeAudits({
      listLatestCameraHealthChecks: vi.fn().mockResolvedValue([{
        id: 'health-1', cameraId: camera.id, overallStatus: 'degraded',
        isOnline: true, isRecording: null, healthScore: null,
      }]),
    });
    await registerAuditRoutes(app, makeStore(), audits);

    const response = await app.inject({ method: 'GET', url: '/v1/audit/health?summary=true' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        totalCameras: 1,
        assessedCameras: 1,
        unassessedCameras: 0,
        onlineCameras: 1,
        recordingCameras: 0,
        healthyCameras: 0,
        warningCameras: 0,
        degradedCameras: 1,
        criticalCameras: 0,
        offlineCameras: 0,
        avgHealthScore: null,
      },
    });
  });

  it('does not expose audit rows for a camera removed by camera-level access rules', async () => {
    const audits = makeAudits({
      listLatestCameraHealthChecks: vi.fn().mockResolvedValue([
        { id: 'allowed', cameraId: camera.id, overallStatus: 'healthy' },
        { id: 'blocked', cameraId: '00000000-0000-4000-8000-000000000999', overallStatus: 'healthy' },
      ]),
    });
    await registerAuditRoutes(app, makeStore(), audits);

    const response = await app.inject({ method: 'GET', url: '/v1/audit/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ id: 'allowed' }], total: 1 });
  });

  it('queues a real edge camera probe for a manual health check', async () => {
    const store = makeStore();
    await registerAuditRoutes(app, store, makeAudits());

    const response = await app.inject({
      method: 'POST',
      url: '/v1/audit/health/check',
      payload: { cameraId: camera.id },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'queued', queued: 1, unavailable: 0 });
    expect(store.createEdgeCommand).toHaveBeenCalledWith({
      edgeAgentId: 'edge-1', type: 'probe-camera', payload: { cameraId: camera.id }, requestedBy: user.id,
    });
  });

  it('reports an unavailable probe instead of claiming a check was started', async () => {
    const store = makeStore({ getEdgeAgent: vi.fn().mockResolvedValue({ id: 'edge-1', branchId: branch.id, status: 'offline' }) });
    await registerAuditRoutes(app, store, makeAudits());

    const response = await app.inject({
      method: 'POST',
      url: '/v1/audit/health/check',
      payload: { cameraId: camera.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'edge_probe_unavailable' });
    expect(store.createEdgeCommand).not.toHaveBeenCalled();
  });

  it('scopes branch compliance queries to accessible branches', async () => {
    const getBranchComplianceSummary = vi.fn().mockResolvedValue([{ branchId: branch.id }]);
    await registerAuditRoutes(app, makeStore(), makeAudits({ getBranchComplianceSummary }));

    const response = await app.inject({ method: 'GET', url: '/v1/audit/branch-compliance' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ branchId: branch.id }] });
    expect(getBranchComplianceSummary).toHaveBeenCalledWith(user.tenantId, branch.id);
  });
});
