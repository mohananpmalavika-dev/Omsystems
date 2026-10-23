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

describe("Continuous Recording Failure Rule (tmpl-17)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Instantiation", () => {
    it("retrieves tmpl-17-recording-failure directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-17-recording-failure");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-17-recording-failure");
      expect(templateDirect?.name).toBe("Continuous Recording Failure");
      expect(templateDirect?.category).toBe("HARDWARE_CONTINUITY");
      expect(templateDirect?.detectorType).toBe("recording");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(15000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");

      const templateAlias = await repository.getTemplate("recording-failure");
      expect(templateAlias).toBeDefined();
      expect(templateAlias?.id).toBe("tmpl-17-recording-failure");
    });

    it("lists tmpl-17 under HARDWARE_CONTINUITY category", async () => {
      const hwTemplates = await repository.listTemplates("HARDWARE_CONTINUITY");
      const found = hwTemplates.find((t) => t.id === "tmpl-17-recording-failure");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Continuous Recording Failure");
    });

    it("includes recording and recording-failure detectors in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const recModel = models.find((m) => m.detector === "recording");
      const failModel = models.find((m) => m.detector === "recording-failure");
      const gapModel = models.find((m) => m.detector === "recording-gap");

      expect(recModel).toBeDefined();
      expect(recModel?.status).toBe("PRODUCTION_READY");
      expect(failModel).toBeDefined();
      expect(failModel?.status).toBe("PRODUCTION_READY");
      expect(gapModel).toBeDefined();
      expect(gapModel?.status).toBe("PRODUCTION_READY");
    });

    it("instantiates rule preserving HARDWARE_CONTINUITY category and critical actions", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-17-recording-failure",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-locker-01"],
          zoneId: "zone-locker",
        },
        "soc-admin"
      );

      expect(rule).toBeDefined();
      expect(rule.name).toBe("Continuous Recording Failure");
      expect(rule.category).toBe("HARDWARE_CONTINUITY");
      expect(rule.detectorType).toBe("recording");
      expect(rule.severity).toBe("CRITICAL");
      expect(rule.actions).toContain("CREATE_ALERT");
      expect(rule.actions).toContain("CREATE_INCIDENT");
      expect(rule.actions).toContain("NOTIFY_SOC");
      expect(rule.condition).toEqual({
        metric: "recording_gap_seconds",
        operator: "GREATER_THAN",
        value: 15,
      });
    });
  });

  describe("Metric Resolution & Evaluation", () => {
    it("evaluates recording gap metrics across various telemetry formats", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-17-recording-failure",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-vault-01"],
        }
      );

      // 1. Direct snake_case recording_gap_seconds (20s > 15s)
      const res1 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { recording_gap_seconds: 20 },
      });
      expect(res1.conditionMet).toBe(true);
      expect(res1.triggered).toBe(true);
      expect(res1.alertRequired).toBe(true);
      expect(res1.incidentRequired).toBe(true);
      expect(res1.socNotificationRequired).toBe(true);

      // Reset state for clean evaluation
      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-vault-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 2. camelCase recordingGapSeconds
      const res2 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { recordingGapSeconds: 25 },
      });
      expect(res2.conditionMet).toBe(true);
      expect(res2.triggered).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-vault-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 3. gap_duration_seconds from recording_gaps detector
      const res3 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { gap_duration_seconds: 30 },
      });
      expect(res3.conditionMet).toBe(true);
      expect(res3.triggered).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-vault-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 4. Milliseconds gapDuration (18000ms -> 18s > 15s)
      const res4 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { gapDuration: 18000 },
      });
      expect(res4.conditionMet).toBe(true);
      expect(res4.triggered).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-vault-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 5. vms_recording_gap_seconds from Prometheus/VMS metrics
      const res5 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { vms_recording_gap_seconds: 19 },
      });
      expect(res5.conditionMet).toBe(true);
      expect(res5.triggered).toBe(true);
    });

    it("does not trigger when recording gap is below threshold (< 15s)", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-17-recording-failure",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-vault-01"],
        }
      );

      const res = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-vault-01",
        metrics: { recording_gap_seconds: 8 },
      });

      expect(res.conditionMet).toBe(false);
      expect(res.triggered).toBe(false);
      expect(res.alertRequired).toBe(false);
      expect(res.incidentRequired).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    const mockRule: CoreAnalyticsRule = {
      id: "rule-rec-fail-01",
      name: "Continuous Recording Failure",
      enabled: true,
      detectionType: "recording",
      severity: "P1",
      minConfidence: 0.8,
      minDurationSeconds: 0,
      objectClasses: [],
      direction: "any",
      schedules: [],
    };

    it("maps recording detection type variations in eventDetectionTypes", () => {
      const event1: AnalyticsEventInput = {
        cameraId: "cam-01",
        detectionType: "recording-failure",
        confidence: 0.95,
        durationSeconds: 16,
        occurredAt: new Date().toISOString(),
        objects: [],
      };
      const types1 = eventDetectionTypes(event1);
      expect(types1).toContain("recording");
      expect(types1).toContain("recording-failure");
      expect(types1).toContain("RECORDING_FAILURE");

      const event2: AnalyticsEventInput = {
        cameraId: "cam-01",
        detectionType: "recording-gap",
        confidence: 0.95,
        durationSeconds: 20,
        occurredAt: new Date().toISOString(),
        objects: [],
      };
      const types2 = eventDetectionTypes(event2);
      expect(types2).toContain("recording");
    });

    it("matches recording failure events even when objects array is empty", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-01",
        detectionType: "recording-failure",
        confidence: 0.95,
        durationSeconds: 20,
        occurredAt: new Date().toISOString(),
        objects: [],
      };

      const matched = sortedMatchingRules([mockRule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-rec-fail-01");
    });

    it("generates critical alert title and detailed description for recording failure", () => {
      const title = analyticsAlertTitle(mockRule, {
        recordingGapSeconds: 22,
        cameraName: "Vault Inside High-Res Dome",
      });
      expect(title).toBe("Critical Alert: Continuous Recording Failure Detected");

      const desc = analyticsAlertDescription(mockRule, {
        recordingGapSeconds: 22,
        cameraName: "Vault Inside High-Res Dome",
      });
      expect(desc).toContain("Vault Inside High-Res Dome");
      expect(desc).toContain("video segment write stream failed (22s gap exceeds SLA threshold)");
      expect(desc).toContain("Continuous recording interrupted in violation of NBFC compliance policy");
    });
  });
});
