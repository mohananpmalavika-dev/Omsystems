import { describe, it, expect, beforeEach } from "vitest";
import {
  AIQualityPlatformFacade,
  ModelNotCertifiedError,
} from "../../src/ai-quality/index.js";

describe("AI Model Quality, Evaluation & Certification Platform", () => {
  let platform: AIQualityPlatformFacade;

  beforeEach(() => {
    platform = new AIQualityPlatformFacade();
  });

  describe("Suite 1: Model Registry & Artifact Integrity", () => {
    it("registers a new detector model version with cryptographic SHA-256 validation", async () => {
      const model = await platform.registerModelVersion({
        detectorId: "det-intrusion",
        version: "3.4.0",
        modelName: "YOLOv8-BankIntrusion-GhostNet",
        framework: "tensorrt",
        artifactUri: "models/security/intrusion/yolov8_ghost_v3.4.engine",
        artifactSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
        inputWidth: 640,
        inputHeight: 640,
        defaultThreshold: 0.62,
        trainingDatasetId: "ds-bank-intrusion-2026-08",
        validationDatasetId: "ds-bank-intrusion-2026-08",
        actor: { userId: "usr-ai-1", userName: "Dr. Ananya (AI Lead)" },
      });

      expect(model.id).toBe("model-intrusion-v3-4-0");
      expect(model.lifecycle).toBe("candidate");
      expect(model.artifactSha256).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e");

      // Verify audit log captured registration
      const audit = await platform.auditRepo.listAuditEvents(model.id);
      expect(audit.length).toBe(1);
      expect(audit[0]?.eventType).toBe("MODEL_REGISTERED");
    });
  });

  describe("Suite 2: Benchmark Evaluation & Multi-Condition Scenario Breakdown", () => {
    it("evaluates candidate model on validation dataset and computes scenario metrics and threshold curve", async () => {
      const evalRun = await platform.evaluateModel(
        "model-intrusion-v3-2",
        "ds-bank-intrusion-2026-08",
        "hw-rtx-a4000",
        0.60,
      );

      expect(evalRun.status).toBe("completed");
      expect(evalRun.overallMetrics.precision).toBeGreaterThanOrEqual(0.95);
      expect(evalRun.overallMetrics.recall).toBeGreaterThanOrEqual(0.92);
      expect(evalRun.overallMetrics.f1).toBeGreaterThanOrEqual(0.93);
      expect(evalRun.overallMetrics.falseAlertsPerCameraHour).toBeLessThanOrEqual(0.10);
      expect(evalRun.overallMetrics.detectionLatencyP95Ms).toBeLessThanOrEqual(100);

      // Verify scenario breakdowns (Day, Night, IR, Rain)
      expect(evalRun.scenarioBreakdown.length).toBeGreaterThanOrEqual(5);
      const nightScenario = evalRun.scenarioBreakdown.find((s) => s.scenarioName.includes("Night"));
      expect(nightScenario?.precision).toBeGreaterThanOrEqual(0.90);

      const rainScenario = evalRun.scenarioBreakdown.find((s) => s.scenarioName.includes("Rain"));
      expect(rainScenario).toBeDefined();

      // Verify threshold curve (0.40 -> 0.80)
      expect(evalRun.thresholdCurve.length).toBe(5);
      expect(evalRun.thresholdCurve[0]?.threshold).toBe(0.40);
      expect(evalRun.thresholdCurve[4]?.threshold).toBe(0.80);
    });
  });

  describe("Suite 3: Quality Gate Certification & Production Deployment Guard", () => {
    it("passes quality gates for certified high-performing models", async () => {
      const cert = await platform.certificationService.evaluateCertification(
        "model-intrusion-v3-2",
        { userId: "usr-head-ai", userName: "AI Architecture Board" },
      );

      expect(cert.certificationStatus).toBe("approved");
      expect(cert.qualityGateResults.passed).toBe(true);
      expect(cert.qualityGateResults.failingReasons.length).toBe(0);
      expect(cert.certifiedHardwareProfileIds).toContain("hw-rtx-a4000");
    });

    it("strictly blocks production deployment of uncertified models with ModelNotCertifiedError", async () => {
      // Register an uncertified test model
      const uncertifiedModel = await platform.registerModelVersion({
        detectorId: "det-face-recognition",
        version: "0.8.0-experimental",
        modelName: "MobileFaceNet-Experimental",
        framework: "onnx",
        artifactUri: "models/experimental/face_v0.8.onnx",
        artifactSha256: "b2c3d4e5f6a10718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
        actor: { userId: "usr-test", userName: "Test User" },
      });

      // Attempting to deploy to production without passing quality gates must throw
      await expect(
        platform.deployModelToProduction(uncertifiedModel.id, {
          userId: "usr-admin",
          userName: "Security Admin",
        }),
      ).rejects.toThrow(ModelNotCertifiedError);
    });

    it("successfully promotes certified model to production and updates active detector pointer", async () => {
      // Intrusion v3.2 is pre-certified in repo
      const result = await platform.deployModelToProduction("model-intrusion-v3-2", {
        userId: "usr-admin",
        userName: "Security Admin",
      });

      expect(result.status).toBe("deployed_to_production");
      expect(result.detector.currentProductionModelId).toBe("model-intrusion-v3-2");
      expect(result.model.lifecycle).toBe("production");
    });
  });

  describe("Suite 4: Per-Camera Detector Tuning & AI Recommendations", () => {
    it("configures camera sensitivity presets (HIGH = 0.45, MEDIUM = 0.60, LOW = 0.75)", async () => {
      // 1. High sensitivity
      const highConfig = await platform.cameraTuning.updateConfiguration({
        tenantId: "tenant-bank",
        branchId: "branch-kochi",
        cameraId: "cam-vault-101",
        detectorId: "det-intrusion",
        sensitivity: "HIGH",
        actor: { userId: "usr-admin", userName: "Admin" },
      });
      expect(highConfig.confidenceThreshold).toBe(0.45);

      // 2. Low sensitivity
      const lowConfig = await platform.cameraTuning.updateConfiguration({
        tenantId: "tenant-bank",
        branchId: "branch-kochi",
        cameraId: "cam-parking-02",
        detectorId: "det-intrusion",
        sensitivity: "LOW",
        actor: { userId: "usr-admin", userName: "Admin" },
      });
      expect(lowConfig.confidenceThreshold).toBe(0.75);

      // 3. Custom sensitivity with justification
      const customConfig = await platform.cameraTuning.updateConfiguration({
        tenantId: "tenant-bank",
        branchId: "branch-kochi",
        cameraId: "cam-vault-101",
        detectorId: "det-intrusion",
        sensitivity: "CUSTOM",
        customThreshold: 0.68,
        overrideReason: "Direct sun reflection from entrance glass door between 4 PM and 5 PM",
        actor: { userId: "usr-admin", userName: "Admin" },
      });
      expect(customConfig.confidenceThreshold).toBe(0.68);
      expect(customConfig.overrideReason).toContain("reflection");
    });

    it("generates automated threshold recommendation when observed false alarm rate exceeds baseline", async () => {
      const rec = await platform.cameraTuning.generateThresholdRecommendation(
        "cam-entry-high-reflection",
        "det-intrusion",
        0.28, // 0.28 false alarms / hr (>3x fleet baseline of 0.08)
      );

      expect(rec.recommendedThreshold).toBe(0.68);
      expect(rec.expectedRecallImpactPercent).toBe(-2.1);
      expect(rec.recommendationReason).toContain("fleet baseline");
    });
  });

  describe("Suite 5: Alert Provenance, Operator Feedback & Drift Tracking", () => {
    it("constructs full cryptographic AI provenance for normalized alerts", async () => {
      const provenance = await platform.cameraTuning.buildAlertProvenance(
        "intrusion",
        0.94,
        "cam-301-17",
      );

      expect(provenance.detectorCode).toBe("intrusion");
      expect(provenance.modelSha256).toBeDefined();
      expect(provenance.threshold).toBe(0.68); // Configured threshold for cam-301-17
      expect(provenance.hardwareProfile).toContain("RTX A4000");
    });

    it("records operator TP/FP feedback and calculates drift status across fleet", async () => {
      // Record 10 true positive feedbacks
      for (let i = 0; i < 10; i++) {
        await platform.recordOperatorFeedback({
          alertId: `alert-${i}`,
          cameraId: `cam-${i}`,
          detectorId: "det-intrusion",
          modelVersionId: "model-intrusion-v3-2",
          classification: "true_positive",
          actor: { userId: "usr-op-1", userName: "Operator 1" },
        });
      }

      // Record 1 false positive feedback
      await platform.recordOperatorFeedback({
        alertId: "alert-fp-1",
        cameraId: "cam-reflection-1",
        detectorId: "det-intrusion",
        modelVersionId: "model-intrusion-v3-2",
        classification: "false_positive",
        reasonCategory: "reflection",
        notes: "Car headlights through window",
        actor: { userId: "usr-op-1", userName: "Operator 1" },
      });

      const fleetHealth = await platform.getFleetQualityHealth();

      expect(fleetHealth.certifiedDetectorsCount).toBeGreaterThanOrEqual(5);
      expect(fleetHealth.modelsInProductionCount).toBeGreaterThanOrEqual(1);

      const intrusionHealth = fleetHealth.detectors.find((d) => d.detectorCode === "intrusion");
      expect(intrusionHealth).toBeDefined();
      expect(intrusionHealth?.driftStatus).toBe("HEALTHY");
      expect(intrusionHealth?.highFalseAlarmCameraIds).toContain("cam-reflection-1");
    });
  });
});
