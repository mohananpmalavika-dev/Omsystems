import { describe, it, expect } from "vitest";
import {
  validateDetectionContract,
  createSuccessDetection,
  createModelUnavailableDetection,
  createInferenceFailedDetection,
  createHeuristicDetection,
  createSimulationDetection,
  ProductionMockForbiddenError,
  ModelUnavailableError,
  InferenceFailedError,
  FabricatedSuccessError,
  DependencyUnavailableError,
  type CanonicalDetectionResult,
} from "../../packages/contracts/src/execution/index.js";


describe("Canonical Execution Contract", () => {
  describe("Validation Invariants", () => {
    it("accepts valid SUCCESS detection with numeric confidence [0, 1]", () => {
      const result = createSuccessDetection({
        detectionType: "helmet",
        confidence: 0.94,
        objects: [
          {
            label: "helmet",
            confidence: 0.94,
            boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          },
        ],
        modelId: "paddleclas-safety-helmet",
        modelVersion: "1.0.0",
      });

      const validation = validateDetectionContract(result);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(result.confidence).toBe(0.94);
      expect(result.status).toBe("SUCCESS");
      expect(result.provenance).toBe("LIVE_INFERENCE");
    });

    it("requires confidence to be null for non-SUCCESS status", () => {
      const invalidResult: CanonicalDetectionResult = {
        detectionType: "crowd-density",
        status: "MODEL_UNAVAILABLE",
        provenance: "LIVE_INFERENCE",
        confidence: 0.85 as any, // VIOLATION: confidence should be null
        objects: [],
        metadata: {},
        executionMetadata: {
          status: "MODEL_UNAVAILABLE",
          provenance: "LIVE_INFERENCE",
          timestamp: new Date().toISOString(),
        },
        requiresAlert: false,
      };

      const validation = validateDetectionContract(invalidResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Confidence must be null"))).toBe(true);
    });

    it("requires confidence to be null when status is MODEL_UNAVAILABLE with factory helper", () => {
      const result = createModelUnavailableDetection({
        detectionType: "crowd-density",
        reason: "ONNX Runtime model file not found",
        modelId: "yolov8-crowd",
      });

      const validation = validateDetectionContract(result);
      expect(validation.valid).toBe(true);
      expect(result.confidence).toBeNull();
      expect(result.status).toBe("MODEL_UNAVAILABLE");
      expect(result.executionMetadata.status).toBe("MODEL_UNAVAILABLE");
    });

    it("requires confidence to be null when status is INFERENCE_FAILED", () => {
      const result = createInferenceFailedDetection({
        detectionType: "face-detector",
        reason: "GPU out of memory during tensor allocation",
        modelId: "insightface",
      });

      const validation = validateDetectionContract(result);
      expect(validation.valid).toBe(true);
      expect(result.confidence).toBeNull();
      expect(result.status).toBe("INFERENCE_FAILED");
    });

    it("labels heuristic detections with HEURISTIC_RULE_ENGINE provenance and nullable confidence", () => {
      const result = createHeuristicDetection({
        detectionType: "arc-flash",
        heuristicScore: 0.88,
        reason: "Brightness threshold 240/255 and blue-white ratio 0.91 in electrical switchgear zone",
      });

      const validation = validateDetectionContract(result);
      expect(validation.valid).toBe(true);
      expect(result.confidence).toBeNull();
      expect(result.provenance).toBe("HEURISTIC_RULE_ENGINE");
      expect(result.executionMetadata.heuristicScore).toBe(0.88);
    });

    it("labels simulation results with SIMULATION provenance and simulated: true", () => {
      const result = createSimulationDetection({
        detectionType: "power-failure-simulation",
        objects: [],
        scenarioName: "switchgear-phase3-trip",
      });

      const validation = validateDetectionContract(result);
      expect(validation.valid).toBe(true);
      expect(result.provenance).toBe("SIMULATION");
      expect(result.executionMetadata.simulated).toBe(true);
    });
  });

  describe("Error Classes", () => {
    it("instantiates ProductionMockForbiddenError with standard message", () => {
      const err = new ProductionMockForbiddenError();
      expect(err.name).toBe("ProductionMockForbiddenError");
      expect(err.message).toContain("strictly forbidden in production");
    });

    it("instantiates ModelUnavailableError with modelId", () => {
      const err = new ModelUnavailableError("Weights missing", "paddleclas-helmet");
      expect(err.name).toBe("ModelUnavailableError");
      expect(err.modelId).toBe("paddleclas-helmet");
    });

    it("instantiates InferenceFailedError with cause", () => {
      const cause = new Error("CUDA kernel error");
      const err = new InferenceFailedError("Execution failed", "yolo", cause);
      expect(err.name).toBe("InferenceFailedError");
      expect(err.cause).toBe(cause);
    });

    it("instantiates FabricatedSuccessError", () => {
      const err = new FabricatedSuccessError();
      expect(err.name).toBe("FabricatedSuccessError");
    });

    it("instantiates DependencyUnavailableError with dependency name", () => {
      const err = new DependencyUnavailableError("Redis offline", "redis");
      expect(err.name).toBe("DependencyUnavailableError");
      expect(err.dependencyName).toBe("redis");
    });
  });
});
