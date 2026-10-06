import { getModelManager } from "../model-manager.js";
import { COCO_LABELS } from "./yolo-coco-inference.js";
import { YoloDetectionInference } from "./yolo-detection-inference.js";
import { LpdYuNetInference, YuNetFaceInference } from "./opencv-specialty-inference.js";
import { CtcTextInference, FaceEmbeddingInference, HelmetClassificationInference, PersonReIdInference, VehicleReIdInference, PersonAttributeInference, YoloPoseInference } from "./vision-specialty-inference.js";
export async function loadObjectInference(modelId, confidenceThreshold) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "object-detection")
        throw new Error(`Model ${modelId} is not configured for object detection`);
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const session = await manager.getModel(modelId);
    const dimensions = inputDimensions(config);
    if (config.decoder === "yunet-face") {
        return new YuNetFaceInference(session, confidenceThreshold, 0.3, dimensions.width, dimensions.height);
    }
    if (config.decoder === "lpd-yunet") {
        return new LpdYuNetInference(session, confidenceThreshold, 0.3, dimensions.width, dimensions.height);
    }
    const inference = new YoloDetectionInference(session, {
        labels: config.labelSet === "coco" ? COCO_LABELS : config.labels ?? [],
        ...yoloModelOptions(config),
        confidenceThreshold,
        inputWidth: dimensions.width,
        inputHeight: dimensions.height,
    });
    if (modelId === "fire-smoke") {
        await assertResponsiveObjectInference(inference, "Fire/smoke model");
    }
    return inference;
}
/** Rejects placeholder/corrupt detectors with constant non-empty output. */
export async function assertResponsiveObjectInference(inference, modelName = "Object model") {
    const width = 64;
    const height = 64;
    const makeFrame = (value) => ({
        cameraId: "model-self-test",
        tenantId: "model-self-test",
        timestamp: new Date(0),
        width,
        height,
        imageData: Buffer.alloc(width * height * 3, value),
    });
    const dark = await inference.run(makeFrame(0));
    const bright = await inference.run(makeFrame(255));
    if (dark.length > 0 && detectionFingerprint(dark) === detectionFingerprint(bright)) {
        throw new Error(`${modelName} failed responsiveness self-test: identical non-empty detections for black and white frames`);
    }
}
function detectionFingerprint(detections) {
    return JSON.stringify(detections.map((detection) => ({
        label: detection.label,
        confidence: Number(detection.confidence?.toFixed(6)),
        boundingBox: {
            x: Number(detection.boundingBox.x.toFixed(6)),
            y: Number(detection.boundingBox.y.toFixed(6)),
            width: Number(detection.boundingBox.width.toFixed(6)),
            height: Number(detection.boundingBox.height.toFixed(6)),
        },
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}
/**
 * The model manifest also describes specialty ONNX models. Keep generic YOLO
 * callers deliberately constrained to the layouts they understand.
 */
export function yoloModelOptions(config) {
    const decoder = config?.decoder;
    const preprocessor = config?.preprocessor;
    return {
        decoder: decoder === "yolov8" || decoder === "yolov5" || decoder === "yolox" || decoder === "xyxy"
            ? decoder
            : undefined,
        preprocessor: preprocessor === "rgb-normalized-stretch" || preprocessor === "rgb-normalized-letterbox" || preprocessor === "yolox-letterbox-bgr"
            ? preprocessor
            : undefined,
        inputWidth: config?.inputShape?.[3],
        inputHeight: config?.inputShape?.[2],
    };
}
export async function loadPlateTextInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "ctc-text-recognition" || !config.alphabet) {
        throw new Error(`Model ${modelId} is not configured for CTC text recognition`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    return new CtcTextInference(await manager.getModel(modelId), config.alphabet, config.blankIndex ?? 0, dimensions.width, dimensions.height, config.inputShape?.[1] ?? 3);
}
export async function loadFaceVectorInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "face-embedding")
        throw new Error(`Model ${modelId} is not configured for face embeddings`);
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    return new FaceEmbeddingInference(await manager.getModel(modelId), dimensions.width, dimensions.height);
}
export async function loadHelmetClassificationInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "helmet-classification") {
        throw new Error(`Model ${modelId} is not configured for helmet classification`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    return new HelmetClassificationInference(await manager.getModel(modelId), dimensions.width, dimensions.height, config.preprocessor === "imagenet-stretch" ? "imagenet-stretch" : "paddleclas-imagenet", config.postprocessor === "softmax");
}
export async function loadPersonVectorInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    // person-reid should use task: person-reid, but for backward compatibility we also accept face-embedding
    if (config.task !== "person-reid" && config.task !== "face-embedding") {
        throw new Error(`Model ${modelId} is not configured for person re-ID (expected task: person-reid)`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    // Create dedicated PersonReIdInference with OSNet-appropriate dimensions and preprocessing
    return new PersonReIdInference(await manager.getModel(modelId), dimensions.width, dimensions.height);
}
export async function loadVehicleVectorInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    // vehicle-reid should use task: vehicle-reid, but for backward compatibility we also accept face-embedding
    if (config.task !== "vehicle-reid" && config.task !== "face-embedding") {
        throw new Error(`Model ${modelId} is not configured for vehicle re-ID (expected task: vehicle-reid)`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    // Create dedicated VehicleReIdInference with vehicle-appropriate preprocessing
    return new VehicleReIdInference(await manager.getModel(modelId), dimensions.width, dimensions.height);
}
export async function loadPoseInference(modelId, confidenceThreshold = 0.5) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "pose-estimation") {
        throw new Error(`Model ${modelId} is not configured for pose estimation (expected task: pose-estimation)`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    return new YoloPoseInference(await manager.getModel(modelId), confidenceThreshold, dimensions.width, dimensions.height);
}
export async function loadAttributeInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "attribute-estimation") {
        throw new Error(`Model ${modelId} is not configured for attribute estimation (expected task: attribute-estimation)`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    return new PersonAttributeInference(await manager.getModel(modelId), dimensions.width, dimensions.height);
}
export async function loadEmotionInference(modelId) {
    const manager = getModelManager();
    const config = requiredConfig(modelId);
    if (config.task !== "emotion-recognition") {
        throw new Error(`Model ${modelId} is not configured for emotion recognition (expected task: emotion-recognition)`);
    }
    if (!manager.isModelAvailable(modelId))
        throw new Error(modelUnavailableReason(modelId));
    const dimensions = inputDimensions(config);
    const { EmotionRecognitionInference } = await import("./emotion-recognition-inference.js");
    return new EmotionRecognitionInference(await manager.getModel(modelId), dimensions.width, dimensions.height);
}
export function modelUnavailableReason(modelId) {
    const availability = getModelManager().getModelInventory().find((model) => model.id === modelId);
    if (!availability)
        return `Model ${modelId} is absent from the manifest`;
    return `Model ${modelId} is ${availability.status}: ${availability.reason ?? availability.resolvedPath}`;
}
function requiredConfig(modelId) {
    const config = getModelManager().getModelConfig(modelId);
    if (!config)
        throw new Error(`Model ${modelId} is absent from the manifest`);
    return config;
}
function inputDimensions(config) {
    const shape = config.inputShape ?? [];
    const height = shape[2];
    const width = shape[3];
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error(`Model ${config.id} must declare a fixed NCHW inputShape`);
    }
    return { width: width, height: height };
}
