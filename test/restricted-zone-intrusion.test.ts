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

describe("Restricted Zone Intrusion Rule (tmpl-11)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-11-restricted-zone-intrusion directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-11-restricted-zone-intrusion");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-11-restricted-zone-intrusion");
      expect(templateDirect?.name).toBe("Restricted Zone Intrusion");
      expect(templateDirect?.category).toBe("ACCESS_PERIMETER");
      expect(templateDirect?.detectorType).toBe("zone");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(0); // Immediate alert for perimeter breaches
      expect(templateDirect?.defaultCooldownMs).toBe(30000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("POPUP_LIVE_VIEW");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("RESTRICTED_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");
      expect(templateDirect?.recommendedZoneTypes).toContain("SERVER_ROOM");
      expect(templateDirect?.recommendedZoneTypes).toContain("STRONG_ROOM");
      expect(templateDirect?.recommendedZoneTypes).toContain("VAULT");
      expect(templateDirect?.recommendedZoneTypes).toContain("CASH_CABIN");

      const templateByName = await repository.getTemplate("Restricted Zone Intrusion");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-11-restricted-zone-intrusion");

      const shortAlias = await repository.getTemplate("restricted-zone-intrusion");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-11-restricted-zone-intrusion");

      const numAlias = await repository.getTemplate("tmpl-11");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-11-restricted-zone-intrusion");
    });

    it("lists tmpl-11 under ACCESS_PERIMETER category", async () => {
      const accessTemplates = await repository.listTemplates("ACCESS_PERIMETER");
      const found = accessTemplates.find((t) => t.id === "tmpl-11-restricted-zone-intrusion");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Restricted Zone Intrusion");
    });

    it("includes intrusion and zone-intrusion in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const zoneModel = models.find((m) => m.detector === "zone");
      const intrusionModel = models.find((m) => m.detector === "intrusion");
      const zoneIntrusionModel = models.find((m) => m.detector === "zone-intrusion");
      const perimeterModel = models.find((m) => m.detector === "perimeter-intrusion");

      expect(zoneModel).toBeDefined();
      expect(intrusionModel).toBeDefined();
      expect(zoneIntrusionModel).toBeDefined();
      expect(perimeterModel).toBeDefined();

      expect(intrusionModel?.status).toBe("PRODUCTION_READY");
      expect(intrusionModel?.confidenceThreshold).toBeGreaterThanOrEqual(0.8);
      expect(intrusionModel?.targetFps).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Metric Resolution & Aliasing", () => {
    it("resolves various intrusion telemetry formats", () => {
      expect(ruleEngine.resolveMetricValue({ intrusion_detected: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intrusionDetected: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intrusion: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intrusion: "detected" }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intrusion: "active" }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ zone_intrusion: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ zoneIntrusion: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intruder_detected: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ unauthorized_presence: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ perimeter_breach: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ zone_breach: true }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intruder_count: 1 }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ intrusions: ["i1"] }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ transition: "ENTERED_ZONE" }, "intrusion_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ event: "zone_intrusion" }, "intrusion_detected")).toBe(true);
    });

    it("resolves intruder count metrics", () => {
      expect(ruleEngine.resolveMetricValue({ intruder_count: 2 }, "intruder_count")).toBe(2);
      expect(ruleEngine.resolveMetricValue({ intruderCount: 3 }, "intruder_count")).toBe(3);
      expect(ruleEngine.resolveMetricValue({ intrusion_detected: true }, "intruder_count")).toBe(1);
      expect(ruleEngine.resolveMetricValue({}, "intruder_count")).toBeUndefined();
    });

    it("returns undefined for empty metrics", () => {
      expect(ruleEngine.resolveMetricValue({}, "intrusion_detected")).toBeUndefined();
    });
  });

  describe("Rule Evaluation & State Lifecycle", () => {
    const testTime = new Date("2026-03-24T14:30:00Z");

    it("triggers alert immediately when intrusion is detected", async () => {
      const rule = {
        id: "rule-intrusion-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-11-restricted-zone-intrusion",
        name: "Locker Room Restricted Intrusion",
        category: "ACCESS_PERIMETER" as const,
        description: "Immediate alarm when unauthorized presence is detected inside locker perimeter.",
        detectorType: "zone" as const,
        condition: { metric: "intrusion_detected", operator: "EQUALS" as const, value: true },
        durationMs: 0,
        severity: "CRITICAL" as const,
        cooldownMs: 30000,
        actions: ["CREATE_ALERT" as const, "CREATE_INCIDENT" as const, "NOTIFY_SOC" as const],
        zoneTypes: ["LOCKER" as const, "RESTRICTED_AREA" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: testTime,
        metrics: { intrusion_detected: true, zoneName: "Locker Room Vault", trackId: "TRK-9876" },
      });

      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.status).toBe("ACTIVE_ALERTING");
      expect(result.conditionMet).toBe(true);
    });

    it("does not trigger when intrusion condition is false or normal", async () => {
      const rule = {
        id: "rule-intrusion-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-11-restricted-zone-intrusion",
        name: "Locker Room Restricted Intrusion",
        category: "ACCESS_PERIMETER" as const,
        description: "Immediate alarm when unauthorized presence is detected.",
        detectorType: "zone" as const,
        condition: { metric: "intrusion_detected", operator: "EQUALS" as const, value: true },
        durationMs: 0,
        severity: "CRITICAL" as const,
        cooldownMs: 30000,
        actions: ["CREATE_ALERT" as const],
        zoneTypes: ["LOCKER" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: testTime,
        metrics: { intrusion_detected: false },
      });

      expect(result.triggered).toBe(false);
      expect(result.alertRequired).toBe(false);
      expect(result.status).toBe("IDLE");
    });

    it("transitions state to RESOLVED when condition clears", async () => {
      const rule = {
        id: "rule-intrusion-01",
        tenantId: "tenant-nbfc-main",
        branchId: "branch-001",
        templateId: "tmpl-11-restricted-zone-intrusion",
        name: "Locker Room Restricted Intrusion",
        category: "ACCESS_PERIMETER" as const,
        description: "Immediate alarm when unauthorized presence is detected.",
        detectorType: "zone" as const,
        condition: { metric: "intrusion_detected", operator: "EQUALS" as const, value: true },
        durationMs: 0,
        severity: "CRITICAL" as const,
        cooldownMs: 30000,
        actions: ["CREATE_ALERT" as const],
        zoneTypes: ["LOCKER" as const],
        schedule: "24X7" as const,
        enabled: true,
        createdBy: "sec_officer",
        version: 1,
        createdAt: testTime.toISOString(),
        updatedAt: testTime.toISOString(),
      };

      // Step 1: Intrusion breaches perimeter
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: testTime,
        metrics: { intrusion_detected: true },
      });

      // Step 2: Intruder leaves perimeter, sensor clears
      const clearTime = new Date(testTime.getTime() + 15000);
      const clearedResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: clearTime,
        metrics: { intrusion_detected: false },
      });

      expect(clearedResult.triggered).toBe(false);
      expect(clearedResult.alertRequired).toBe(false);
      expect(clearedResult.status).toBe("RESOLVED");
    });
  });

  describe("Event Detection Types & Object Matching", () => {
    it("matches rule across zone, intrusion, and zone-intrusion detection types", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-core-intrusion",
        name: "Restricted Zone Intrusion",
        detectionType: "zone",
        severity: "CRITICAL",
        minConfidence: 0.8,
        minDurationSeconds: 0,
        cooldownSeconds: 30,
        direction: "any",
        objectClasses: ["person"],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      // Event from edge AI with detectionType: "intrusion" and empty objects array (metadata summary)
      const eventIntrusion: AnalyticsEventInput = {
        eventId: "evt-intrusion-01",
        detectionType: "intrusion",
        confidence: 0.95,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [],
        metadata: { intrusion_detected: true },
      };

      const matchedRules = sortedMatchingRules([coreRule], eventIntrusion);
      expect(matchedRules.length).toBe(1);
      expect(matchedRules[0].id).toBe("rule-core-intrusion");

      // Also verifies eventDetectionTypes maps correctly
      const mappedTypes = eventDetectionTypes(eventIntrusion);
      expect(mappedTypes).toContain("zone");
      expect(mappedTypes).toContain("intrusion");
      expect(mappedTypes).toContain("zone-intrusion");
      expect(mappedTypes).toContain("person");
    });

    it("generates descriptive alert title and detail description", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-core-intrusion",
        name: "Restricted Zone Intrusion",
        detectionType: "zone-intrusion",
        severity: "CRITICAL",
        minConfidence: 0.8,
        minDurationSeconds: 0,
        cooldownSeconds: 30,
        direction: "any",
        objectClasses: ["person"],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      const title = analyticsAlertTitle(coreRule, { zoneName: "Main Strong Room" });
      expect(title).toBe("Critical Security Alert: Restricted Zone Intrusion Detected");

      const desc = analyticsAlertDescription(coreRule, {
        zoneName: "Main Strong Room Vault",
        trackId: "SUBJ-409",
      });
      expect(desc).toContain("Main Strong Room Vault");
      expect(desc).toContain("SUBJ-409");
      expect(desc).toContain("Unauthorized presence or perimeter intrusion detected");
    });
  });

  describe("Security Commander Anomaly Correlation", () => {
    it("flags restricted zone intrusion anomalies with score 0.95", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const intrusionSecurityEvent: SecurityEvent = {
        id: "sec-event-intrusion-01",
        tenantId: "tenant-001",
        type: "ai.intrusion",
        source: "analytics",
        timestamp: new Date("2026-03-24T14:30:00Z"),
        severity: "critical",
        metadata: {
          intrusion_detected: true,
          intruder_count: 1,
          zone: "Strong Room Vault",
        },
      };

      const evaluation = anomalyEngine.evaluate(intrusionSecurityEvent);
      const matched = evaluation.matchedRules.find((m) => m.rule.id === "restricted-zone-intrusion");

      expect(matched).toBeDefined();
      expect(matched?.score).toBe(0.95);
      expect(matched?.reason).toContain("Restricted zone intrusion detected");
    });
  });
});
