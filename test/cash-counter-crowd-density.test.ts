import { describe, it, expect, beforeEach } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import {
  sortedMatchingRules,
  analyticsAlertTitle,
  analyticsAlertDescription,
  eventDetectionTypes,
} from "../src/analytics/rule-engine.js";
import { RuleEngine as AnomalyRuleEngine } from "../src/security-commander/anomaly/detection-rules.js";
import type { SecurityEvent } from "../src/security-commander/types/security-event.types.js";
import type { AnalyticsRule as CoreAnalyticsRule } from "../src/domain/models.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

describe("Cash Counter Crowd Density Rule (tmpl-04)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-04-cash-counter-crowd directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-04-cash-counter-crowd");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-04-cash-counter-crowd");
      expect(templateDirect?.name).toBe("Cash Counter Crowd Density");
      expect(templateDirect?.category).toBe("CASH_OPERATIONS");
      expect(templateDirect?.detectorType).toBe("crowd-density");
      expect(templateDirect?.defaultSeverity).toBe("WARNING");
      expect(templateDirect?.defaultDurationMs).toBe(60000);
      expect(templateDirect?.defaultCooldownMs).toBe(120000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.suggestedSchedule).toBe("BUSINESS_HOURS");
      expect(templateDirect?.recommendedZoneTypes).toContain("CASH_COUNTER");
      expect(templateDirect?.recommendedZoneTypes).toContain("QUEUE_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("CUSTOMER_AREA");

      // Aliases
      const templateByName = await repository.getTemplate("Cash Counter Crowd Density");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-04-cash-counter-crowd");

      const shortAlias = await repository.getTemplate("cash-counter-crowd");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-04-cash-counter-crowd");

      const numAlias = await repository.getTemplate("tmpl-04");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-04-cash-counter-crowd");
    });

    it("verifies template metadata configuration for cash counter crowd SLA", async () => {
      const template = await repository.getTemplate("tmpl-04-cash-counter-crowd");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_CASH_COUNTER_CROWD_SLA");
      expect(template?.metadata?.targetMetrics).toEqual(["person_count", "crowd_density", "density_level"]);
      expect(template?.metadata?.maxAllowedCrowd).toBe(5);
      expect(template?.metadata?.crowdThreshold).toBe(5);
      expect(template?.metadata?.serviceArea).toBe("CASH_COUNTER");
      expect(template?.metadata?.securityLevel).toBe("OPERATIONAL_SECURITY");
    });

    it("respects category filtering and security-first library behavior", async () => {
      const cashOpsTemplates = await repository.listTemplates("CASH_OPERATIONS");
      const found = cashOpsTemplates.find((t) => t.id === "tmpl-04-cash-counter-crowd");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Cash Counter Crowd Density");

      // Default library hides operational cash-ops templates to prioritize security-first
      const defaultTemplates = await repository.listTemplates();
      expect(defaultTemplates.some((t) => t.id === "tmpl-04-cash-counter-crowd")).toBe(false);
    });

    it("registers crowd models in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const crowdDensityModel = models.find((m) => m.detector === "crowd-density");
      const crowdModel = models.find((m) => m.detector === "crowd");
      const cashCounterCrowdModel = models.find((m) => m.detector === "cash-counter-crowd");

      expect(crowdDensityModel).toBeDefined();
      expect(crowdDensityModel?.model).toBe("ROI Bounding-Box Area Density");

      expect(crowdModel).toBeDefined();
      expect(crowdModel?.status).toBe("PRODUCTION_READY");

      expect(cashCounterCrowdModel).toBeDefined();
      expect(cashCounterCrowdModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution: person_count & density_level", () => {
    it("resolves person_count across numeric, string, array, and alias formats", async () => {
      // Direct numeric
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 6 }, "person_count")
      ).toBe(6);

      // String number conversion
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: "7" }, "person_count")
      ).toBe(7);

      // Nested metadata unwrap
      expect(
        (ruleEngine as any).resolveMetricValue({ metadata: { person_count: 8 } }, "person_count")
      ).toBe(8);

      // CamelCase alias
      expect(
        (ruleEngine as any).resolveMetricValue({ personCount: 6 }, "person_count")
      ).toBe(6);

      // crowd_count / crowd_density
      expect(
        (ruleEngine as any).resolveMetricValue({ crowd_count: 9 }, "person_count")
      ).toBe(9);
      expect(
        (ruleEngine as any).resolveMetricValue({ crowd_density: 10 }, "person_count")
      ).toBe(10);

      // occupancy alias
      expect(
        (ruleEngine as any).resolveMetricValue({ occupancy: 7 }, "person_count")
      ).toBe(7);

      // Array of persons
      expect(
        (ruleEngine as any).resolveMetricValue(
          { persons: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }, { id: "p5" }, { id: "p6" }] },
          "person_count"
        )
      ).toBe(6);

      // Array of objects with person label
      expect(
        (ruleEngine as any).resolveMetricValue(
          { objects: [{ label: "person" }, { label: "chair" }, { label: "person" }, { label: "person" }] },
          "person_count"
        )
      ).toBe(3);

      // Derived count from density_level
      expect(
        (ruleEngine as any).resolveMetricValue({ density_level: "CROWDED" }, "person_count")
      ).toBe(6);
      expect(
        (ruleEngine as any).resolveMetricValue({ density_level: "CRITICAL" }, "person_count")
      ).toBe(9);
    });

    it("resolves density_level categorically and derives from person count", async () => {
      // Direct categorical
      expect(
        (ruleEngine as any).resolveMetricValue({ density_level: "CROWDED" }, "density_level")
      ).toBe("CROWDED");
      expect(
        (ruleEngine as any).resolveMetricValue({ crowdLevel: "CRITICAL" }, "density_level")
      ).toBe("CRITICAL");

      // Derived from numeric counts
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 9 }, "density_level")
      ).toBe("CRITICAL");
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 6 }, "density_level")
      ).toBe("CROWDED");
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 4 }, "density_level")
      ).toBe("BUSY");
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 1 }, "density_level")
      ).toBe("NORMAL");
    });
  });

  describe("Rule Evaluation & State Lifecycles", () => {
    it("handles duration threshold: goes CONDITION_MET_PENDING_DURATION then ACTIVE_ALERTING after 60s", async () => {
      const template = await repository.getTemplate("tmpl-04-cash-counter-crowd");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-crowd-1",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: 60000,
        cooldownMs: 120000,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["CASH_COUNTER_1"],
        detectorType: template!.detectorType,
      };

      const start = new Date("2026-10-24T10:00:00.000Z");

      // Frame 1: Crowd reaches 7 (> 5 threshold) at t = 0s
      const frame1Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_COUNTER_1",
        timestamp: start,
        metrics: {
          person_count: 7,
          density_level: "CROWDED",
        },
      });

      expect(frame1Result.conditionMet).toBe(true);
      expect(frame1Result.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(frame1Result.actions).toHaveLength(0);

      // Frame 2: Still crowded after 60s (t = 60s)
      const frame2Time = new Date(start.getTime() + 60000);
      const frame2Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_COUNTER_1",
        timestamp: frame2Time,
        metrics: {
          person_count: 7,
          density_level: "CROWDED",
        },
      });

      expect(frame2Result.conditionMet).toBe(true);
      expect(frame2Result.status).toBe("ACTIVE_ALERTING");
      expect(frame2Result.actions).toContain("CREATE_ALERT");
      expect(frame2Result.actions).toContain("CAPTURE_SNAPSHOT");
      expect(frame2Result.actions).toContain("NOTIFY_BRANCH_MANAGER");

      // Frame 3: Crowd disperses down to 2 people (t = 80s)
      const frame3Time = new Date(start.getTime() + 80000);
      const frame3Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_COUNTER_1",
        timestamp: frame3Time,
        metrics: {
          person_count: 2,
          density_level: "NORMAL",
        },
      });

      expect(frame3Result.conditionMet).toBe(false);
      expect(frame3Result.status).toBe("RESOLVED");
    });

    it("does not trigger when crowd count is within allowable threshold (<= 5)", async () => {
      const template = await repository.getTemplate("tmpl-04-cash-counter-crowd");
      const rule = {
        id: "rule-crowd-normal",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: 0,
        cooldownMs: 60000,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["CASH_COUNTER_1"],
        detectorType: template!.detectorType,
      };

      const result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_COUNTER_1",
        timestamp: new Date(),
        metrics: {
          person_count: 4,
          density_level: "BUSY",
        },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.status).toBe("IDLE");
      expect(result.actions).toHaveLength(0);
    });
  });

  describe("Core Rule Engine Integration (rule-engine.ts)", () => {
    it("maps crowd-density and related detection types in eventDetectionTypes", () => {
      expect(eventDetectionTypes({ detectionType: "crowd-density" } as any)).toContain("crowd-density");
      expect(eventDetectionTypes({ detectionType: "crowd_density" } as any)).toContain("crowd-density");
      expect(eventDetectionTypes({ detectionType: "crowd" } as any)).toContain("crowd");
      expect(eventDetectionTypes({ detectionType: "CROWD_DENSITY" } as any)).toContain("crowd-density");
      expect(eventDetectionTypes({ detectionType: "cash-counter-crowd" } as any)).toContain("cash-counter-crowd");
      expect(eventDetectionTypes({ detectionType: "crowd-count" } as any)).toContain("crowd-density");
    });

    it("matches crowd rules when event has empty objects: []", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-crowd-core",
        name: "Cash Counter Crowd Density",
        detectionType: "crowd-density",
        severity: "P3",
        minConfidence: 0.65,
        minDurationSeconds: 0,
        cooldownSeconds: 120,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-crowd-01",
        detectionType: "crowd-density",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [],
        metadata: {
          person_count: 8,
          density_level: "CRITICAL",
        },
      };

      const matches = sortedMatchingRules([rule], event);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-crowd-core");
    });

    it("cross-matches person object class with customer and crowd labels", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-person-class-core",
        name: "Cash Counter Crowd Density",
        detectionType: "crowd-density",
        severity: "P3",
        minConfidence: 0.65,
        minDurationSeconds: 0,
        cooldownSeconds: 120,
        direction: "any",
        objectClasses: ["person"],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventCustomer: AnalyticsEventInput = {
        eventId: "evt-crowd-customer",
        detectionType: "crowd-density",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [{ label: "customer", confidence: 0.88, box: [10, 10, 50, 50] }],
      };

      const matches = sortedMatchingRules([rule], eventCustomer);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-person-class-core");
    });

    it("generates specific alert title and detailed description for crowd density alerts", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-crowd-title",
        name: "Cash Counter Crowd Density",
        detectionType: "crowd-density",
        severity: "P3",
        minConfidence: 0.65,
        minDurationSeconds: 0,
        cooldownSeconds: 120,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventMeta = {
        zoneName: "Teller Counter Bay #2",
        person_count: 8,
        crowdThreshold: 5,
        density_level: "CRITICAL",
      };

      const title = analyticsAlertTitle(rule, eventMeta);
      expect(title).toBe("Operations Alert: Cash Counter Crowd Density Exceeded");

      const description = analyticsAlertDescription(rule, eventMeta);
      expect(description).toContain("Excessive crowd density detected in Teller Counter Bay #2");
      expect(description).toContain("8 persons present");
      expect(description).toContain("service threshold: 5");
      expect(description).toContain("level: CRITICAL");
      expect(description).toContain("Potential customer service bottleneck and counter rush risk");
    });
  });

  describe("Security Commander Anomaly Rule (cash-counter-crowd-density)", () => {
    it("evaluates and triggers cash-counter-crowd-density anomaly rule", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event1: SecurityEvent = {
        id: "sec-crowd-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "ai.crowd_density",
        severity: "medium",
        metadata: {
          person_count: 7,
          zone: "CASH_COUNTER",
        },
      };

      const evaluation1 = anomalyEngine.evaluate(event1);
      const match1 = evaluation1.matchedRules.find((m) => m.rule.id === "cash-counter-crowd-density");
      expect(match1).toBeDefined();
      expect(match1?.score).toBe(0.75);
      expect(match1?.reason).toContain("High crowd density at cash counter");

      // Evaluation via metadata: overcrowding === true
      const event2: SecurityEvent = {
        id: "sec-crowd-2",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "medium",
        metadata: {
          overcrowding: true,
          person_count: 8,
        },
      };

      const evaluation2 = anomalyEngine.evaluate(event2);
      const match2 = evaluation2.matchedRules.find((m) => m.rule.id === "cash-counter-crowd-density");
      expect(match2).toBeDefined();
      expect(match2?.score).toBe(0.75);
    });

    it("does not trigger anomaly when crowd is within normal operational limits", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event: SecurityEvent = {
        id: "sec-crowd-3",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "low",
        metadata: {
          person_count: 3,
          density_level: "NORMAL",
        },
      };

      const evaluation = anomalyEngine.evaluate(event);
      const match = evaluation.matchedRules.find((m) => m.rule.id === "cash-counter-crowd-density");
      expect(match).toBeUndefined();
    });
  });
});
