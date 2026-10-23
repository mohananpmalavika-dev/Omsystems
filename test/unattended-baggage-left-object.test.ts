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

describe("Unattended Baggage / Left Object Rule (tmpl-20)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-20-left-object directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-20-left-object");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-20-left-object");
      expect(templateDirect?.name).toBe("Unattended Baggage / Left Object");
      expect(templateDirect?.category).toBe("ACCESS_PERIMETER");
      expect(templateDirect?.detectorType).toBe("unattended-object");
      expect(templateDirect?.defaultSeverity).toBe("MEDIUM");
      expect(templateDirect?.defaultDurationMs).toBe(0); // 0ms persistence so 300s stationary threshold triggers without double delay
      expect(templateDirect?.defaultCooldownMs).toBe(300000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("CUSTOMER_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");
      expect(templateDirect?.recommendedZoneTypes).toContain("ATM_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("ENTRANCE");

      const templateByName = await repository.getTemplate("Unattended Baggage / Left Object");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-20-left-object");

      const shortAlias = await repository.getTemplate("left-object");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-20-left-object");

      const numAlias = await repository.getTemplate("tmpl-20");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-20-left-object");
    });

    it("lists tmpl-20 under ACCESS_PERIMETER category", async () => {
      const accessTemplates = await repository.listTemplates("ACCESS_PERIMETER");
      const found = accessTemplates.find((t) => t.id === "tmpl-20-left-object");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Unattended Baggage / Left Object");
    });

    it("includes unattended-object and left-object in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const unattendedModel = models.find((m) => m.detector === "unattended-object");
      const leftObjectModel = models.find((m) => m.detector === "left-object");
      const abandonedModel = models.find((m) => m.detector === "abandoned-object");

      expect(unattendedModel).toBeDefined();
      expect(leftObjectModel).toBeDefined();
      expect(abandonedModel).toBeDefined();

      expect(unattendedModel?.status).toBe("PRODUCTION_READY");
      expect(unattendedModel?.confidenceThreshold).toBeGreaterThanOrEqual(0.7);
      expect(unattendedModel?.targetFps).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Metric Resolution & Aliasing", () => {
    it("resolves various stationary duration telemetry formats", () => {
      expect(ruleEngine.resolveMetricValue({ stationary_duration_seconds: 320 }, "stationary_duration_seconds")).toBe(320);
      expect(ruleEngine.resolveMetricValue({ stationaryDurationSeconds: 350 }, "stationary_duration_seconds")).toBe(350);
      expect(ruleEngine.resolveMetricValue({ stationary_duration_sec: 310 }, "stationary_duration_seconds")).toBe(310);
      expect(ruleEngine.resolveMetricValue({ stationaryDurationSec: 315 }, "stationary_duration_seconds")).toBe(315);
      expect(ruleEngine.resolveMetricValue({ unattended_duration_seconds: 330 }, "stationary_duration_seconds")).toBe(330);
      expect(ruleEngine.resolveMetricValue({ unattended_seconds: 305 }, "stationary_duration_seconds")).toBe(305);
      expect(ruleEngine.resolveMetricValue({ dwellTimeSeconds: 340 }, "stationary_duration_seconds")).toBe(340);
      expect(ruleEngine.resolveMetricValue({ dwell_time_seconds: 345 }, "stationary_duration_seconds")).toBe(345);
      expect(ruleEngine.resolveMetricValue({ abandoned_duration_seconds: 360 }, "stationary_duration_seconds")).toBe(360);
      expect(ruleEngine.resolveMetricValue({ unattended_object_detected: true }, "stationary_duration_seconds")).toBe(301);
    });

    it("resolves unattended detected flags", () => {
      expect(ruleEngine.resolveMetricValue({ unattended_detected: true }, "unattended_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ left_object_detected: true }, "unattended_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ abandoned_object_detected: true }, "unattended_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ unattended_baggage: true }, "unattended_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ stationary_duration_seconds: 320 }, "unattended_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ stationary_duration_seconds: 120 }, "unattended_detected")).toBeUndefined();
    });

    it("returns undefined for empty metrics", () => {
      expect(ruleEngine.resolveMetricValue({}, "stationary_duration_seconds")).toBeUndefined();
      expect(ruleEngine.resolveMetricValue({}, "unattended_detected")).toBeUndefined();
    });
  });

  describe("Rule Evaluation & State Lifecycle", () => {
    const testTime = new Date("2026-03-24T14:30:00Z");

    it("triggers alert immediately when stationary duration exceeds 300 seconds", async () => {
      const rule = {
        id: "rule-unattended-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-20-left-object",
        name: "Lobby Unattended Baggage Monitor",
        category: "ACCESS_PERIMETER" as const,
        description: "Detects static packages, bags, or items left unattended in public corridors.",
        detectorType: "unattended-object" as const,
        condition: { metric: "stationary_duration_seconds", operator: "GREATER_THAN" as const, value: 300 },
        durationMs: 0,
        severity: "MEDIUM" as const,
        cooldownMs: 300000,
        actions: ["CREATE_ALERT" as const, "CAPTURE_SNAPSHOT" as const, "NOTIFY_BRANCH_MANAGER" as const],
        zoneTypes: ["CUSTOMER_AREA" as const, "ENTRANCE" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: testTime,
        metrics: {
          stationary_duration_seconds: 325,
          zoneName: "Branch Customer Hall",
          objectType: "Black Backpack",
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.status).toBe("ACTIVE_ALERTING");
      expect(result.evidenceSnapshotRequired).toBe(true);
    });

    it("does not trigger when stationary duration is below or equal to 300 seconds", async () => {
      const rule = {
        id: "rule-unattended-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-20-left-object",
        name: "Lobby Unattended Baggage Monitor",
        category: "ACCESS_PERIMETER" as const,
        description: "Detects static packages, bags, or items left unattended in public corridors.",
        detectorType: "unattended-object" as const,
        condition: { metric: "stationary_duration_seconds", operator: "GREATER_THAN" as const, value: 300 },
        durationMs: 0,
        severity: "MEDIUM" as const,
        cooldownMs: 300000,
        actions: ["CREATE_ALERT" as const],
        zoneTypes: ["CUSTOMER_AREA" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: testTime,
        metrics: { stationary_duration_seconds: 240 }, // Under 300s SLA
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
      expect(result.alertRequired).toBe(false);
      expect(result.status).toBe("IDLE");
    });

    it("transitions state to RESOLVED when left object is removed", async () => {
      const rule = {
        id: "rule-unattended-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-20-left-object",
        name: "Lobby Unattended Baggage Monitor",
        category: "ACCESS_PERIMETER" as const,
        description: "Detects static packages, bags, or items left unattended.",
        detectorType: "unattended-object" as const,
        condition: { metric: "stationary_duration_seconds", operator: "GREATER_THAN" as const, value: 300 },
        durationMs: 0,
        severity: "MEDIUM" as const,
        cooldownMs: 300000,
        actions: ["CREATE_ALERT" as const],
        zoneTypes: ["CUSTOMER_AREA" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      // Step 1: Object remains stationary for 350s -> Alert triggers
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: testTime,
        metrics: { stationary_duration_seconds: 350 },
      });

      // Step 2: Customer / staff retrieves object -> stationary duration resets
      const clearTime = new Date(testTime.getTime() + 10000);
      const clearedResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: clearTime,
        metrics: { stationary_duration_seconds: 0 },
      });

      expect(clearedResult.triggered).toBe(false);
      expect(clearedResult.alertRequired).toBe(false);
      expect(clearedResult.status).toBe("RESOLVED");
    });
  });

  describe("Event Detection Types & Object Class Matching", () => {
    it("matches rule across unattended-object, left-object, and abandoned-object detection types", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-core-left-object",
        name: "Unattended Baggage / Left Object",
        detectionType: "unattended-object",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: ["bag", "package"],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      // Event with detectionType: "left-object" and empty objects array (sensor summary)
      const eventSummary: AnalyticsEventInput = {
        eventId: "evt-unattended-01",
        detectionType: "left-object",
        confidence: 0.85,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [],
        metadata: { stationary_duration_seconds: 350 },
      };

      const matchedRules = sortedMatchingRules([coreRule], eventSummary);
      expect(matchedRules.length).toBe(1);
      expect(matchedRules[0].id).toBe("rule-core-left-object");

      // Verify eventDetectionTypes mappings
      const mappedTypes = eventDetectionTypes(eventSummary);
      expect(mappedTypes).toContain("unattended-object");
      expect(mappedTypes).toContain("left-object");
      expect(mappedTypes).toContain("abandoned-object");
      expect(mappedTypes).toContain("object");
    });

    it("matches backpack and suitcase object classes against bag filter", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-core-left-object",
        name: "Unattended Baggage / Left Object",
        detectionType: "unattended-object",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: ["bag"],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventBackpack: AnalyticsEventInput = {
        eventId: "evt-unattended-02",
        detectionType: "unattended-object",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [{ label: "backpack", confidence: 0.88, box: [10, 10, 50, 50] }],
        metadata: { stationary_duration_seconds: 310 },
      };

      const matchedRules = sortedMatchingRules([coreRule], eventBackpack);
      expect(matchedRules.length).toBe(1);
    });

    it("generates descriptive alert title and detail description", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-core-left-object",
        name: "Unattended Baggage / Left Object",
        detectionType: "unattended-object",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 300,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const title = analyticsAlertTitle(coreRule, { zoneName: "ATM Lobby" });
      expect(title).toBe("Security Alert: Unattended Baggage / Left Object Detected");

      const desc = analyticsAlertDescription(coreRule, {
        zoneName: "ATM Vestibule Area",
        stationary_duration_seconds: 360,
        objectType: "Unclaimed Suitcase",
      });
      expect(desc).toContain("ATM Vestibule Area");
      expect(desc).toContain("Unclaimed Suitcase");
      expect(desc).toContain("6m");
      expect(desc).toContain("Potential security hazard");
    });
  });

  describe("Security Commander Anomaly Correlation", () => {
    it("flags unattended baggage anomalies with score 0.85", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const unattendedSecurityEvent: SecurityEvent = {
        id: "sec-event-unattended-01",
        tenantId: "tenant-001",
        type: "ai.unattended_object",
        source: "analytics",
        timestamp: new Date("2026-03-24T14:30:00Z"),
        severity: "medium",
        metadata: {
          stationary_duration_seconds: 320,
          zone: "Main Customer Area",
        },
      };

      const evaluation = anomalyEngine.evaluate(unattendedSecurityEvent);
      const matched = evaluation.matchedRules.find((m) => m.rule.id === "unattended-object");

      expect(matched).toBeDefined();
      expect(matched?.score).toBe(0.85);
      expect(matched?.reason).toContain("Unattended object/baggage detected");
    });
  });
});
