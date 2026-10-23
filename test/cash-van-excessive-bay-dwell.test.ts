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

describe("Cash Van Excessive Bay Dwell Time Rule (tmpl-26)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-26-cash-van-dwell-time directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-26-cash-van-dwell-time");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-26-cash-van-dwell-time");
      expect(templateDirect?.name).toBe("Cash Van Excessive Bay Dwell Time");
      expect(templateDirect?.category).toBe("ANPR_LOGISTICS");
      expect(templateDirect?.detectorType).toBe("vehicle");
      expect(templateDirect?.defaultSeverity).toBe("WARNING");
      expect(templateDirect?.defaultDurationMs).toBe(0); // 0ms persistence so 1200s dwell threshold triggers without double delay
      expect(templateDirect?.defaultCooldownMs).toBe(300000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("BUSINESS_HOURS");
      expect(templateDirect?.recommendedZoneTypes).toContain("CASH_VAN_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOADING_BAY");

      // Aliases
      const templateByName = await repository.getTemplate("Cash Van Excessive Bay Dwell Time");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-26-cash-van-dwell-time");

      const shortAlias = await repository.getTemplate("cash-van-dwell-time");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-26-cash-van-dwell-time");

      const numAlias = await repository.getTemplate("tmpl-26");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-26-cash-van-dwell-time");
    });

    it("verifies template metadata configuration for cash logistics dwell SLA", async () => {
      const template = await repository.getTemplate("tmpl-26-cash-van-dwell-time");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_CASH_LOGISTICS_DWELL_SLA");
      expect(template?.metadata?.targetMetrics).toEqual(["dwell_time_seconds", "bay_dwell_seconds", "vehicle_dwell_time"]);
      expect(template?.metadata?.maxDwellMinutes).toBe(20);
      expect(template?.metadata?.maxDwellSeconds).toBe(1200);
      expect(template?.metadata?.requiresEvidence).toBe(true);
      expect(template?.metadata?.serviceArea).toBe("CASH_BAY");
      expect(template?.metadata?.securityLevel).toBe("PERIMETER_LOGISTICS");
    });

    it("registers cash-van-dwell in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const dwellModel = models.find((m) => m.detector === "cash-van-dwell");

      expect(dwellModel).toBeDefined();
      expect(dwellModel?.model).toBe("Spatial Session Dwell Tracker");
      expect(dwellModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution: dwell_time_seconds across aliases and timestamps", () => {
    it("resolves direct numeric dwell and bay/van property aliases", async () => {
      // Direct dwell_time_seconds
      expect(
        (ruleEngine as any).resolveMetricValue({ dwell_time_seconds: 1260 }, "dwell_time_seconds")
      ).toBe(1260);

      // Nested metadata unwrap
      expect(
        (ruleEngine as any).resolveMetricValue({ metadata: { dwell_time_seconds: 1300 } }, "dwell_time_seconds")
      ).toBe(1300);

      // bay_dwell_seconds alias
      expect(
        (ruleEngine as any).resolveMetricValue({ bay_dwell_seconds: 1250 }, "dwell_time_seconds")
      ).toBe(1250);

      // van_dwell_seconds alias
      expect(
        (ruleEngine as any).resolveMetricValue({ van_dwell_seconds: 1400 }, "dwell_time_seconds")
      ).toBe(1400);

      // vehicle_dwell_time alias
      expect(
        (ruleEngine as any).resolveMetricValue({ vehicle_dwell_time: 1500 }, "dwell_time_seconds")
      ).toBe(1500);

      // dwell_minutes multiplied to seconds
      expect(
        (ruleEngine as any).resolveMetricValue({ dwell_minutes: 25 }, "dwell_time_seconds")
      ).toBe(1500);
    });

    it("calculates dwell elapsed seconds from arrival timestamps", async () => {
      const now = Date.now();
      const pastTime = new Date(now - 1250 * 1000).toISOString();

      // bay_entry_time
      expect(
        (ruleEngine as any).resolveMetricValue({ bay_entry_time: pastTime }, "dwell_time_seconds")
      ).toBeGreaterThanOrEqual(1249);

      // arrived_at
      expect(
        (ruleEngine as any).resolveMetricValue({ arrived_at: pastTime }, "dwell_time_seconds")
      ).toBeGreaterThanOrEqual(1249);
    });
  });

  describe("Rule Evaluation & State Lifecycles", () => {
    it("triggers immediately when dwell threshold (> 1200s) is exceeded", async () => {
      const template = await repository.getTemplate("tmpl-26-cash-van-dwell-time");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-van-dwell-1",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: template!.defaultDurationMs,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["CASH_BAY_1"],
        detectorType: template!.detectorType,
      };

      const start = new Date("2026-10-24T10:00:00.000Z");

      // Frame 1: Van dwelling at 1260s (> 1200s)
      const frame1Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: start,
        metrics: {
          dwell_time_seconds: 1260,
          license_plate: "MH-02-CV-9999",
        },
      });

      expect(frame1Result.conditionMet).toBe(true);
      expect(frame1Result.status).toBe("ACTIVE_ALERTING");
      expect(frame1Result.actions).toContain("CREATE_ALERT");
      expect(frame1Result.actions).toContain("CAPTURE_SNAPSHOT");
      expect(frame1Result.actions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(frame1Result.actions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(frame1Result.actions).toContain("NOTIFY_SOC");

      // Frame 2: Van departs (dwell resets to 0s)
      const frame2Time = new Date(start.getTime() + 60000);
      const frame2Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: frame2Time,
        metrics: {
          dwell_time_seconds: 0,
        },
      });

      expect(frame2Result.conditionMet).toBe(false);
      expect(frame2Result.status).toBe("RESOLVED");
    });

    it("does not alert when dwell is within 20m SLA (<= 1200s)", async () => {
      const template = await repository.getTemplate("tmpl-26-cash-van-dwell-time");
      const rule = {
        id: "rule-van-dwell-normal",
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
        zones: ["CASH_BAY_1"],
        detectorType: template!.detectorType,
      };

      const result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: new Date(),
        metrics: {
          dwell_time_seconds: 600, // 10 minutes (well under 20m limit)
          license_plate: "MH-02-CV-9999",
        },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.status).toBe("IDLE");
      expect(result.actions).toHaveLength(0);
    });
  });

  describe("Core Rule Engine Integration (rule-engine.ts)", () => {
    it("maps cash-van-dwell and related detection types in eventDetectionTypes", () => {
      expect(eventDetectionTypes({ detectionType: "cash-van-dwell" } as any)).toContain("cash-van-dwell");
      expect(eventDetectionTypes({ detectionType: "van-dwell" } as any)).toContain("cash-van-dwell");
      expect(eventDetectionTypes({ detectionType: "bay-dwell" } as any)).toContain("cash-van-dwell");
      expect(eventDetectionTypes({ detectionType: "vehicle-dwell" } as any)).toContain("cash-van-dwell");
    });

    it("matches vehicle rules when event has empty objects: []", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-van-dwell-core",
        name: "Cash Van Excessive Bay Dwell Time",
        detectionType: "vehicle",
        severity: "P3",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-van-dwell-01",
        detectionType: "cash-van-dwell",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [],
        metadata: {
          dwell_time_seconds: 1280,
          plate: "MH12AB1234",
        },
      };

      const matches = sortedMatchingRules([rule], event);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-van-dwell-core");
    });

    it("cross-matches vehicle object class with armored_van label", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-van-dwell-class-core",
        name: "Cash Van Excessive Bay Dwell Time",
        detectionType: "vehicle",
        severity: "P3",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: ["vehicle"],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventVan: AnalyticsEventInput = {
        eventId: "evt-van-dwell-armored",
        detectionType: "vehicle",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [{ label: "armored_van", confidence: 0.88, box: [10, 10, 50, 50] }],
      };

      const matches = sortedMatchingRules([rule], eventVan);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-van-dwell-class-core");
    });

    it("generates specific alert title and detailed description for cash van dwell alerts", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-van-dwell-title",
        name: "Cash Van Excessive Bay Dwell Time",
        detectionType: "vehicle",
        severity: "P3",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventMeta = {
        zoneName: "North Vault Loading Bay #1",
        dwell_time_seconds: 1500, // 25 minutes
        maxDwellMinutes: 20,
        plate: "KA-01-CV-7777",
      };

      const title = analyticsAlertTitle(rule, eventMeta);
      expect(title).toBe("Operations Alert: Cash Van Excessive Bay Dwell Time Exceeded");

      const description = analyticsAlertDescription(rule, eventMeta);
      expect(description).toContain("Armored logistics van (KA-01-CV-7777)");
      expect(description).toContain("exceeded turnaround limit in North Vault Loading Bay #1");
      expect(description).toContain("stationed for 25m");
      expect(description).toContain("policy threshold: 20m");
      expect(description).toContain("Extended loading exposure in violation of cash operations SLA");
    });
  });

  describe("Security Commander Anomaly Rule (cash-van-excessive-bay-dwell)", () => {
    it("evaluates and triggers cash-van-excessive-bay-dwell anomaly rule", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event1: SecurityEvent = {
        id: "sec-van-dwell-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "ai.cash_van_dwell",
        severity: "medium",
        metadata: {
          dwell_time_seconds: 1300,
          zone: "CASH_BAY",
        },
      };

      const evaluation1 = anomalyEngine.evaluate(event1);
      const match1 = evaluation1.matchedRules.find((m) => m.rule.id === "cash-van-excessive-bay-dwell");
      expect(match1).toBeDefined();
      expect(match1?.score).toBe(0.8);
      expect(match1?.reason).toContain("Armored cash logistics van exceeded maximum 20-minute turnaround bay dwell SLA");

      // Evaluation via metadata: excessive_bay_dwell === true
      const event2: SecurityEvent = {
        id: "sec-van-dwell-2",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "medium",
        metadata: {
          excessive_bay_dwell: true,
        },
      };

      const evaluation2 = anomalyEngine.evaluate(event2);
      const match2 = evaluation2.matchedRules.find((m) => m.rule.id === "cash-van-excessive-bay-dwell");
      expect(match2).toBeDefined();
      expect(match2?.score).toBe(0.8);
    });

    it("does not trigger anomaly when dwell time is under the SLA limit", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event: SecurityEvent = {
        id: "sec-van-dwell-3",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "low",
        metadata: {
          dwell_time_seconds: 900, // 15 mins
        },
      };

      const evaluation = anomalyEngine.evaluate(event);
      const match = evaluation.matchedRules.find((m) => m.rule.id === "cash-van-excessive-bay-dwell");
      expect(match).toBeUndefined();
    });
  });
});
