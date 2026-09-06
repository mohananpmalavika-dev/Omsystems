import { randomUUID } from "node:crypto";
import type { EvaluationRun, ModelVersion, DatasetVersion, HardwareProfile } from "../domain/ai-quality.types.js";
import type { EvaluationRepository } from "../repositories/evaluation.repository.js";

export interface BenchmarkSample {
  id: string;
  positive: boolean;
  confidence: number;
  detectionLatencyMs: number;
  inferenceLatencyMs: number;
  lighting: "day" | "night";
}

export interface BenchmarkObservations {
  modelSha256: string;
  datasetSha256: string;
  hardwareProfileId: string;
  cameraHours: number;
  elapsedMs: number;
  gpuMemoryMb: number;
  cpuPercent: number;
  samples: BenchmarkSample[];
}

// A local runner supplies held-out, labeled incident windows and actual timings.
// No HTTP request can supply its own certification evidence.
export interface BenchmarkRunner {
  run(model: ModelVersion, dataset: DatasetVersion, hardware: HardwareProfile): Promise<BenchmarkObservations>;
}

export class BenchmarkUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() {
    super("Measured local benchmark runner is not configured");
    this.name = "BenchmarkUnavailableError";
  }
}

function scores(samples: BenchmarkSample[], threshold: number) {
  const tp = samples.filter(s => s.positive && s.confidence >= threshold).length;
  const fp = samples.filter(s => !s.positive && s.confidence >= threshold).length;
  const fn = samples.filter(s => s.positive && s.confidence < threshold).length;
  const tn = samples.length - tp - fp - fn;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}

export class EvaluationEngineService {
  constructor(private readonly evaluationRepo: EvaluationRepository, private readonly runner?: BenchmarkRunner) {}

  async runEvaluation(model: ModelVersion, dataset: DatasetVersion, hardware: HardwareProfile, customThreshold?: number): Promise<EvaluationRun> {
    if (!this.runner) throw new BenchmarkUnavailableError();
    const threshold = customThreshold ?? model.defaultThreshold;
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) throw new Error("Invalid benchmark threshold");
    if (dataset.purpose === "training" || dataset.id === model.trainingDatasetId) {
      throw new Error("Certification requires a held-out dataset, separate from training");
    }
    const startedAt = new Date().toISOString();
    const observations = await this.runner.run(model, dataset, hardware);
    const { samples } = observations;
    if (!/^[a-f0-9]{64}$/i.test(model.artifactSha256) || !/^[a-f0-9]{64}$/i.test(dataset.manifestSha256)
      || observations.modelSha256 !== model.artifactSha256 || observations.datasetSha256 !== dataset.manifestSha256
      || observations.hardwareProfileId !== hardware.id) throw new Error("Benchmark artifact identity mismatch");
    if (!Number.isFinite(observations.cameraHours) || observations.cameraHours <= 0
      || !Number.isFinite(observations.elapsedMs) || observations.elapsedMs <= 0
      || !Number.isFinite(observations.gpuMemoryMb) || observations.gpuMemoryMb < 0
      || !Number.isFinite(observations.cpuPercent) || observations.cpuPercent < 0 || observations.cpuPercent > 100) {
      throw new Error("Invalid benchmark measurements");
    }
    if (!samples.length || new Set(samples.map(s => s.id)).size !== samples.length
      || samples.some(s => !s.id || typeof s.positive !== "boolean" || !["day", "night"].includes(s.lighting)
        || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1
        || !Number.isFinite(s.detectionLatencyMs) || s.detectionLatencyMs < 0
        || !Number.isFinite(s.inferenceLatencyMs) || s.inferenceLatencyMs < 0)
      || dataset.positiveSamples <= 0 || dataset.negativeSamples <= 0
      || samples.filter(s => s.positive).length !== dataset.positiveSamples
      || samples.filter(s => !s.positive).length !== dataset.negativeSamples) {
      throw new Error("Benchmark samples must cover the labeled positive and negative dataset exactly once");
    }
    const metrics = scores(samples, threshold);
    const run: EvaluationRun = {
      id: `eval-${randomUUID()}`, detectorId: model.detectorId, modelVersionId: model.id,
      datasetVersionId: dataset.id, hardwareProfileId: hardware.id, threshold, status: "completed",
      startedAt, finishedAt: new Date().toISOString(),
      evidence: { source: "measured", modelSha256: model.artifactSha256, datasetSha256: dataset.manifestSha256,
        sampleCount: samples.length, cameraHours: observations.cameraHours },
      overallMetrics: {
        precision: metrics.precision, recall: metrics.recall, f1: metrics.f1,
        truePositives: metrics.tp, falsePositives: metrics.fp, trueNegatives: metrics.tn, falseNegatives: metrics.fn,
        falseAlertsPerCameraHour: metrics.fp / observations.cameraHours,
        missedIncidentsPerThousand: metrics.fn / dataset.positiveSamples * 1000,
        detectionLatencyP50Ms: percentile(samples.map(s => s.detectionLatencyMs), 0.5),
        detectionLatencyP95Ms: percentile(samples.map(s => s.detectionLatencyMs), 0.95),
        detectionLatencyP99Ms: percentile(samples.map(s => s.detectionLatencyMs), 0.99),
        inferenceLatencyP50Ms: percentile(samples.map(s => s.inferenceLatencyMs), 0.5),
        fpsAverage: samples.length * 1000 / observations.elapsedMs,
        gpuMemoryMb: observations.gpuMemoryMb, cpuPercent: observations.cpuPercent,
      },
      scenarioBreakdown: [],
      thresholdCurve: [...new Set([0.4, 0.5, 0.6, 0.7, 0.8, threshold])].sort((a, b) => a - b).map(value => {
        const score = scores(samples, value);
        return { threshold: value, precision: score.precision, recall: score.recall, f1: score.f1,
          falseAlertsPerHour: score.fp / observations.cameraHours };
      }),
    };
    for (const lighting of ["day", "night"] as const) {
      const subset = samples.filter(s => s.lighting === lighting);
      if (!subset.length) continue;
      const score = scores(subset, threshold);
      run.scenarioBreakdown.push({ scenarioName: lighting === "night" ? "Night" : "Daylight", dimension: "lighting",
        precision: score.precision, recall: score.recall, f1: score.f1, samplesCount: subset.length,
        falseAlertsPerHour: score.fp / observations.cameraHours });
    }
    await this.evaluationRepo.saveEvaluationRun(run);
    return run;
  }
}
