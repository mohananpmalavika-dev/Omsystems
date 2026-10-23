import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerNbfcAnalyticsRoutes } from '../src/routes/nbfc-analytics.routes.js';
import { NbfcRuleRepository } from '../src/analytics/nbfc-rule-repository.js';
import { NbfcRuleEngineService } from '../src/analytics/nbfc-rule-engine.service.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function setup() {
  const repository = new NbfcRuleRepository();
  const app = Fastify(); apps.push(app);
  app.decorateRequest('currentUser');
  app.addHook('preHandler', async request => {
    request.currentUser = { id: 'admin', tenantId: 'tenant', role: 'company_admin' } as never;
  });
  registerNbfcAnalyticsRoutes(app, { repository, engineService: new NbfcRuleEngineService(repository) });
  return { app, repository };
}

describe('saving and applying NBFC rules', () => {
  it('writes a changed scope type to PostgreSQL alongside the target arrays', async () => {
    const existing = await new NbfcRuleRepository().createRule({ tenantId: 'tenant', name: 'Retargeted rule' });
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }));
    const repository = new NbfcRuleRepository({ query } as never);
    vi.spyOn(repository, 'getRule').mockResolvedValue(existing);
    await repository.updateRule(existing.id, { branchIds: ['branch-1'], scopeType: 'BRANCH' });
    expect(query.mock.calls[0]?.[0]).toContain('scope_type = $19');
    expect(query.mock.calls[0]?.[1]?.[18]).toBe('BRANCH');
  });
  it('activates a disabled rule and persists its changed target and schedule', async () => {
    const { app, repository } = await setup();
    const rule = await repository.createRule({ tenantId: 'tenant', name: 'Closing clearance', enabled: false, state: 'INACTIVE' });
    const schedule = { type: 'BRANCH_CLOSING', start: '18:00', end: '08:30', timezone: 'Asia/Kolkata', days: [1,2,3,4,5,6] };
    const saved = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { branchIds: ['branch-1'], state: 'ACTIVE', schedule } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ enabled: true, state: 'ACTIVE', branchIds: ['branch-1'], scopeType: 'BRANCH', schedule });
    const loaded = await app.inject({ method: 'GET', url: `/api/ai/rules/${rule.id}` });
    expect(loaded.json().rule).toMatchObject({ enabled: true, state: 'ACTIVE', scopeType: 'BRANCH', schedule });
    const camera = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { branchIds: [], cameraIds: ['camera-1'] } });
    expect(camera.json()).toMatchObject({ enabled: true, scopeType: 'CAMERA', cameraIds: ['camera-1'] });
  });

  it('continues to reject unscoped live activation while allowing global shadow saves', async () => {
    const { app, repository } = await setup();
    const rule = await repository.createRule({ tenantId: 'tenant', name: 'Global draft', enabled: false, state: 'INACTIVE' });
    const rejected = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { state: 'ACTIVE' } });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toBe('scoped_activation_required');
    expect((await repository.getRule(rule.id))?.enabled).toBe(false);
    const shadow = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { state: 'SHADOW' } });
    expect(shadow.json()).toMatchObject({ state: 'SHADOW', enabled: true, scopeType: 'GLOBAL' });
  });

  it('keeps disabled rules disabled for a description-only edit and inactive creation', async () => {
    const { app, repository } = await setup();
    const rule = await repository.createRule({ tenantId: 'tenant', name: 'Disabled', state: 'INACTIVE', enabled: false, branchIds: ['branch-1'] });
    const edited = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { description: 'Updated description' } });
    expect(edited.json()).toMatchObject({ enabled: false, state: 'INACTIVE', description: 'Updated description' });
    const created = await app.inject({ method: 'POST', url: '/api/ai/rules', payload: { name: 'Inactive rule', detectorType: 'person', condition: { metric: 'person_count', operator: 'GREATER_THAN', value: 0 }, state: 'INACTIVE' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ enabled: false, state: 'INACTIVE' });
  });
});
