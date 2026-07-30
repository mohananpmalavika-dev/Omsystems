/**
 * Core object detector. A local YOLOv8 ONNX session is used when provisioned;
 * normalized observations from an edge/open-model worker remain a supported
 * fallback for installations that intentionally run models elsewhere.
 */

import {
  BaseDetector,
  getInferenceObjects,
  hasInferenceObjects,
  type DetectionFrame,
  type DetectionResult,
  type InferenceObject,
} from "./base-detector.js";
import { getModelManager } from "../model-manager.js";
import { YoloCocoInference } from "../inference/yolo-coco-inference.js";
import { modelUnavailableReason } from "../inference/configured-model-inference.js";

interface ObjectDetectorConfig {
  confidenceThreshold: number;
  nmsThreshold: number;
  targetClasses: string[];
}

export const OBJECT_CLASSES = {
  PERSON: "person",
  CAR: "car",
  MOTORCYCLE: "motorcycle",
  BUS: "bus",
  TRUCK: "truck",
  BICYCLE: "bicycle",
  BAG: "bag",
  BACKPACK: "backpack",
  SUITCASE: "suitcase",
  HANDBAG: "handbag",
  PACKAGE: "package",
  LAPTOP: "laptop",
  CELL_PHONE: "cell phone",
  HELMET: "helmet",
  FIRE: "fire",
  SMOKE: "smoke",
} as const;

export class ObjectDetector extends BaseDetector {
  private readonly config: ObjectDetectorConfig;
  private inference: YoloCocoInference | null = null;
  private initialized = false;
  private modelLoadError: string | undefined;

  constructor(config: Partial<ObjectDetectorConfig> = {}) {
    super("object", "2.0.0");
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      nmsThreshold: config.nmsThreshold ?? 0.45,
      targetClasses: config.targetClasses ?? Object.values(OBJECT_CLASSES),
    };
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    try {
      const manager = getModelManager();
      if (!manager.isModelAvailable("yolov8n")) throw new Error(modelUnavailableReason("yolov8n"));
      const model = await manager.getModel("yolov8n");
      this.inference = new YoloCocoInference(
        model,
        this.config.confidenceThreshold,
        this.config.nmsThreshold,
      );
      this.modelLoadError = undefined;
      console.log("Object detector loaded YOLOv8 ONNX model");
    } catch (error) {
      this.inference = null;
      this.modelLoadError = error instanceof Error ? error.message : String(error);
      console.warn(`Object detector has no local model; external normalized detections remain available: ${this.modelLoadError}`);
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.initialized) throw new Error("ObjectDetector not initialized");

    // A supplied (including empty) detection list is authoritative. This lets
    // the pipeline perform one shared local inference pass and prevents every
    // downstream detector from rerunning the same model.
    const fromNormalizedObservation = hasInferenceObjects(frame);
    const candidates: InferenceObject[] = fromNormalizedObservation
      ? getInferenceObjects(frame)
      : this.inference
        ? await this.inference.run(frame)
        : [];
    const objects = candidates.filter((item) => (
      item.confidence >= this.config.confidenceThreshold
      && (fromNormalizedObservation || this.config.targetClasses.includes(item.label))
    ));

    if (objects.length === 0) return [];
    return [{
      detectionType: "object",
      confidence: Math.max(...objects.map((item) => item.confidence)),
      objects,
      metadata: {
        count: objects.length,
        source: fromNormalizedObservation ? "normalized-observation" : "local-yolov8-onnx",
      },
      requiresAlert: false,
    }];
  }

  async cleanup(): Promise<void> {
    this.inference = null;
    this.initialized = false;
  }

  getHealth() {
    if (!this.initialized) {
      return { status: "unhealthy" as const, details: "Object detector not initialized" };
    }
    if (!this.inference) {
      return {
        status: "degraded" as const,
        details: `External normalized detections only; local YOLOv8 unavailable: ${this.modelLoadError ?? "model not provisioned"}`,
      };
    }
    return { status: "healthy" as const, details: "Local YOLOv8 ONNX inference active" };
  }
}
