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

describe("Directional Line Crossing Rule (tmpl-12)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-12-line-crossing directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-12-line-crossing");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-12-line-crossing");
      expect(templateDirect?.name).toBe("Directional Line Crossing");
      expect(templateDirect?.category).toBe("ACCESS_PERIMETER");
      expect(templateDirect?.detectorType).toBe("line-crossing");
      expect(templateDirect?.defaultSeverity).toBe("HIGH");
      expect(templateDirect?.defaultDurationMs).toBe(0);
      expect(templateDirect?.defaultCooldownMs).toBe(30000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("ENTRANCE");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");
      expect(templateDirect?.recommendedZoneTypes).toContain("RESTRICTED_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("SERVER_ROOM");
      expect(templateDirect?.recommendedZoneTypes).toContain("STRONG_ROOM");
      expect(templateDirect?.recommendedZoneTypes).toContain("VAULT");

      // Aliases
      const templateByName = await repository.getTemplate("Directional Line Crossing");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-12-line-crossing");

      const shortAlias = await repository.getTemplate("line-crossing");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-12-line-crossing");

      const numAlias = await repository.getTemplate("tmpl-12");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-12-line-crossing");

      const tripwireAlias = await repository.getTemplate("tripwire");
      expect(tripwireAlias).toBeDefined();
      expect(tripwireAlias?.id).toBe("tmpl-12-line-crossing");

      const virtualBoundaryAlias = await repository.getTemplate("virtual-boundary");
      expect(virtualBoundaryAlias).toBeDefined();
      expect(virtualBoundaryAlias?.id).toBe("tmpl-12-line-crossing");
    });

    it("verifies template metadata configuration for perimeter tripwire policy", async () => {
      const template = await repository.getTemplate("tmpl-12-line-crossing");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_PERIMETER_TRIPWIRE_POLICY");
      expect(template?.metadata?.targetMetrics).toEqual(["line_crossing", "crossing_direction", "direction"]);
      expect(template?.metadata?.supportedDirections).toEqual(["A_TO_B", "B_TO_A", "BOTH"]);
      expect(template?.metadata?.requiresIncident).toBe(true);
      expect(template?.metadata?.serviceArea).toBe("PERIMETER_ACCESS");
      expect(template?.metadata?.securityLevel).toBe("HIGH_SECURITY");
    });

    it("registers line-crossing and tripwire detectors in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const lineCrossingModel = models.find((m) => m.detector === "line-crossing");
      const tripwireModel = models.find((m) => m.detector === "tripwire");
      const directionalModel = models.find((m) => m.detector === "directional-line-crossing");

      expect(lineCrossingModel).toBeDefined();
      expect(lineCrossingModel?.model).toBe("Virtual Tripwire Spatial Vector Engine");
      expect(lineCrossingModel?.status).toBe("PRODUCTION_READY");

      expect(tripwireModel).toBeDefined();
      expect(tripwireModel?.model).toBe("Virtual Tripwire Spatial Vector Engine");
      expect(tripwireModel?.status).toBe("PRODUCTION_READY");

      expect(directionalModel).toBeDefined();
      expect(directionalModel?.model).toBe("Virtual Tripwire Spatial Vector Engine");
      expect(directionalModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution & Direction Normalization", () => {
    it("resolves direct string line crossing and directional aliases", () => {
      // Direct line_crossing
      expect(
        (ruleEngine as any).resolveMetricValue({ line_crossing: "A_TO_B" }, "line_crossing")
      ).toBe("A_TO_B");

      // Boolean flag with direction
      expect(
        (ruleEngine as any).resolveMetricValue({ line_crossing: true, direction: "A_TO_B" }, "line_crossing")
      ).toBe("A_TO_B");

      // lineCrossing camelCase
      expect(
        (ruleEngine as any).resolveMetricValue({ lineCrossing: "B_TO_A" }, "line_crossing")
      ).toBe("B_TO_A");

      // crossing_direction
      expect(
        (ruleEngine as any).resolveMetricValue({ crossing_direction: "A->B" }, "line_crossing")
      ).toBe("A->B");

      // tripwire_direction
      expect(
        (ruleEngine as any).resolveMetricValue({ tripwire_direction: "IN" }, "line_crossing")
      ).toBe("IN");

      // Nested unwrap in metadata
      expect(
        (ruleEngine as any).resolveMetricValue({ metadata: { line_crossing: "A_TO_B" } }, "line_crossing")
      ).toBe("A_TO_B");
    });

    it("evaluates CROSSED_LINE condition with direction aliases and normalization", () => {
      const condition = { metric: "line_crossing", operator: "CROSSED_LINE" as const, value: "A_TO_B" };

      // Exact match
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "A_TO_B" })).toBe(true);

      // Dash/arrow format A->B
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "A->B" })).toBe(true);

      // Direction keyword IN / ENTRY
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "IN" })).toBe(true);
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "ENTRY" })).toBe(true);

      // Opposite direction does not trigger
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "B_TO_A" })).toBe(false);
      expect(ruleEngine.evaluateSingleCondition(condition, { line_crossing: "EXIT" })).toBe(false);
    });

    it("evaluates bidirectional BOTH matching in CROSSED_LINE condition", () => {
      const bothCondition = { metric: "line_crossing", operator: "CROSSED_LINE" as const, value: "BOTH" };

      // Both matches A_TO_B and B_TO_A
      expect(ruleEngine.evaluateSingleCondition(bothCondition, { line_crossing: "A_TO_B" })).toBe(true);
      expect(ruleEngine.evaluateSingleCondition(bothCondition, { line_crossing: "B_TO_A" })).toBe(true);
      expect(ruleEngine.evaluateSingleCondition(bothCondition, { line_crossing: "IN" })).toBe(true);
      expect(ruleEngine.evaluateSingleCondition(bothCondition, { line_crossing: "OUT" })).toBe(true);

      // Specific rule triggers when crossing is bidirectional
      const singleCondition = { metric: "line_crossing", operator: "CROSSED_LINE" as const, value: "A_TO_B" };
      expect(ruleEngine.evaluateSingleCondition(singleCondition, { line_crossing: "BOTH" })).toBe(true);
      expect(ruleEngine.evaluateSingleCondition(singleCondition, { line_crossing: "BIDIRECTIONAL" })).toBe(true);
    });
  });

  describe("Rule Engine Lifecycle: Immediate Trigger & Actions", () => {
    it("triggers immediately on unauthorized crossing and issues incident actions", async () => {
      const template = await repository.getTemplate("tmpl-12-line-crossing");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-tripwire-vault-entry",
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
        zones: ["VAULT_PERIMETER"],
        detectorType: template!.detectorType,
      };

      const now = new Date("2026-10-24T10:00:00.000Z");

      // Frame 1: Crossing line in A_TO_B direction
      const res1 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_PERIMETER",
        timestamp: now,
        metrics: {
          line_crossing: "A_TO_B",
          line_name: "Vault Perimeter Tripwire",
        },
      });

      expect(res1.conditionMet).toBe(true);
      expect(res1.status).toBe("ACTIVE_ALERTING");
      expect(res1.actions).toContain("CREATE_ALERT");
      expect(res1.actions).toContain("CREATE_INCIDENT");
      expect(res1.actions).toContain("CAPTURE_SNAPSHOT");
      expect(res1.actions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(res1.actions).toContain("NOTIFY_SOC");
      expect(res1.actions).toContain("NOTIFY_BRANCH_MANAGER");

      // Frame 2: Condition clears
      const res2 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_PERIMETER",
        timestamp: new Date(now.getTime() + 1000),
        metrics: {},
      });

      expect(res2.conditionMet).toBe(false);
      expect(res2.status).toBe("RESOLVED");
    });
  });

  describe("Core Rule Engine Integration: Detection Types, Alert Titles & Descriptions", () => {
    it("maps line-crossing and tripwire types in eventDetectionTypes", () => {
      const event: AnalyticsEventInput = {
        eventId: "evt-lc-01",
        cameraId: "cam-vault-entrance",
        detectionType: "line-crossing",
        confidence: 0.95,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("line-crossing");
      expect(types).toContain("tripwire");
      expect(types).toContain("directional-line-crossing");
      expect(types).toContain("zone");
      expect(types).toContain("person");
    });

    it("matches core rule with empty objects array due to whitelist", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-tripwire-core",
        name: "Directional Line Crossing",
        cameraId: "cam-vault-entrance",
        detectionType: "line-crossing",
        objectClasses: ["person"],
        minConfidence: 0.8,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 30,
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-lc-02",
        cameraId: "cam-vault-entrance",
        detectionType: "line-crossing",
        confidence: 0.95,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
        metadata: {
          direction: "A_TO_B",
          lineName: "Strong Room Virtual Threshold",
        },
      };

      const matched = sortedMatchingRules([rule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-tripwire-core");
    });

    it("generates specific alert title and informative description", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-tripwire-core",
        name: "Directional Line Crossing",
        cameraId: "cam-vault-entrance",
        detectionType: "line-crossing",
        objectClasses: ["person"],
        minConfidence: 0.8,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 30,
      };

      const title = analyticsAlertTitle(rule);
      expect(title).toBe("Security Alert: Directional Line Crossing Detected");

      const description = analyticsAlertDescription(rule, {
        lineName: "Strong Room Virtual Threshold",
        direction: "A->B",
        targetType: "Unauthorized person",
      });

      expect(description).toContain("Unauthorized person crossed Strong Room Virtual Threshold in unauthorized direction (A->B)");
      expect(description).toContain("Virtual perimeter boundary breach detected requiring security verification");
    });
  });

  describe("Security Commander Anomaly Rule: directional-line-crossing", () => {
    let anomalyEngine: AnomalyRuleEngine;

    beforeEach(() => {
      anomalyEngine = new AnomalyRuleEngine();
    });

    it("triggers anomaly rule for ai.line_crossing event type", () => {
      const event: SecurityEvent = {
        id: "evt-anom-lc-01",
        type: "ai.line_crossing",
        severity: "high",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          crossing_direction: "A_TO_B",
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "directional-line-crossing");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.85);
      expect(ruleMatch?.reason).toBe("Directional line crossing / virtual tripwire boundary breach detected");
    });

    it("triggers anomaly rule when line_crossed or tripwire_triggered is true", () => {
      const event: SecurityEvent = {
        id: "evt-anom-lc-02",
        type: "perimeter.alert",
        severity: "high",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          tripwire_triggered: true,
          direction: "A_TO_B",
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "directional-line-crossing");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.85);
    });

    it("triggers anomaly rule when line_crossing string is present in metadata", () => {
      const event: SecurityEvent = {
        id: "evt-anom-lc-03",
        type: "sensor.boundary",
        severity: "warning",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          line_crossing: "IN",
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "directional-line-crossing");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.85);
    });

    it("does not trigger anomaly rule for unrelated regular motion event without line crossing", () => {
      const event: SecurityEvent = {
        id: "evt-anom-lc-04",
        type: "sensor.motion",
        severity: "info",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          motion_detected: true,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "directional-line-crossing");
      expect(ruleMatch).toBeUndefined();
    });
  });
});
