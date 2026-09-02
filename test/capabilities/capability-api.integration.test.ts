import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerCapabilitiesRoutes } from '../../src/routes/capabilities.routes.js';
import { requireCapability } from '../../src/middleware/capability-guard.middleware.js';
import { getCapabilityRegistry } from '../../src/capabilities/capability-registry.js';
import { CapabilityMaturity, CapabilityRuntimeState } from '../../packages/contracts/src/capabilities/capability-types.js';

describe('Capabilities API Integration & Route Protection Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await registerCapabilitiesRoutes(app);

    // Register a test route protected by requireCapability
    app.get(
      '/test/protected/live-view',
      { preHandler: [requireCapability('video.live_view')] },
      async () => ({ status: 'live_view_active' })
    );

    app.get(
      '/test/protected/tpm',
      { preHandler: [requireCapability('security.tpm_attestation')] },
      async () => ({ status: 'tpm_active' })
    );

    app.get(
      '/test/protected/experimental',
      { preHandler: [requireCapability('analytics.face_recognition')] },
      async () => ({ status: 'face_recognition_active' })
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/capabilities returns all capabilities and summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/capabilities',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.capabilities)).toBe(true);
    expect(body.capabilities.length).toBeGreaterThan(50);
    expect(body.summary).toBeDefined();
    expect(body.summary.total).toBe(body.capabilities.length);
  });

  it('GET /v1/capabilities/summary returns structured metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/summary',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.summary.byMaturity.production).toBeGreaterThan(0);
    expect(body.summary.byCategory.VIDEO).toBeGreaterThan(0);
  });

  it('GET /v1/capabilities/:id returns specific capability with usability check', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/video.live_view',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.capability.id).toBe('video.live_view');
    expect(body.capability.maturity).toBe(CapabilityMaturity.PRODUCTION);
    expect(body.canUse.usable).toBe(true);
  });

  it('GET /v1/capabilities/:id returns 404 for unknown capability', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/nonexistent.capability',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('GET /v1/capabilities/category/:category returns filtered list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/category/VIDEO',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.category).toBe('VIDEO');
    expect(body.capabilities.every((c: any) => c.category === 'VIDEO')).toBe(true);
  });

  it('GET /v1/admin/capabilities/audit returns comprehensive audit report', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/capabilities/audit',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.summary).toBeDefined();
    expect(Array.isArray(body.data.capabilities)).toBe(true);
    expect(Array.isArray(body.data.blockers)).toBe(true);
  });

  it('middleware permits PRODUCTION capability', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/protected/live-view',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('live_view_active');
  });

  it('middleware blocks NOT_IMPLEMENTED capability with 404 and truthful error message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/protected/tpm',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('CAPABILITY_NOT_AVAILABLE');
    expect(body.maturity).toBe(CapabilityMaturity.NOT_IMPLEMENTED);
  });
});
