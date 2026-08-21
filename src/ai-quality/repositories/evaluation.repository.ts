import type {
  EvaluationRun,
  ModelCertification,
} from "../domain/ai-quality.types.js";

export class EvaluationRepository {
  private readonly runs = new Map<string, EvaluationRun>();
  private readonly certifications = new Map<string, ModelCertification>(); // modelVersionId -> certification

  constructor() {
  }

  private seedDefaultEvaluations(): void {
    // Evaluation Run for Intrusion v3.2 on RTX A4000
    const evalRunIntrusionV32: EvaluationRun = {
      id: "eval-intrusion-v3-2-rtx-a4000",
      detectorId: "det-intrusion",
      modelVersionId: "model-intrusion-v3-2",
      datasetVersionId: "ds-bank-intrusion-2026-08",
      hardwareProfileId: "hw-rtx-a4000",
      threshold: 0.60,
      status: "completed",
      startedAt: "2026-08-11T10:00:00Z",
      finishedAt: "2026-08-11T12:30:00Z",
      overallMetrics: {
        precision: 0.964,
        recall: 0.931,
        f1: 0.947,
        truePositives: 11957,
        falsePositives: 446,
        trueNegatives: 44754,
        falseNegatives: 886,
        falseAlertsPerCameraHour: 0.08,
        missedIncidentsPerThousand: 6.9,
        detectionLatencyP50Ms: 38,
        detectionLatencyP95Ms: 54,
        detectionLatencyP99Ms: 71,
        inferenceLatencyP50Ms: 26,
        fpsAverage: 26.3,
        gpuMemoryMb: 1340,
        cpuPercent: 14.2,
      },
      scenarioBreakdown: [
        { scenarioName: "Daylight", dimension: "lighting", precision: 0.978, recall: 0.954, f1: 0.966, samplesCount: 7400, falseAlertsPerHour: 0.04 },
        { scenarioName: "Night / Low Light", dimension: "lighting", precision: 0.913, recall: 0.878, f1: 0.895, samplesCount: 5443, falseAlertsPerHour: 0.12 },
        { scenarioName: "Infra-Red (IR)", dimension: "lighting", precision: 0.897, recall: 0.852, f1: 0.874, samplesCount: 4200, falseAlertsPerHour: 0.14 },
        { scenarioName: "Indoor Vault / Hall", dimension: "scene", precision: 0.982, recall: 0.965, f1: 0.973, samplesCount: 6500, falseAlertsPerHour: 0.02 },
        { scenarioName: "Outdoor Perimeter", dimension: "scene", precision: 0.935, recall: 0.884, f1: 0.909, samplesCount: 6343, falseAlertsPerHour: 0.15 },
        { scenarioName: "Heavy Rain / Monsoon", dimension: "weather", precision: 0.889, recall: 0.824, f1: 0.855, samplesCount: 1800, falseAlertsPerHour: 0.22 },
      ],
      thresholdCurve: [
        { threshold: 0.40, precision: 0.872, recall: 0.981, f1: 0.923, falseAlertsPerHour: 0.42 },
        { threshold: 0.50, precision: 0.928, recall: 0.963, f1: 0.945, falseAlertsPerHour: 0.21 },
        { threshold: 0.60, precision: 0.964, recall: 0.931, f1: 0.947, falseAlertsPerHour: 0.08 },
        { threshold: 0.70, precision: 0.983, recall: 0.872, f1: 0.924, falseAlertsPerHour: 0.03 },
        { threshold: 0.80, precision: 0.991, recall: 0.721, f1: 0.835, falseAlertsPerHour: 0.01 },
      ],
    };

    this.runs.set(evalRunIntrusionV32.id, evalRunIntrusionV32);

    // Certification for Intrusion v3.2
    const certIntrusionV32: ModelCertification = {
      id: "cert-intrusion-v3-2",
      modelVersionId: "model-intrusion-v3-2",
      detectorId: "det-intrusion",
      certificationStatus: "approved",
      qualityGateResults: {
        passed: true,
        checks: [
          { metricName: "Overall Precision", target: ">= 95.0%", actual: "96.4%", passed: true },
          { metricName: "Overall Recall", target: ">= 92.0%", actual: "93.1%", passed: true },
          { metricName: "F1 Score", target: ">= 93.0%", actual: "94.7%", passed: true },
          { metricName: "False Alerts / Camera Hour", target: "<= 0.10", actual: "0.08", passed: true },
          { metricName: "P95 Inference Latency", target: "<= 100 ms", actual: "54 ms", passed: true },
          { metricName: "Minimum FPS", target: ">= 15 FPS", actual: "26.3 FPS", passed: true },
        ],
        failingReasons: [],
      },
      approvedUseCases: [
        "Indoor Bank Branches & Teller Desks",
        "Vault & Strong Room Perimeter",
        "ATM Lobby After-Hours",
        "Outdoor Daylight Perimeter",
      ],
      excludedConditions: [
        "Heavy Rain without secondary PIR verification",
        "Sub-720p resolution video feeds",
        "CPU-only inference (GPU required)",
      ],
      certifiedHardwareProfileIds: ["hw-rtx-a4000", "hw-nvidia-l4", "hw-jetson-orin"],
      approvedBy: "Head of AI Safety & Security Architecture",
      approvedAt: "2026-08-12T00:00:00Z",
      expiresAt: "2027-08-12T00:00:00Z",
    };

    this.certifications.set(certIntrusionV32.modelVersionId, certIntrusionV32);
  }

  async getEvaluationRun(id: string): Promise<EvaluationRun | null> {
    return this.runs.get(id) || null;
  }

  async getLatestEvaluationForModel(modelVersionId: string): Promise<EvaluationRun | null> {
    for (const run of this.runs.values()) {
      if (run.modelVersionId === modelVersionId && run.status === "completed") {
        return run;
      }
    }
    return null;
  }

  async listEvaluations(modelVersionId?: string): Promise<EvaluationRun[]> {
    const list = Array.from(this.runs.values());
    if (modelVersionId) {
      return list.filter((r) => r.modelVersionId === modelVersionId);
    }
    return list;
  }

  async saveEvaluationRun(run: EvaluationRun): Promise<void> {
    this.runs.set(run.id, run);
  }

  async getCertification(modelVersionId: string): Promise<ModelCertification | null> {
    return this.certifications.get(modelVersionId) || null;
  }

  async saveCertification(cert: ModelCertification): Promise<void> {
    this.certifications.set(cert.modelVersionId, cert);
  }
}
