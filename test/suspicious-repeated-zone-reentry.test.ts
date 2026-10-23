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

describe("Suspicious Repeated Zone Re-entry Rule (tmpl-31)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-31-suspicious-repeated-entry directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-31-suspicious-repeated-entry");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-31-suspicious-repeated-entry");
      expect(templateDirect?.name).toBe("Suspicious Repeated Zone Re-entry");
      expect(templateDirect?.category).toBe("ACCESS_PERIMETER");
      expect(templateDirect?.detectorType).toBe("zone");
      expect(templateDirect?.defaultSeverity).toBe("MEDIUM");
      expect(templateDirect?.defaultDurationMs).toBe(0); // 0ms to fire immediately upon reaching count
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");
      expect(templateDirect?.recommendedZoneTypes).toContain("RESTRICTED_AREA");

      const templateByName = await repository.getTemplate("Suspicious Repeated Zone Re-entry");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-31-suspicious-repeated-entry");

      const shortAlias = await repository.getTemplate("suspicious-repeated-entry");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-31-suspicious-repeated-entry");
    });

    it("lists tmpl-31 under ACCESS_PERIMETER category", async () => {
      const accessTemplates = await repository.listTemplates("ACCESS_PERIMETER");
      const found = accessTemplates.find((t) => t.id === "tmpl-31-suspicious-repeated-entry");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Suspicious Repeated Zone Re-entry");
    });

    it("includes zone-reentry and repeated-entry in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const zoneModel = models.find((m) => m.detector === "zone");
      const reentryModel = models.find((m) => m.detector === "zone-reentry");
      const repeatedModel = models.find((m) => m.detector === "repeated-entry");

      expect(zoneModel).toBeDefined();
      expect(reentryModel).toBeDefined();
      expect(reentryModel?.status).toBe("PRODUCTION_READY");
      expect(repeatedModel).toBeDefined();
    });
  });

  describe("Metric Resolution & Aliasing", () => {
    it("resolves various re-entry count telemetry formats", () => {
      expect(ruleEngine.resolveMetricValue({ reentry_count_10m: 4 }, "reentry_count_10m")).toBe(4);
      expect(ruleEngine.resolveMetricValue({ reentryCount10m: 5 }, "reentry_count_10m")).toBe(5);
      expect(ruleEngine.resolveMetricValue({ reentry_count: 4 }, "reentry_count_10m")).toBe(4);
      expect(ruleEngine.resolveMetricValue({ re_entry_count: 6 }, "reentry_count_10m")).toBe(6);
      expect(ruleEngine.resolveMetricValue({ reentries: 4 }, "reentry_count_10m")).toBe(4);
      expect(ruleEngine.resolveMetricValue({ entries: ["t1", "t2", "t3", "t4"] }, "reentry_count_10m")).toBe(4);
      expect(ruleEngine.resolveMetricValue({ reentry_detected: true }, "reentry_count_10m")).toBe(4);
    });

    it("resolves re-entry window duration metrics", () => {
      expect(ruleEngine.resolveMetricValue({ reentry_window_seconds: 600 }, "reentry_window_seconds")).toBe(600);
      expect(ruleEngine.resolveMetricValue({ windowMinutes: 10 }, "reentry_window_seconds")).toBe(600);
      expect(ruleEngine.resolveMetricValue({ time_window_minutes: 10 }, "reentry_window_seconds")).toBe(600);
      expect(ruleEngine.resolveMetricValue({}, "reentry_window_seconds")).toBeUndefined();
    });
  });

  describe("Rule Evaluation & State Lifecycle", () => {
    const testTime = new Date("2026-03-24T14:30:00Z");

    it("triggers alert immediately when re-entry count exceeds threshold (> 3)", async () => {
      const template = await repository.getTemplate("tmpl-31-suspicious-repeated-entry");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-reentry-01",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Suspicious Repeated Zone Re-entry",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: template!.defaultDurationMs, // 0ms
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "24X7" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-corridor-01",
        zoneId: "zone-vault-corridor",
        timestamp: testTime,
        metrics: {
          reentry_count_10m: 4, // exceeds > 3
          trackId: "subject-anon-789",
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.evidenceSnapshotRequired).toBe(true);
      expect(result.socNotificationRequired).toBe(true);
      expect(result.severity).toBe("MEDIUM");
    });

    it("does not trigger when re-entry count is below or equal to 3", async () => {
      const template = await repository.getTemplate("tmpl-31-suspicious-repeated-entry");

      const rule = {
        id: "rule-reentry-02",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Suspicious Repeated Zone Re-entry",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 0,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "24X7" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-corridor-01",
        timestamp: testTime,
        metrics: {
          reentry_count_10m: 3, // not > 3
        },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
      expect(result.alertRequired).toBe(false);
    });

    it("transitions state to RESOLVED when count drops back below threshold", async () => {
      const template = await repository.getTemplate("tmpl-31-suspicious-repeated-entry");

      const rule = {
        id: "rule-reentry-03",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Suspicious Repeated Zone Re-entry",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 0,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "24X7" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Alerting observation
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-corridor-02",
        timestamp: testTime,
        metrics: { reentry_count_10m: 5 },
      });

      // 2. Window rolled over: count drops to 1
      const resolved = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-corridor-02",
        timestamp: new Date(testTime.getTime() + 600000),
        metrics: { reentry_count_10m: 1 },
      });

      expect(resolved.conditionMet).toBe(false);
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.triggered).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    it("matches rule across zone, zone-reentry, and repeated-entry detection types", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-reentry-01",
        name: "Suspicious Repeated Zone Re-entry",
        detectionType: "zone",
        severity: "P2",
        minConfidence: 0.5,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      const eventZoneReentry: AnalyticsEventInput = {
        eventId: "evt-reentry-01",
        detectionType: "zone-reentry",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00.000Z",
        objects: [],
        metadata: { zoneName: "Locker Corridor", reentry_count_10m: 4 },
      };

      const matches = sortedMatchingRules([rule], eventZoneReentry);
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe("core-rule-reentry-01");

      const eventRepeatedEntry: AnalyticsEventInput = {
        eventId: "evt-reentry-02",
        detectionType: "repeated-entry",
        confidence: 0.88,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00.000Z",
        objects: [],
        metadata: { zoneName: "Restricted Server Area", reentry_count_10m: 5 },
      };

      const matchesRepeated = sortedMatchingRules([rule], eventRepeatedEntry);
      expect(matchesRepeated.length).toBe(1);
    });

    it("generates descriptive alert title and detail description", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-reentry-02",
        name: "Suspicious Repeated Zone Re-entry",
        detectionType: "zone",
        severity: "P2",
        minConfidence: 0.5,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      const title = analyticsAlertTitle(rule);
      expect(title).toBe("Suspicious Activity: Repeated Zone Re-entry Detected");

      const desc = analyticsAlertDescription(rule, {
        zoneName: "Locker Room Secure Airlock",
        reentry_count_10m: 4,
        windowMinutes: 10,
        trackId: "ANON_88",
      });
      expect(desc).toContain("Locker Room Secure Airlock");
      expect(desc).toContain("4 times in 10 minutes");
      expect(desc).toContain("ANON_88");
      expect(desc).toContain("reconnaissance pattern detected");
    });
  });

  describe("Security Commander Anomaly Engine Integration", () => {
    it("flags repeated zone re-entry anomalies with score 0.85", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event: SecurityEvent = {
        id: "sec-evt-reentry-01",
        tenantId: "tenant-001",
        type: "ai.repeated_entry",
        source: "analytics",
        timestamp: new Date("2026-03-24T14:30:00Z"),
        severity: "high",
        metadata: {
          reentry_count_10m: 4,
          zone: "vault-corridor",
        },
      };

      const evaluation = anomalyEngine.evaluate(event);
      const matched = evaluation.matchedRules.find((m) => m.rule.id === "suspicious-repeated-zone-reentry");

      expect(matched).toBeDefined();
      expect(matched?.score).toBe(0.85);
      expect(matched?.reason).toContain("Suspicious repeated zone re-entry");
    });
  });
});
