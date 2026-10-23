import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { NbfcRuleRepository } from '../src/analytics/nbfc-rule-repository.js';
import { NbfcRuleEngineService } from '../src/analytics/nbfc-rule-engine.service.js';
import { registerNbfcAnalyticsRoutes } from '../src/routes/nbfc-analytics.routes.js';
import {
  MINIMUM_PERSONNEL_TEMPLATE_ID, editableRuleCondition, updateRuleCondition,
  validMinimumPersonnelCondition, minimumPersonnelBuilderCondition,
} from '../packages/contracts/src/nbfc-rule-conditions.js';

const condition = () => ({ logical: 'AND' as const, conditions: [
  { metric: 'vault_operation_active', operator: 'EQUALS', value: true },
  { metric: 'person_count', operator: 'LESS_THAN', value: 2 },
] });

async function harness() {
  const repository = new NbfcRuleRepository();
  const template = (await repository.getTemplate(MINIMUM_PERSONNEL_TEMPLATE_ID))!;
  const rule = await repository.createRule({ tenantId: 'tenant', name: template.name,
    templateId: template.id, condition: template.defaultCondition, durationMs: template.defaultDurationMs,
    cooldownMs: template.defaultCooldownMs, actions: template.defaultActions, state: 'ACTIVE',
    cameraIds: ['vault-camera'], schedule: { type: '24X7' },
  });
  const engine = new NbfcRuleEngineService(repository);
  const observe = (seconds: number, metrics: Record<string, unknown>, current = rule) => engine.evaluateRule(current, {
    cameraId: 'vault-camera', metrics, timestamp: new Date(Date.parse('2026-10-23T06:00:00Z') + seconds * 1000),
  });
  return { repository, rule, engine, observe };
}

describe('Minimum Personnel / Dual Control condition integrity', () => {
  it('edits the personnel threshold while keeping the active-operation guard', () => {
    const source = condition();
    expect(editableRuleCondition(source)).toMatchObject({ metric: 'person_count', value: 2 });
    const updated = updateRuleCondition(source, { metric: 'person_count', operator: 'LESS_THAN', value: 3 });
    expect(updated).toEqual({ logical: 'AND', conditions: [source.conditions[0], { metric: 'person_count', operator: 'LESS_THAN', value: 3 }] });
    expect(source.conditions[1]?.value).toBe(2);
    expect(validMinimumPersonnelCondition(updated)).toBe(true);
  });

  it('restores guards on profiles flattened by the previous editor', () => {
    expect(minimumPersonnelBuilderCondition({ metric: 'vault_operation_active', operator: 'EQUALS', value: 1 })).toEqual(condition());
    expect(minimumPersonnelBuilderCondition({ metric: 'person_count', operator: 'LESS_THAN', value: 3 }).conditions?.[1]?.value).toBe(3);
    expect(validMinimumPersonnelCondition({ logical: 'OR', conditions: condition().conditions })).toBe(false);
    expect(validMinimumPersonnelCondition({ metric: 'person_count', operator: 'LESS_THAN', value: 2 })).toBe(false);
  });

  it('preserves nested clauses when editing a compound condition', () => {
    const source = { logical: 'AND' as const, conditions: [condition(), { metric: 'door_open', operator: 'EQUALS', value: true }] };
    const updated = updateRuleCondition(source, { metric: 'person_count', operator: 'LESS_THAN', value: 4 });
    expect(updated.conditions?.[1]).toEqual(source.conditions[1]);
    expect(updated.conditions?.[0]?.conditions?.[0]).toEqual(condition().conditions[0]);
    expect(editableRuleCondition(updated).value).toBe(4);
  });
});

describe('Minimum Personnel / Dual Control runtime', () => {
  it.each([0,1])('alerts for %i people only after ten seconds of active-operation shortfall', async count => {
    const h = await harness(); const metrics = { vault_operation_active: true, person_count: count };
    expect((await h.observe(0, metrics)).triggered).toBe(false);
    expect((await h.observe(5, metrics)).triggered).toBe(false);
    expect(await h.observe(10, metrics)).toMatchObject({ triggered: true, alertRequired: true, incidentRequired: true, evidenceSnapshotRequired: true });
    expect((await h.observe(11, metrics)).alertRequired).toBe(false);
  });

  it('never alerts for an idle vault or for sufficient personnel', async () => {
    const h = await harness();
    for (const active of [false,true]) for (const count of [0,1,2,3]) {
      if (active && count < 2) continue;
      expect((await h.observe(0, { vault_operation_active: active, person_count: count })).triggered).toBe(false);
      expect((await h.observe(10, { vault_operation_active: active, person_count: count })).triggered).toBe(false);
      await h.repository.clearRuntimeState(h.rule.id);
    }
  });

  it('does not turn unknown, negative, fractional or malformed counts into zero people', async () => {
    const h = await harness();
    for (const count of [undefined,null,false,'', '1', -1,1.5,NaN,Infinity]) {
      const result = await h.observe(0, { vault_operation_active: true, person_count: count });
      expect(result).toMatchObject({ triggered: false, status: 'SUPPRESSED' });
    }
    expect((await h.observe(0, { person_count: 1 })).status).toBe('SUPPRESSED');
    expect((await h.observe(0, { vault_operation_active: 'true', person_count: 1 })).status).toBe('SUPPRESSED');
  });

  it('starts confirmation again after missing telemetry or a long observation gap', async () => {
    const h = await harness(); const low = { vault_operation_active: true, person_count: 1 };
    await h.observe(0, low); await h.observe(5, low);
    expect((await h.observe(8, { vault_operation_active: true })).status).toBe('SUPPRESSED');
    expect((await h.observe(10, low)).durationPersistedMs).toBe(0);
    expect((await h.observe(30, low)).durationPersistedMs).toBe(0);
    await h.observe(35, low); expect((await h.observe(40, low)).triggered).toBe(true);
  });

  it('ignores repeated and out-of-order frames without erasing current confirmation', async () => {
    const h = await harness(); const low = { vault_operation_active: true, person_count: 1 };
    await h.observe(0, low); await h.observe(5, low);
    expect((await h.observe(4, { ...low, person_count: 2 })).status).toBe('SUPPRESSED');
    expect((await h.observe(5, low)).triggered).toBe(false);
    expect((await h.observe(10, low)).triggered).toBe(true);
  });

  it('resets pending duration when operations end or rule parameters change', async () => {
    const h = await harness(); const low = { vault_operation_active: true, person_count: 1 };
    await h.observe(0, low); await h.observe(5, { ...low, vault_operation_active: false });
    expect((await h.observe(10, low)).durationPersistedMs).toBe(0);
    const updated = { ...h.rule, version: 2 };
    expect((await h.observe(15, low, updated)).durationPersistedMs).toBe(0);
    await h.observe(20, low, updated); expect((await h.observe(25, low, updated)).triggered).toBe(true);
  });

  it('respects cooldown after short recoveries and produces no external actions in shadow mode', async () => {
    const h = await harness(); const low = { vault_operation_active: true, person_count: 1 };
    await h.observe(0, low); await h.observe(5, low); await h.observe(10, low);
    await h.observe(11, { ...low, person_count: 2 }); await h.observe(12, low); await h.observe(17, low);
    expect((await h.observe(22, low)).status).toBe('COOLDOWN');
    await h.repository.clearRuntimeState(h.rule.id);
    const shadow = { ...h.rule, state: 'SHADOW' as const };
    await h.observe(0, low, shadow); await h.observe(5, low, shadow);
    expect(await h.observe(10, low, shadow)).toMatchObject({ triggered: true, isShadow: true, alertRequired: false, incidentRequired: false, evidenceSnapshotRequired: false, evidenceClipRequired: false, actions: [] });
  });
});

describe('minimum-personnel API validation', () => {
  it('rejects saves that remove the operation guard and accepts the complete condition', async () => {
    const { repository, engine, rule } = await harness();
    const app = Fastify(); app.decorateRequest('currentUser');
    app.addHook('preHandler', async request => { request.currentUser = { id: 'admin', tenantId: 'tenant', role: 'company_admin' } as never; });
    registerNbfcAnalyticsRoutes(app, { repository, engineService: engine });
    try {
      const invalid = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { condition: { metric: 'person_count', operator: 'LESS_THAN', value: 2 } } });
      expect(invalid.statusCode).toBe(400); expect(invalid.json().error).toBe('invalid_minimum_personnel_condition');
      const valid = await app.inject({ method: 'PATCH', url: `/api/ai/rules/${rule.id}`, payload: { condition: condition() } });
      expect(valid.statusCode).toBe(200); expect(valid.json().condition).toEqual(condition());
      const loaded = await app.inject({ method: 'GET', url: `/api/ai/rules/${rule.id}` });
      expect(loaded.json().rule.condition).toEqual(condition());
    } finally { await app.close(); }
  });
});
