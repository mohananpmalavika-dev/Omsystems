import type { InferenceSession } from "onnxruntime-node";
import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";
import { getModelManager, type ModelConfig } from "../model-manager.js";
import { COCO_LABELS } from "./yolo-coco-inference.js";
import { YoloDetectionInference } from "./yolo-detection-inference.js";
import { CtcTextInference, FaceEmbeddingInference } from "./vision-specialty-inference.js";

export interface ObjectFrameInference {
  run(frame: DetectionFrame): Promise<InferenceObject[]>;
}

export interface PlateTextInference {
  run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<{ text: string; confidence: number; characters: Array<{ char: string; confidence: number }> }>;
}

export interface FaceVectorInference {
  run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<number[]>;
}

export async function loadObjectInference(modelId: string, confidenceThreshold: number): Promise<ObjectFrameInference> {
  const manager = getModelManager();
  const config = requiredConfig(modelId);
  if (config.task !== "object-detection") throw new Error(`Model ${modelId} is not configured for object detection`);
  if (!manager.isModelAvailable(modelId)) throw new Error(modelUnavailableReason(modelId));
  const session = await manager.getModel(modelId) as InferenceSession;
  const dimensions = inputDimensions(config);
  return new YoloDetectionInference(session, {
    labels: config.labelSet === "coco" ? COCO_LABELS : config.labels ?? [],
    decoder: config.decoder,
    confidenceThreshold,
    inputWidth: dimensions.width,
    inputHeight: dimensions.height,
  });
}

export async function loadPlateTextInference(modelId: string): Promise<PlateTextInference> {
  const manager = getModelManager();
  const config = requiredConfig(modelId);
  if (config.task !== "ctc-text-recognition" || !config.alphabet) {
    throw new Error(`Model ${modelId} is not configured for CTC text recognition`);
  }
  if (!manager.isModelAvailable(modelId)) throw new Error(modelUnavailableReason(modelId));
  const dimensions = inputDimensions(config);
  return new CtcTextInference(
    await manager.getModel(modelId) as InferenceSession,
    config.alphabet,
    config.blankIndex ?? 0,
    dimensions.width,
    dimensions.height,
  );
}

export async function loadFaceVectorInference(modelId: string): Promise<FaceVectorInference> {
  const manager = getModelManager();
  const config = requiredConfig(modelId);
  if (config.task !== "face-embedding") throw new Error(`Model ${modelId} is not configured for face embeddings`);
  if (!manager.isModelAvailable(modelId)) throw new Error(modelUnavailableReason(modelId));
  const dimensions = inputDimensions(config);
  return new FaceEmbeddingInference(
    await manager.getModel(modelId) as InferenceSession,
    dimensions.width,
    dimensions.height,
  );
}

export function modelUnavailableReason(modelId: string): string {
  const availability = getModelManager().getModelInventory().find((model) => model.id === modelId);
  if (!availability) return `Model ${modelId} is absent from the manifest`;
  return `Model ${modelId} is ${availability.status}: ${availability.reason ?? availability.resolvedPath}`;
}

function requiredConfig(modelId: string): ModelConfig {
  const config = getModelManager().getModelConfig(modelId);
  if (!config) throw new Error(`Model ${modelId} is absent from the manifest`);
  return config;
}

function inputDimensions(config: ModelConfig) {
  const shape = config.inputShape ?? [];
  const height = shape[2];
  const width = shape[3];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width! <= 0 || height! <= 0) {
    throw new Error(`Model ${config.id} must declare a fixed NCHW inputShape`);
  }
  return { width: width!, height: height! };
}
