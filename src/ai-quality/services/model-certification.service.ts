import { randomUUID } from "node:crypto";
import type {
  ModelCertification,
  QualityGateRequirements,
  QualityGateEvaluationResult,
  EvaluationRun,
  ModelVersion,
} from "../domain/ai-quality.types.js";
import type { EvaluationRepository } from "../repositories/evaluation.repository.js";
import type { DetectorRegistryRepository } from "../repositories/detector-registry.repository.js";
import type { AIQualityAuditRepository } from "../repositories/ai-quality-audit.repository.js";

export const DEFAULT_BANK_QUALITY_GATES: QualityGateRequirements = {
  minimumPrecision: 0.95,
  minimumRecall: 0.92,
  minimumF1: 0.93,
  maximumFalseAlertsPerCameraHour: 0.10,
  maximumP95LatencyMs: 100,
  minimumFPS: 15,
  minimumNightPrecision: 0.90,
  minimumNightRecall: 0.85,
};

export class ModelNotCertifiedError extends Error {
  constructor(modelId: string, status: string, failingReasons?: string[]) {
    const reasons = failingReasons?.length ? ` Reasons: ${failingReasons.join("; ")}` : "";
    super(`Model '${modelId}' cannot be deployed to production. Current status: '${status}'. Model must pass all quality gates and receive certification approval.${reasons}`);
    this.name = "ModelNotCertifiedError";
  }
}

export class ModelCertificationService {
  constructor(
    private readonly evaluationRepo: EvaluationRepository,
    private readonly detectorRepo: DetectorRegistryRepository,
    private readonly auditRepo: AIQualityAuditRepository,
  ) {}

  /**
   * Evaluate a model against quality gates and issue certification decision.
   */
  async evaluateCertification(
    modelVersionId: string,
    approver?: { userId: string; userName: string },
    customGates?: Partial<QualityGateRequirements>,
  ): Promise<ModelCertification> {
    const model = await this.detectorRepo.getModelVersion(modelVersionId);
    if (!model) throw new Error(`Model version ${modelVersionId} not found`);

    const evaluation = await this.evaluationRepo.getLatestEvaluationForModel(modelVersionId);
    if (!evaluation) {
      throw new Error(`Cannot certify model ${modelVersionId}: No benchmark evaluation run found.`);
    }

    const gates: QualityGateRequirements = {
      ...DEFAULT_BANK_QUALITY_GATES,
      ...customGates,
    };

    const checks: QualityGateEvaluationResult["checks"] = [];
    const failingReasons: string[] = [];

    // 1. Precision Check
    const precPassed = evaluation.overallMetrics.precision >= gates.minimumPrecision;
    checks.push({
      metricName: "Overall Precision",
      target: `>= ${(gates.minimumPrecision * 100).toFixed(1)}%`,
      actual: `${(evaluation.overallMetrics.precision * 100).toFixed(1)}%`,
      passed: precPassed,
    });
    if (!precPassed) failingReasons.push(`Precision ${(evaluation.overallMetrics.precision * 100).toFixed(1)}% < ${(gates.minimumPrecision * 100).toFixed(1)}%`);

    // 2. Recall Check
    const recallPassed = evaluation.overallMetrics.recall >= gates.minimumRecall;
    checks.push({
      metricName: "Overall Recall",
      target: `>= ${(gates.minimumRecall * 100).toFixed(1)}%`,
      actual: `${(evaluation.overallMetrics.recall * 100).toFixed(1)}%`,
      passed: recallPassed,
    });
    if (!recallPassed) failingReasons.push(`Recall ${(evaluation.overallMetrics.recall * 100).toFixed(1)}% < ${(gates.minimumRecall * 100).toFixed(1)}%`);

    // 3. F1 Score Check
    const f1Passed = evaluation.overallMetrics.f1 >= gates.minimumF1;
    checks.push({
      metricName: "F1 Score",
      target: `>= ${(gates.minimumF1 * 100).toFixed(1)}%`,
      actual: `${(evaluation.overallMetrics.f1 * 100).toFixed(1)}%`,
      passed: f1Passed,
    });
    if (!f1Passed) failingReasons.push(`F1 Score ${(evaluation.overallMetrics.f1 * 100).toFixed(1)}% < ${(gates.minimumF1 * 100).toFixed(1)}%`);

    // 4. False Alerts Per Hour Check
    const faPassed = evaluation.overallMetrics.falseAlertsPerCameraHour <= gates.maximumFalseAlertsPerCameraHour;
    checks.push({
      metricName: "False Alerts / Camera-Hour",
      target: `<= ${gates.maximumFalseAlertsPerCameraHour.toFixed(2)}`,
      actual: evaluation.overallMetrics.falseAlertsPerCameraHour.toFixed(2),
      passed: faPassed,
    });
    if (!faPassed) failingReasons.push(`False alert rate ${evaluation.overallMetrics.falseAlertsPerCameraHour.toFixed(2)} > ${gates.maximumFalseAlertsPerCameraHour.toFixed(2)} / hr`);

    // 5. Latency Check
    const latencyPassed = evaluation.overallMetrics.detectionLatencyP95Ms <= gates.maximumP95LatencyMs;
    checks.push({
      metricName: "P95 Detection Latency",
      target: `<= ${gates.maximumP95LatencyMs} ms`,
      actual: `${evaluation.overallMetrics.detectionLatencyP95Ms} ms`,
      passed: latencyPassed,
    });
    if (!latencyPassed) failingReasons.push(`P95 Latency ${evaluation.overallMetrics.detectionLatencyP95Ms} ms > ${gates.maximumP95LatencyMs} ms`);

    // 6. FPS Check
    const fpsPassed = evaluation.overallMetrics.fpsAverage >= gates.minimumFPS;
    checks.push({
      metricName: "Inference Throughput",
      target: `>= ${gates.minimumFPS} FPS`,
      actual: `${evaluation.overallMetrics.fpsAverage} FPS`,
      passed: fpsPassed,
    });
    if (!fpsPassed) failingReasons.push(`Throughput ${evaluation.overallMetrics.fpsAverage} FPS < ${gates.minimumFPS} FPS`);

    // 7. Night Condition Check
    const nightScenario = evaluation.scenarioBreakdown.find((s) => s.scenarioName.includes("Night"));
    if (nightScenario && gates.minimumNightRecall) {
      const nightRecallPassed = nightScenario.recall >= gates.minimumNightRecall;
      checks.push({
        metricName: "Night Scenario Recall",
        target: `>= ${(gates.minimumNightRecall * 100).toFixed(1)}%`,
        actual: `${(nightScenario.recall * 100).toFixed(1)}%`,
        passed: nightRecallPassed,
      });
      if (!nightRecallPassed) failingReasons.push(`Night Recall ${(nightScenario.recall * 100).toFixed(1)}% < ${(gates.minimumNightRecall * 100).toFixed(1)}%`);
    }

    const allPassed = failingReasons.length === 0;
    const now = new Date().toISOString();

    const certification: ModelCertification = {
      id: `cert-${modelVersionId}-${randomUUID().slice(0, 6)}`,
      modelVersionId,
      detectorId: model.detectorId,
      certificationStatus: allPassed ? "approved" : "rejected",
      qualityGateResults: {
        passed: allPassed,
        checks,
        failingReasons,
      },
      approvedUseCases: allPassed
        ? ["Indoor Bank Branch", "Vault Security", "ATM Lobby", "Perimeter Daytime"]
        : [],
      excludedConditions: ["Heavy Rain without radar/PIR", "Sub-720p feeds"],
      certifiedHardwareProfileIds: allPassed ? ["hw-rtx-a4000", "hw-nvidia-l4", "hw-jetson-orin"] : [],
      approvedBy: approver?.userName || "AI Safety Architecture Committee",
      approvedAt: allPassed ? now : undefined,
    };

    await this.evaluationRepo.saveCertification(certification);

    // Update model lifecycle status
    if (allPassed) {
      model.lifecycle = "certified";
      await this.detectorRepo.saveModelVersion(model);

      await this.auditRepo.appendAuditEvent({
        eventType: "MODEL_CERTIFIED",
        targetId: modelVersionId,
        actor: {
          userId: approver?.userId || "system",
          userName: approver?.userName || "AI Safety Architecture Committee",
        },
        details: { checksPassed: checks.length, modelVersion: model.version },
      });
    } else {
      await this.auditRepo.appendAuditEvent({
        eventType: "MODEL_CERTIFICATION_FAILED",
        targetId: modelVersionId,
        actor: {
          userId: approver?.userId || "system",
          userName: approver?.userName || "AI Quality Gate",
        },
        details: { failingReasons },
      });
    }

    return certification;
  }

  /**
   * Validate certification prior to production deployment.
   */
  async assertCanDeployToProduction(modelVersionId: string): Promise<ModelCertification> {
    const cert = await this.evaluationRepo.getCertification(modelVersionId);
    if (!cert || cert.certificationStatus !== "approved") {
      throw new ModelNotCertifiedError(
        modelVersionId,
        cert?.certificationStatus || "uncertified",
        cert?.qualityGateResults?.failingReasons,
      );
    }
    return cert;
  }
}
