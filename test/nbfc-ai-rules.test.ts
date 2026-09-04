import { describe, it, expect, beforeEach } from 'vitest';
import { NbfcRuleRepository } from '../src/analytics/nbfc-rule-repository.js';
import { NbfcRuleEngineService } from '../src/analytics/nbfc-rule-engine.service.js';
import {
  AnalyticsRule,
  AnalyticsZone,
  RuleEvaluationContext,
  DetectorType,
} from '../src/domain/nbfc-analytics.types.js';

describe('NBFC AI Surveillance & Dynamic Rule Engine', () => {
  let repository: NbfcRuleRepository;
  let engine: NbfcRuleEngineService;

  beforeEach(() => {
    // Initialize repository in in-memory mode (no PG pool)
    repository = new NbfcRuleRepository();
    engine = new NbfcRuleEngineService(repository);
  });

  describe('Template Library & Seeding', () => {
    it('pre-seeds all 36 NBFC production rule templates', async () => {
      const templates = await repository.listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(36);

      const templateIds = templates.map((t) => t.id);
      expect(templateIds.some((id) => id.includes("locker-max-occupancy"))).toBe(true);
      expect(templateIds.some((id) => id.includes("minimum-personnel"))).toBe(true);
      expect(templateIds.some((id) => id.includes("after-hours-person"))).toBe(true);
      expect(templateIds.some((id) => id.includes("cash-counter-crowd"))).toBe(true);
      expect(templateIds.some((id) => id.includes("queue-length"))).toBe(true);
      expect(templateIds.some((id) => id.includes("unattended") || id.includes("counter-unattended"))).toBe(true);
      expect(templateIds.some((id) => id.includes("tailgating"))).toBe(true);
      expect(templateIds.some((id) => id.includes("loitering"))).toBe(true);
      expect(templateIds.some((id) => id.includes("line-crossing"))).toBe(true);
      expect(templateIds.some((id) => id.includes("camera-tamper"))).toBe(true);
      expect(templateIds.some((id) => id.includes("camera-obstruction"))).toBe(true);
      expect(templateIds.some((id) => id.includes("recording-failure"))).toBe(true);
      expect(templateIds.some((id) => id.includes("cash-van"))).toBe(true);
    });

    it("instantiates an editable rule from template without code changes", async () => {
      const instantiated = await repository.instantiateTemplate(
        "tpl-locker-max-occupancy",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-locker-01"],
          zoneId: "zone-vault-int",
        },
        "admin-user"
      );

      expect(instantiated).toBeDefined();
      expect(typeof instantiated.id).toBe("string");
      expect(instantiated.id.length).toBeGreaterThan(10);
      expect(instantiated.name).toBe("Locker / Vault Maximum Occupancy");
      expect(instantiated.branchIds).toContain("branch-kollam-01");
      expect(instantiated.cameraIds).toContain("cam-locker-01");
      expect(instantiated.zoneId).toBe("zone-vault-int");
      expect(instantiated.version).toBe(1);
    });
  });

  describe('Visual Zone Management', () => {
    it('creates and retrieves normalized polygon zones', async () => {
      const zone: AnalyticsZone = {
        id: 'zone-kollam-locker-int',
        tenantId: 'tenant-nbfc-01',
        branchId: 'branch-kollam-01',
        cameraId: 'cam-locker-01',
        name: 'Locker Strong Room Interior',
        type: 'LOCKER',
        polygon: [
          { x: 0.1, y: 0.1 },
          { x: 0.85, y: 0.1 },
          { x: 0.85, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ],
        enabled: true,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await repository.saveZone(zone);
      const retrieved = await repository.getZoneById(zone.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.polygon.length).toBe(4);
      expect(retrieved?.type).toBe('LOCKER');

      // Verify coordinate normalization
      retrieved?.polygon.forEach((pt) => {
        expect(pt.x).toBeGreaterThanOrEqual(0.0);
        expect(pt.x).toBeLessThanOrEqual(1.0);
        expect(pt.y).toBeGreaterThanOrEqual(0.0);
        expect(pt.y).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('Rule Threshold Modification Without Code Modification', () => {
    it('evaluates threshold > 2 persons, then updates threshold to > 3 dynamically', async () => {
      const baseRule: AnalyticsRule = {
        id: 'rule-locker-occupancy-kollam',
        tenantId: 'tenant-nbfc-01',
        name: 'Kollam Locker Occupancy',
        enabled: true,
        branchIds: ['branch-kollam-01'],
        cameraIds: ['cam-locker-01'],
        zoneId: 'zone-kollam-locker-int',
        detectorType: 'PERSON_DETECTION',
        condition: {
          metric: 'person_count',
          operator: 'GREATER_THAN',
          value: 2,
        },
        durationMs: 0, // Instant trigger for numeric threshold test
        schedule: { type: "24X7" },
        severity: 'CRITICAL',
        cooldownMs: 60000,
        actions: ['CREATE_ALERT', 'CAPTURE_SNAPSHOT', 'NOTIFY_SOC'],
        state: 'ACTIVE',
        shadowMode: false,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await repository.saveRule(baseRule);

      // Context with 2 persons -> should NOT trigger (> 2 requires at least 3)
      const ctx2Persons: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        branchId: 'branch-kollam-01',
        cameraId: 'cam-locker-01',
        zoneId: 'zone-kollam-locker-int',
        detectorType: 'PERSON_DETECTION',
        timestamp: new Date('2026-09-04T14:30:00Z'),
        metrics: { person_count: 2 },
      };

      let result = await engine.evaluateRule(baseRule, ctx2Persons);
      expect(result.conditionMet).toBe(false);
      expect(result.isTriggered).toBe(false);

      // Context with 3 persons -> should trigger condition
      const ctx3Persons: RuleEvaluationContext = {
        ...ctx2Persons,
        metrics: { person_count: 3 },
      };

      result = await engine.evaluateRule(baseRule, ctx3Persons);
      expect(result.conditionMet).toBe(true);
      expect(result.isTriggered).toBe(true);

      // Admin updates rule threshold from 2 to 3 persons WITHOUT CODE CHANGE
      const updatedRule = await repository.updateRule(
        baseRule.id,
        {
          condition: {
            metric: 'person_count',
            operator: 'GREATER_THAN',
            value: 3,
          },
        },
        'Branch committee approved 3-person operation protocol',
        'admin-user'
      );

      expect(updatedRule).not.toBeNull();
      expect(updatedRule!.version).toBe(2);

      // Reset state for clean comparison
      await repository.clearRuleState(baseRule.id);

      // Now 3 persons should NOT trigger
      const result3AfterUpdate = await engine.evaluateRule(updatedRule!, ctx3Persons);
      expect(result3AfterUpdate.conditionMet).toBe(false);
      expect(result3AfterUpdate.isTriggered).toBe(false);

      // 4 persons DOES trigger
      const ctx4Persons: RuleEvaluationContext = {
        ...ctx2Persons,
        metrics: { person_count: 4 },
      };
      const result4AfterUpdate = await engine.evaluateRule(updatedRule!, ctx4Persons);
      expect(result4AfterUpdate.conditionMet).toBe(true);
      expect(result4AfterUpdate.isTriggered).toBe(true);

      // Verify version audit history was written
      const versions = await repository.listRuleVersions(baseRule.id);
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0].changeReason).toContain('3-person operation protocol');
    });
  });

  describe('Duration / Persistence Filtering', () => {
    it('requires condition to persist for durationMs before firing alert', async () => {
      const ruleWithDuration: AnalyticsRule = {
        id: 'rule-locker-persistence',
        tenantId: 'tenant-nbfc-01',
        name: 'Locker Occupancy with 5s Persistence',
        enabled: true,
        branchIds: ['branch-kollam-01'],
        cameraIds: ['cam-locker-01'],
        detectorType: 'PERSON_DETECTION',
        condition: {
          metric: 'person_count',
          operator: 'GREATER_THAN',
          value: 2,
        },
        durationMs: 5000, // 5 seconds
        scheduleType: '24X7',
        severity: 'CRITICAL',
        cooldownMs: 60000,
        actions: ['CREATE_ALERT'],
        status: 'ACTIVE',
        shadowMode: false,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await repository.saveRule(ruleWithDuration);

      const baseTime = 1757000000000; // Epoch timestamp

      // Frame 1 at t=0: 3 persons (condition met, but duration pending)
      const ctxT0: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        branchId: 'branch-kollam-01',
        cameraId: 'cam-locker-01',
        detectorType: 'PERSON_DETECTION',
        timestamp: new Date(baseTime),
        metrics: { person_count: 3 },
      };
      const resT0 = await engine.evaluateRule(ruleWithDuration, ctxT0);
      expect(resT0.conditionMet).toBe(true);
      expect(resT0.isTriggered).toBe(false); // Not yet triggered (pending)

      // Frame 2 at t=3000ms: still under 5000ms
      const ctxT3 = { ...ctxT0, timestamp: new Date(baseTime + 3000) };
      const resT3 = await engine.evaluateRule(ruleWithDuration, ctxT3);
      expect(resT3.conditionMet).toBe(true);
      expect(resT3.isTriggered).toBe(false); // Still pending

      // Frame 3 at t=5500ms: duration reached (5500 >= 5000)
      const ctxT5 = { ...ctxT0, timestamp: new Date(baseTime + 5500) };
      const resT5 = await engine.evaluateRule(ruleWithDuration, ctxT5);
      expect(resT5.conditionMet).toBe(true);
      expect(resT5.isTriggered).toBe(true); // Fired alert!
    });
  });

  describe('Schedule Enforcement', () => {
    it('respects BUSINESS_HOURS vs AFTER_HOURS schedules', async () => {
      const businessHoursRule: AnalyticsRule = {
        id: 'rule-cash-crowd-biz-hours',
        tenantId: 'tenant-nbfc-01',
        name: 'Cash Counter Crowd (Business Hours)',
        enabled: true,
        detectorType: 'PERSON_DETECTION',
        condition: { metric: 'person_count', operator: 'GREATER_THAN', value: 5 },
        durationMs: 0,
        schedule: { type: 'BUSINESS_HOURS' },
        severity: 'WARNING',
        cooldownMs: 60000,
        actions: ['CREATE_ALERT'],
        state: 'ACTIVE',
        shadowMode: false,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // 06:00 UTC = 11:30 AM IST (inside business hours) -> matches schedule
      const bizHourCtx: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        detectorType: 'PERSON_DETECTION',
        timestamp: new Date('2026-09-04T06:00:00Z'),
        metrics: { person_count: 8 },
      };
      const resBiz = await engine.evaluateRule(businessHoursRule, bizHourCtx);
      expect(resBiz.conditionMet).toBe(true);
      expect(resBiz.isTriggered).toBe(true);

      // 18:00 UTC = 11:30 PM IST (outside business hours) -> schedule suppressed
      const afterHourCtx: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        detectorType: 'PERSON_DETECTION',
        timestamp: new Date('2026-09-04T18:00:00Z'),
        metrics: { person_count: 8 },
      };
      const resAfter = await engine.evaluateRule(businessHoursRule, afterHourCtx);
      expect(resAfter.status).toBe('SCHEDULE_INACTIVE');
      expect(resAfter.isTriggered).toBe(false);
    });
  });

  describe('Deduplication & Cooldown State Machine', () => {
    it('prevents alert storms while event is continuously active', async () => {
      const rule: AnalyticsRule = {
        id: 'rule-storm-prevention',
        tenantId: 'tenant-nbfc-01',
        name: 'Locker Storm Prevention',
        enabled: true,
        detectorType: 'PERSON_DETECTION',
        condition: { metric: 'person_count', operator: 'GREATER_THAN', value: 2 },
        durationMs: 0,
        scheduleType: '24X7',
        severity: 'CRITICAL',
        cooldownMs: 60000, // 60 sec cooldown
        actions: ['CREATE_ALERT'],
        status: 'ACTIVE',
        shadowMode: false,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await repository.saveRule(rule);

      const t0 = 1757000000000;
      const ctx0: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        detectorType: 'PERSON_DETECTION',
        timestamp: new Date(t0),
        metrics: { person_count: 4 },
      };

      // First evaluation fires alert
      const res0 = await engine.evaluateRule(rule, ctx0);
      expect(res0.isTriggered).toBe(true);

      // 100ms later in stream: 4 persons still in room. MUST NOT fire duplicate alert
      const ctx1 = { ...ctx0, timestamp: new Date(t0 + 100) };
      const res1 = await engine.evaluateRule(rule, ctx1);
      expect(res1.conditionMet).toBe(true);
      expect(res1.isTriggered).toBe(false); // Suppressed by deduplication/cooldown!

      // 5 seconds later: still active. Still suppressed
      const ctx2 = { ...ctx0, timestamp: new Date(t0 + 5000) };
      const res2 = await engine.evaluateRule(rule, ctx2);
      expect(res2.isTriggered).toBe(false);

      // When condition clears (person_count drops to 1) -> transitions to RESOLVED
      const ctxClear = {
        ...ctx0,
        timestamp: new Date(t0 + 10000),
        metrics: { person_count: 1 },
      };
      const resClear = await engine.evaluateRule(rule, ctxClear);
      expect(resClear.conditionMet).toBe(false);
      expect(resClear.isTriggered).toBe(false);
    });
  });

  describe('Shadow Mode & Simulation Test Mode', () => {
    it('evaluates conditions in shadow mode without dispatching live actions', async () => {
      const shadowRule: AnalyticsRule = {
        id: 'rule-shadow-pilot',
        tenantId: 'tenant-nbfc-01',
        name: 'New Vault Loitering Pilot',
        enabled: true,
        detectorType: 'LOITERING_DETECTOR',
        condition: { metric: 'dwell_time_seconds', operator: 'GREATER_THAN', value: 300 },
        durationMs: 0,
        scheduleType: '24X7',
        severity: 'HIGH',
        cooldownMs: 60000,
        actions: ['CREATE_ALERT', 'NOTIFY_SOC'],
        status: 'SHADOW',
        shadowMode: true,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const ctx: RuleEvaluationContext = {
        tenantId: 'tenant-nbfc-01',
        detectorType: 'LOITERING_DETECTOR',
        timestamp: new Date(),
        metrics: { dwell_time_seconds: 450 },
      };

      const result = await engine.evaluateRule(shadowRule, ctx);
      expect(result.conditionMet).toBe(true);
      expect(result.isTriggered).toBe(true);
      expect(result.isShadow).toBe(true); // Marked as shadow - no downstream notification!
    });

    it('runs test mode simulations over synthetic event historical sequences', async () => {
      const testEvents: RuleEvaluationContext[] = [
        {
          tenantId: 'tenant-nbfc-01',
          branchId: 'branch-kollam-01',
          cameraId: 'cam-01',
          detectorType: 'PERSON_DETECTION',
          timestamp: new Date('2026-09-01T10:00:00Z'),
          metrics: { person_count: 1 },
        },
        {
          tenantId: 'tenant-nbfc-01',
          branchId: 'branch-kollam-01',
          cameraId: 'cam-01',
          detectorType: 'PERSON_DETECTION',
          timestamp: new Date('2026-09-01T10:05:00Z'),
          metrics: { person_count: 4 }, // Triggers (> 2)
        },
        {
          tenantId: 'tenant-nbfc-01',
          branchId: 'branch-kollam-01',
          cameraId: 'cam-01',
          detectorType: 'PERSON_DETECTION',
          timestamp: new Date('2026-09-01T10:05:30Z'),
          metrics: { person_count: 5 }, // In cooldown, won't double count
        },
        {
          tenantId: 'tenant-nbfc-01',
          branchId: 'branch-kollam-01',
          cameraId: 'cam-01',
          detectorType: 'PERSON_DETECTION',
          timestamp: new Date('2026-09-01T12:00:00Z'),
          metrics: { person_count: 3 }, // Triggers after cooldown
        },
      ];

      const rule: AnalyticsRule = {
        id: 'rule-test-sim',
        tenantId: 'tenant-nbfc-01',
        name: 'Simulation Target Rule',
        enabled: true,
        detectorType: 'PERSON_DETECTION',
        condition: { metric: 'person_count', operator: 'GREATER_THAN', value: 2 },
        durationMs: 0,
        scheduleType: '24X7',
        severity: 'CRITICAL',
        cooldownMs: 60000,
        actions: ['CREATE_ALERT'],
        status: 'ACTIVE',
        shadowMode: false,
        createdBy: 'admin-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const testResult = await engine.simulateRuleTest(rule, testEvents, 'Last 7 days mock data');
      expect(testResult.totalEvaluated).toBe(4);
      expect(testResult.wouldTriggerCount).toBe(2);
      expect(testResult.ruleId).toBe(rule.id);
    });
  });

  describe('Model Registry & Capacity Planning', () => {
    it('returns honest model registry statuses without faking unsupported detectors', () => {
      const models = engine.getModelRegistry();
      expect(models.length).toBeGreaterThanOrEqual(10);

      const personDet = models.find((m) => m.detector === 'PERSON_DETECTION');
      expect(personDet?.status).toBe('PRODUCTION_READY');
      expect(personDet?.commercialLicenseReviewed).toBe(true);

      const tamperDet = models.find((m) => m.detector === 'CAMERA_TAMPER');
      expect(tamperDet?.status).toBe('PRODUCTION_READY');

      const fallDet = models.find((m) => m.detector === 'FALL_DETECTION');
      // Requirement 18 & 50: Do NOT mark fall detection production ready if experimental/unvalidated
      expect(fallDet?.status).toBe('NOT_IMPLEMENTED');

      const crowdDet = models.find((m) => m.detector === 'CROWD_DENSITY');
      expect(crowdDet?.status).toBe('EXPERIMENTAL');
    });

    it('calculates GPU stream capacity bounds correctly', () => {
      const capacity = engine.getCapacityPlanningInfo();
      expect(capacity.totalCapacityStreams).toBeGreaterThan(0);
      expect(capacity.activeStreams).toBeLessThanOrEqual(capacity.totalCapacityStreams);
      expect(capacity.availableStreams).toBe(
        capacity.totalCapacityStreams - capacity.activeStreams - capacity.reservedStreams
      );
    });
  });
});
