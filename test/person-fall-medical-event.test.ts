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

describe("Person Fall / Medical Event Rule (tmpl-18)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-18-person-fall directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-18-person-fall");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-18-person-fall");
      expect(templateDirect?.name).toBe("Person Fall / Medical Event");
      expect(templateDirect?.category).toBe("HEALTH_SAFETY");
      expect(templateDirect?.detectorType).toBe("fall");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(5000);
      expect(templateDirect?.defaultCooldownMs).toBe(60000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("POPUP_LIVE_VIEW");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("CUSTOMER_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("STAFF_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("ATM_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("QUEUE_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("CASH_COUNTER");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");

      // Aliases
      const templateByName = await repository.getTemplate("Person Fall / Medical Event");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-18-person-fall");

      const shortAlias = await repository.getTemplate("person-fall");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-18-person-fall");

      const numAlias = await repository.getTemplate("tmpl-18");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-18-person-fall");

      const fallDetectionAlias = await repository.getTemplate("fall-detection");
      expect(fallDetectionAlias).toBeDefined();
      expect(fallDetectionAlias?.id).toBe("tmpl-18-person-fall");

      const manDownAlias = await repository.getTemplate("man-down");
      expect(manDownAlias).toBeDefined();
      expect(manDownAlias?.id).toBe("tmpl-18-person-fall");

      const medicalEmergencyAlias = await repository.getTemplate("medical-emergency");
      expect(medicalEmergencyAlias).toBeDefined();
      expect(medicalEmergencyAlias?.id).toBe("tmpl-18-person-fall");
    });

    it("verifies template metadata configuration for health and safety medical policy", async () => {
      const template = await repository.getTemplate("tmpl-18-person-fall");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_HEALTH_SAFETY_MEDICAL_SLA");
      expect(template?.metadata?.targetMetrics).toEqual(["fall_detected", "person_down", "motionless_seconds"]);
      expect(template?.metadata?.validationStatus).toBe("EXPERIMENTAL");
      expect(template?.metadata?.requiresIncident).toBe(true);
      expect(template?.metadata?.serviceArea).toBe("BRANCH_WIDE");
      expect(template?.metadata?.securityLevel).toBe("HEALTH_SAFETY");
    });

    it("registers fall detectors according to formal compliance requirements in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const fallModel = models.find((m) => m.detector === "fall");
      const fallDetectionModel = models.find((m) => m.detector === "FALL_DETECTION");
      const manDownModel = models.find((m) => m.detector === "man-down");
      const medicalModel = models.find((m) => m.detector === "medical-emergency");

      // Requirement 18 & 50: Do NOT mark fall detection production ready if experimental/unvalidated
      expect(fallModel).toBeDefined();
      expect(fallModel?.status).toBe("NOT_IMPLEMENTED");

      expect(fallDetectionModel).toBeDefined();
      expect(fallDetectionModel?.status).toBe("NOT_IMPLEMENTED");

      expect(manDownModel).toBeDefined();
      expect(manDownModel?.status).toBe("PRODUCTION_READY");

      expect(medicalModel).toBeDefined();
      expect(medicalModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution & Kinematic State Aliases", () => {
    it("resolves direct boolean fall flags and kinematic aliases", () => {
      // Direct fall_detected
      expect(
        (ruleEngine as any).resolveMetricValue({ fall_detected: true }, "fall_detected")
      ).toBe(true);

      // person_down
      expect(
        (ruleEngine as any).resolveMetricValue({ person_down: true }, "fall_detected")
      ).toBe(true);

      // man_down
      expect(
        (ruleEngine as any).resolveMetricValue({ man_down: true }, "fall_detected")
      ).toBe(true);

      // medical_emergency
      expect(
        (ruleEngine as any).resolveMetricValue({ medical_emergency: true }, "fall_detected")
      ).toBe(true);

      // Phase POST_FALL_MOTIONLESS
      expect(
        (ruleEngine as any).resolveMetricValue({ phase: "POST_FALL_MOTIONLESS" }, "fall_detected")
      ).toBe(true);

      // Motionless duration >= 5s
      expect(
        (ruleEngine as any).resolveMetricValue({ motionless_seconds: 6 }, "fall_detected")
      ).toBe(true);

      // Nested unwrap in metadata
      expect(
        (ruleEngine as any).resolveMetricValue({ metadata: { fall_detected: true } }, "fall_detected")
      ).toBe(true);
    });

    it("resolves motionless duration seconds across aliases", () => {
      expect(
        (ruleEngine as any).resolveMetricValue({ motionless_seconds: 8 }, "motionless_seconds")
      ).toBe(8);

      expect(
        (ruleEngine as any).resolveMetricValue({ motionlessDurationSeconds: 12 }, "motionless_seconds")
      ).toBe(12);

      expect(
        (ruleEngine as any).resolveMetricValue({ immobility_seconds: 15 }, "motionless_seconds")
      ).toBe(15);
    });
  });

  describe("Rule Engine Lifecycle: Evaluation, Immobility Delay & Incident Actions", () => {
    it("evaluates fall with 5000ms duration immobility check and triggers emergency incident actions", async () => {
      const template = await repository.getTemplate("tmpl-18-person-fall");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-fall-atm-lobby",
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
        zones: ["ATM_LOBBY"],
        detectorType: template!.detectorType,
      };

      const start = new Date("2026-10-24T10:00:00.000Z");

      // T=0: Person falls (fall_detected: true)
      const res1 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "ATM_LOBBY",
        timestamp: start,
        metrics: {
          fall_detected: true,
          motionless_seconds: 0,
        },
      });

      // Condition met but pending 5000ms duration immobility verification window
      expect(res1.conditionMet).toBe(true);
      expect(res1.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(res1.actions).toEqual([]);

      // T=2000ms: still motionless, duration not yet elapsed (2000ms < 5000ms)
      const t2 = new Date(start.getTime() + 2000);
      const res2 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "ATM_LOBBY",
        timestamp: t2,
        metrics: {
          fall_detected: true,
          motionless_seconds: 2,
        },
      });
      expect(res2.conditionMet).toBe(true);
      expect(res2.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(res2.actions).toEqual([]);

      // T=6000ms: sustained motionless duration verified (6000ms >= 5000ms) -> transitions to ACTIVE_ALERTING
      const t3 = new Date(start.getTime() + 6000);
      const res3 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "ATM_LOBBY",
        timestamp: t3,
        metrics: {
          fall_detected: true,
          motionless_seconds: 6,
        },
      });
      expect(res3.conditionMet).toBe(true);
      expect(res3.status).toBe("ACTIVE_ALERTING");
      expect(res3.actions).toContain("CREATE_ALERT");
      expect(res3.actions).toContain("CREATE_INCIDENT");
      expect(res3.actions).toContain("POPUP_LIVE_VIEW");
      expect(res3.actions).toContain("CAPTURE_SNAPSHOT");
      expect(res3.actions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(res3.actions).toContain("NOTIFY_SOC");
      expect(res3.actions).toContain("NOTIFY_BRANCH_MANAGER");

      // T=8000ms: Subject recovers and stands up (fall_detected: false) -> transitions to RESOLVED
      const t4 = new Date(start.getTime() + 8000);
      const res4 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "ATM_LOBBY",
        timestamp: t4,
        metrics: {
          fall_detected: false,
          recovery_detected: true,
        },
      });
      expect(res4.conditionMet).toBe(false);
      expect(res4.status).toBe("RESOLVED");
    });
  });

  describe("Core Rule Engine Integration: Detection Types, Alert Titles & Descriptions", () => {
    it("maps fall and medical emergency detection types correctly in eventDetectionTypes", () => {
      const event: AnalyticsEventInput = {
        eventId: "evt-fall-01",
        cameraId: "cam-lobby-01",
        detectionType: "fall",
        confidence: 0.92,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("fall");
      expect(types).toContain("fall-detection");
      expect(types).toContain("person-fall");
      expect(types).toContain("medical-emergency");
      expect(types).toContain("man-down");
      expect(types).toContain("person");
      expect(types).toContain("zone");
    });

    it("matches core rule with empty objects array due to whitelist", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-fall-core",
        name: "Person Fall / Medical Event",
        cameraId: "cam-lobby-01",
        detectionType: "fall",
        objectClasses: ["person"],
        minConfidence: 0.7,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 60,
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-fall-02",
        cameraId: "cam-lobby-01",
        detectionType: "fall",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
        metadata: {
          fall_detected: true,
          motionless_seconds: 6,
        },
      };

      const matched = sortedMatchingRules([rule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-fall-core");
    });

    it("generates emergency alert title and informative medical description", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-fall-core",
        name: "Person Fall / Medical Event",
        cameraId: "cam-lobby-01",
        detectionType: "fall",
        objectClasses: ["person"],
        minConfidence: 0.7,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 60,
      };

      const title = analyticsAlertTitle(rule);
      expect(title).toBe("Emergency Alert: Person Fall / Medical Emergency Detected");

      const description = analyticsAlertDescription(rule, {
        zoneName: "ATM Service Vestibule",
        trackId: "TK-904",
        motionless_seconds: 7,
        fallType: "backward slip",
      });

      expect(description).toContain("Critical Health & Safety Emergency: Subject TK-904 fell (backward slip)");
      expect(description).toContain("motionless for >7s in ATM Service Vestibule");
      expect(description).toContain("Immediate on-site medical assistance and SOC emergency protocol required");
    });
  });

  describe("Security Commander Anomaly Rule: person-down", () => {
    let anomalyEngine: AnomalyRuleEngine;

    beforeEach(() => {
      anomalyEngine = new AnomalyRuleEngine();
    });

    it("triggers anomaly rule for ai.fall_detected event type", () => {
      const event: SecurityEvent = {
        id: "evt-anom-fall-01",
        type: "ai.fall_detected",
        severity: "critical",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          fall_detected: true,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "person-down");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.95);
      expect(ruleMatch?.reason).toBe("Person down - potential medical emergency");
    });

    it("triggers anomaly rule for ai.person_fall and medical.emergency types", () => {
      const event: SecurityEvent = {
        id: "evt-anom-fall-02",
        type: "medical.emergency",
        severity: "critical",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          man_down: true,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "person-down");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.95);
    });

    it("triggers anomaly rule when phase is POST_FALL_MOTIONLESS in metadata", () => {
      const event: SecurityEvent = {
        id: "evt-anom-fall-03",
        type: "safety.sensor.pose",
        severity: "high",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          phase: "POST_FALL_MOTIONLESS",
          motionless_seconds: 6,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "person-down");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.95);
    });

    it("does not trigger anomaly rule for normal upright walking motion event", () => {
      const event: SecurityEvent = {
        id: "evt-anom-fall-04",
        type: "sensor.motion",
        severity: "info",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          motion_detected: true,
          phase: "UPRIGHT",
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "person-down");
      expect(ruleMatch).toBeUndefined();
    });
  });
});
