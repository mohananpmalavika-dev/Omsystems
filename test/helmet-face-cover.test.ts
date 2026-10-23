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

describe("Helmet / Face Cover Inside Branch/ATM Rule (tmpl-37)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Definition & Model Registry", () => {
    it("retrieves tmpl-37-helmet-face-cover directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-37-helmet-face-cover");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-37-helmet-face-cover");
      expect(templateDirect?.name).toBe("Helmet / Face Cover Inside Branch/ATM");
      expect(templateDirect?.category).toBe("ACCESS_PERIMETER");
      expect(templateDirect?.detectorType).toBe("helmet-worn");
      expect(templateDirect?.defaultSeverity).toBe("HIGH");
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("POPUP_LIVE_VIEW");

      const templateAlias = await repository.getTemplate("helmet-face-cover");
      expect(templateAlias).toBeDefined();
      expect(templateAlias?.id).toBe("tmpl-37-helmet-face-cover");
    });

    it("includes helmet-worn and face-cover models in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const helmetModel = models.find((m) => m.detector === "helmet-worn");
      expect(helmetModel).toBeDefined();
      expect(helmetModel?.status).toBe("PRODUCTION_READY");
      expect(helmetModel?.runtime).toBe("ONNX Runtime");

      const faceCoverModel = models.find((m) => m.detector === "face-cover");
      expect(faceCoverModel).toBeDefined();
      expect(faceCoverModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Rule Engine Evaluation & Metric Normalization", () => {
    it("instantiates rule and triggers on standard helmet_detected metric", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-37-helmet-face-cover",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-atm-01"],
          durationMs: 0,
        }
      );

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-atm-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { helmet_detected: true },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.status).toBe("ACTIVE_ALERTING");
    });

    it("triggers on face_cover_detected and mask_detected telemetry aliases", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-37-helmet-face-cover",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-lobby-01"],
          durationMs: 0,
        }
      );

      // Face cover event
      const faceCoverResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { face_cover_detected: true },
      });
      expect(faceCoverResult.conditionMet).toBe(true);

      // Surgical/cloth mask event
      const maskResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: new Date("2026-10-23T10:05:00Z"),
        metrics: { mask_detected: true },
      });
      expect(maskResult.conditionMet).toBe(true);

      // Concealment threat flag
      const concealmentResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: new Date("2026-10-23T10:10:00Z"),
        metrics: { threatType: "identity_concealment" },
      });
      expect(concealmentResult.conditionMet).toBe(true);
    });

    it("does not trigger when face is bare and no concealment is detected", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-37-helmet-face-cover",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-atm-01"],
          durationMs: 0,
        }
      );

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-atm-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { helmet_detected: false, face_cover_detected: false },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
    });
  });

  describe("Core Rule Engine Integration & Alert Generation", () => {
    it("maps face-cover and helmet-face-cover detection types in eventDetectionTypes", () => {
      const faceCoverEvent: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "face-cover",
        confidence: 0.92,
        durationSeconds: 1,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [],
        metadata: {},
      };

      const types = eventDetectionTypes(faceCoverEvent);
      expect(types).toContain("helmet-worn");
      expect(types).toContain("face-cover");
    });

    it("matches rule when telemetry sends mask or face_cover object labels", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-helmet-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Helmet / Face Cover Inside Branch/ATM",
        detectionType: "helmet-worn",
        objectClasses: ["helmet", "person"],
        severity: "P2",
        confidence: 0.8,
        minConfidence: 0.7,
        minDurationSeconds: 1,
        cooldownSeconds: 60,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const maskEvent: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "helmet-worn",
        confidence: 0.94,
        durationSeconds: 1,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [{ label: "mask", confidence: 0.94 }],
        metadata: { maskDetected: true },
      };

      const matches = sortedMatchingRules([coreRule], maskEvent);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-helmet-01");
    });

    it("generates authoritative alert title and descriptive violation text", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-helmet-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Helmet / Face Cover Inside Branch/ATM",
        detectionType: "helmet-worn",
        objectClasses: ["helmet", "person"],
        severity: "P2",
        confidence: 0.8,
        minConfidence: 0.7,
        minDurationSeconds: 1,
        cooldownSeconds: 60,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const helmetTitle = analyticsAlertTitle(coreRule, { helmetDetected: true });
      const helmetDescription = analyticsAlertDescription(coreRule, { helmetDetected: true });
      expect(helmetTitle).toBe("Security Alert: Helmet / Face Cover Detected");
      expect(helmetDescription).toContain("motorcycle helmet");

      const maskTitle = analyticsAlertTitle(coreRule, { maskDetected: true });
      const maskDescription = analyticsAlertDescription(coreRule, { maskDetected: true });
      expect(maskTitle).toBe("Face Cover / Mask Detected Inside Facility");
      expect(maskDescription).toContain("face mask");
    });
  });
});
