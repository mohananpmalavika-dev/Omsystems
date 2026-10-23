import { describe, it, expect, beforeEach } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import {
  sortedMatchingRules,
  analyticsAlertTitle,
  analyticsAlertDescription,
  eventDetectionTypes,
} from "../src/analytics/rule-engine.js";
import type { AnalyticsRule as CoreAnalyticsRule } from "../src/domain/models.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

describe("Camera Tampering / Scene Shift Rule (tmpl-14)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-14-camera-tamper directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-14-camera-tamper");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-14-camera-tamper");
      expect(templateDirect?.name).toBe("Camera Tampering / Scene Shift");
      expect(templateDirect?.category).toBe("HARDWARE_CONTINUITY");
      expect(templateDirect?.detectorType).toBe("camera-tamper");
      expect(templateDirect?.defaultSeverity).toBe("HIGH");
      expect(templateDirect?.defaultDurationMs).toBe(5000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("ALL");

      const templateByName = await repository.getTemplate("Camera Tampering / Scene Shift");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-14-camera-tamper");

      const shortAlias = await repository.getTemplate("camera-tamper");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-14-camera-tamper");
    });

    it("lists tmpl-14 under HARDWARE_CONTINUITY category", async () => {
      const hwTemplates = await repository.listTemplates("HARDWARE_CONTINUITY");
      const found = hwTemplates.find((t) => t.id === "tmpl-14-camera-tamper");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Camera Tampering / Scene Shift");
    });

    it("includes camera-tamper and tampering aliases in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const tamperModel = models.find((m) => m.detector === "camera-tamper");
      const tamperingModel = models.find((m) => m.detector === "camera-tampering");
      const sceneShiftModel = models.find((m) => m.detector === "scene-shift");

      expect(tamperModel).toBeDefined();
      expect(tamperModel?.status).toBe("PRODUCTION_READY");
      expect(tamperingModel).toBeDefined();
      expect(sceneShiftModel).toBeDefined();
    });
  });

  describe("Metric Resolution & Aliasing", () => {
    it("resolves various tamper telemetry formats to true", () => {
      expect(ruleEngine.resolveMetricValue({ tamper_detected: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ tamperDetected: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ isTampered: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ tampered: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ scene_shift: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ camera_moved: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ lens_covered: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ defocus_detected: true }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ tamper_type: "spray" }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ tamperType: "movement" }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ sceneChangeScore: 0.85 }, "tamper_detected")).toBe(true);
      expect(ruleEngine.resolveMetricValue({ structuralSimilarity: 0.25 }, "tamper_detected")).toBe(true);
    });

    it("resolves tamper duration metrics across aliases", () => {
      expect(ruleEngine.resolveMetricValue({ tamper_duration_seconds: 8 }, "tamper_duration_seconds")).toBe(8);
      expect(ruleEngine.resolveMetricValue({ tamperDurationSeconds: 12 }, "tamper_duration_seconds")).toBe(12);
      expect(ruleEngine.resolveMetricValue({ tamperDurationMs: 6000 }, "tamper_duration_seconds")).toBe(6);
      expect(ruleEngine.resolveMetricValue({ tamper_duration: 7000 }, "tamper_duration_seconds")).toBe(7);
    });
  });

  describe("Rule Evaluation & State Lifecycle", () => {
    const testTime = new Date("2026-03-24T10:00:00Z");

    it("triggers alert immediately when tamper duration meets the 5s threshold", async () => {
      const template = await repository.getTemplate("tmpl-14-camera-tamper");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-tamper-01",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Tampering / Scene Shift",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: template!.defaultDurationMs,
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
        cameraId: "cam-entrance-01",
        timestamp: testTime,
        metrics: {
          isTampered: true,
          tamperType: "movement",
          tamper_duration_seconds: 6, // exceeds 5s
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.incidentRequired).toBe(true);
      expect(result.evidenceSnapshotRequired).toBe(true);
      expect(result.socNotificationRequired).toBe(true);
      expect(result.severity).toBe("HIGH");
    });

    it("enters CONDITION_MET_PENDING_DURATION when duration is under 5 seconds", async () => {
      const template = await repository.getTemplate("tmpl-14-camera-tamper");

      const rule = {
        id: "rule-tamper-02",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Tampering / Scene Shift",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 5000,
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
        cameraId: "cam-cash-counter-01",
        timestamp: testTime,
        metrics: {
          tamper_detected: true,
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(false);
      expect(result.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(result.alertRequired).toBe(false);
    });

    it("recovers to RESOLVED state when camera returns to normal alignment", async () => {
      const template = await repository.getTemplate("tmpl-14-camera-tamper");

      const rule = {
        id: "rule-tamper-03",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Tampering / Scene Shift",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 5000,
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

      // 1. Initial tampering triggering alert
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-locker-01",
        timestamp: testTime,
        metrics: { isTampered: true, tamper_duration_seconds: 6 },
      });

      // 2. Resolved inspection
      const resolved = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-locker-01",
        timestamp: new Date(testTime.getTime() + 60000),
        metrics: { isTampered: false, tamper_detected: false },
      });

      expect(resolved.conditionMet).toBe(false);
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.triggered).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    it("matches rule across camera-tamper, camera-tampering, tamper, and scene-shift detection types", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-tamper-01",
        name: "Camera Tampering / Scene Shift",
        detectionType: "camera-tamper",
        severity: "P1",
        minConfidence: 0.5,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      const eventTamper: AnalyticsEventInput = {
        eventId: "evt-tamper-01",
        detectionType: "camera-tampering",
        confidence: 0.9,
        durationSeconds: 5,
        occurredAt: "2026-03-24T10:00:00.000Z",
        objects: [],
        metadata: { cameraName: "Vault Camera 2", tamperType: "spray" },
      };

      const matches = sortedMatchingRules([rule], eventTamper);
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe("core-rule-tamper-01");

      const eventSceneShift: AnalyticsEventInput = {
        eventId: "evt-scene-shift-02",
        detectionType: "scene-shift",
        confidence: 0.88,
        durationSeconds: 6,
        occurredAt: "2026-03-24T10:00:00.000Z",
        objects: [],
        metadata: { cameraName: "Teller Counter 1", tamperType: "movement" },
      };

      const matchesSceneShift = sortedMatchingRules([rule], eventSceneShift);
      expect(matchesSceneShift.length).toBe(1);
    });

    it("generates descriptive alert title and detail description", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-tamper-02",
        name: "Camera Tampering / Scene Shift",
        detectionType: "camera-tamper",
        severity: "P1",
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
      expect(title).toBe("Security Alert: Camera Tampering / Scene Shift Detected");

      const desc = analyticsAlertDescription(rule, {
        cameraName: "ATM Lobby Camera 3",
        tamperType: "spray paint / cloth obscuration",
      });
      expect(desc).toContain("ATM Lobby Camera 3");
      expect(desc).toContain("spray paint / cloth obscuration");
      expect(desc).toContain("Immediate security verification required");
    });
  });
});
