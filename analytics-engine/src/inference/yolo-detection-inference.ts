import { Tensor, type InferenceSession, type OnnxValue } from "onnxruntime-node";
import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";

export type YoloDecoder = "yolov8" | "yolov5" | "xyxy";

export interface YoloDetectionOptions {
  labels: readonly string[];
  decoder?: YoloDecoder;
  confidenceThreshold?: number;
  iouThreshold?: number;
  inputWidth?: number;
  inputHeight?: number;
}

/**
 * Executes the common ONNX object-detection layouts used by stock and
 * fine-tuned YOLO exports. Input RGB24 frames are resized to the model tensor
 * dimensions, so a fixed 640x640 export does not fail on a camera's native
 * resolution.
 */
export class YoloDetectionInference {
  private readonly decoder: YoloDecoder;
  private readonly confidenceThreshold: number;
  private readonly iouThreshold: number;

  constructor(
    private readonly session: InferenceSession,
    private readonly options: YoloDetectionOptions,
  ) {
    if (options.labels.length === 0) throw new Error("YOLO labels cannot be empty");
    this.decoder = options.decoder ?? "yolov8";
    this.confidenceThreshold = options.confidenceThreshold ?? 0.5;
    this.iouThreshold = options.iouThreshold ?? 0.45;
  }

  async run(frame: DetectionFrame): Promise<InferenceObject[]> {
    assertRgb24(frame);
    const { width, height } = this.inputDimensions(frame);
    const chw = resizeRgb24ToChw(frame.imageData, frame.width, frame.height, width, height);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("YOLO model has no input tensor");
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, height, width]),
    });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("YOLO model produced no output tensor");
    const candidates = this.decoder === "xyxy"
      ? this.decodeXyxy(output, width, height)
      : this.decodeRaw(output, width, height);
    return nonMaximumSuppression(candidates, this.iouThreshold);
  }

  private inputDimensions(frame: DetectionFrame) {
    const metadata = this.session.inputMetadata?.[0];
    const shape = metadata && "shape" in metadata ? metadata.shape : [];
    const metadataHeight = numericDimension(shape[2]);
    const metadataWidth = numericDimension(shape[3]);
    return {
      width: this.options.inputWidth ?? metadataWidth ?? frame.width,
      height: this.options.inputHeight ?? metadataHeight ?? frame.height,
    };
  }

  private decodeRaw(output: OnnxValue, width: number, height: number): InferenceObject[] {
    const tensor = floatTensor(output, "YOLO");
    const dims = tensor.dims.map(Number);
    if (dims.length !== 3 || dims[0] !== 1) {
      throw new Error(`Unsupported YOLO output shape: ${dims.join("x")}`);
    }

    const expectedFeatures = (this.decoder === "yolov5" ? 5 : 4) + this.options.labels.length;
    const featureFirst = orientation(dims[1]!, dims[2]!, expectedFeatures);
    const features = featureFirst ? dims[1]! : dims[2]!;
    const detections = featureFirst ? dims[2]! : dims[1]!;
    if (features < expectedFeatures) {
      throw new Error(`Unsupported ${this.decoder} feature count: ${features}; expected at least ${expectedFeatures}`);
    }
    const data = tensor.data as Float32Array;
    const at = (detection: number, feature: number) => featureFirst
      ? data[(feature * detections) + detection]!
      : data[(detection * features) + feature]!;
    const classOffset = this.decoder === "yolov5" ? 5 : 4;
    const candidates: InferenceObject[] = [];

    for (let index = 0; index < detections; index += 1) {
      let classIndex = -1;
      let classScore = Number.NEGATIVE_INFINITY;
      for (let offset = 0; offset < this.options.labels.length; offset += 1) {
        const score = at(index, classOffset + offset);
        if (score > classScore) {
          classScore = score;
          classIndex = offset;
        }
      }
      const confidence = this.decoder === "yolov5" ? at(index, 4) * classScore : classScore;
      if (classIndex < 0 || !Number.isFinite(confidence) || confidence < this.confidenceThreshold) continue;
      const boxWidth = at(index, 2);
      const boxHeight = at(index, 3);
      candidates.push({
        label: this.options.labels[classIndex]!, confidence,
        boundingBox: normalizeBox(
          at(index, 0) - boxWidth / 2,
          at(index, 1) - boxHeight / 2,
          boxWidth,
          boxHeight,
          width,
          height,
        ),
      });
    }
    return candidates;
  }

  private decodeXyxy(output: OnnxValue, width: number, height: number): InferenceObject[] {
    const tensor = floatTensor(output, "YOLO post-NMS");
    const dims = tensor.dims.map(Number);
    const rows = dims.length === 3 && dims[0] === 1 && dims[2] >= 6
      ? dims[1]!
      : dims.length === 2 && dims[1] >= 6 ? dims[0]! : 0;
    const features = dims.length === 3 ? dims[2]! : dims[1]!;
    if (!rows || !features) throw new Error(`Unsupported post-NMS output shape: ${dims.join("x")}`);
    const data = tensor.data as Float32Array;
    const candidates: InferenceObject[] = [];
    for (let row = 0; row < rows; row += 1) {
      const offset = row * features;
      const confidence = data[offset + 4]!;
      const classIndex = Math.trunc(data[offset + 5]!);
      if (confidence < this.confidenceThreshold || !this.options.labels[classIndex]) continue;
      const x1 = data[offset]!;
      const y1 = data[offset + 1]!;
      const x2 = data[offset + 2]!;
      const y2 = data[offset + 3]!;
      candidates.push({
        label: this.options.labels[classIndex]!, confidence,
        boundingBox: normalizeBox(x1, y1, x2 - x1, y2 - y1, width, height),
      });
    }
    return candidates;
  }
}

function assertRgb24(frame: DetectionFrame) {
  const expected = frame.width * frame.height * 3;
  if (frame.imageData.length !== expected) {
    throw new Error(`Expected RGB24 frame with ${expected} bytes, received ${frame.imageData.length}`);
  }
}

export function resizeRgb24ToChw(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  normalize: (value: number, channel?: number) => number = (value) => value / 255,
): Float32Array {
  const plane = targetWidth * targetHeight;
  const output = new Float32Array(plane * 3);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      const inputOffset = ((sourceY * sourceWidth) + sourceX) * 3;
      const outputOffset = (y * targetWidth) + x;
      output[outputOffset] = normalize(source[inputOffset]!, 0);
      output[plane + outputOffset] = normalize(source[inputOffset + 1]!, 1);
      output[(2 * plane) + outputOffset] = normalize(source[inputOffset + 2]!, 2);
    }
  }
  return output;
}

function numericDimension(value: number | string | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function floatTensor(value: OnnxValue, name: string): Tensor {
  if (!(value instanceof Tensor) || !(value.data instanceof Float32Array)) {
    throw new Error(`${name} output must be a float32 tensor`);
  }
  return value;
}

function orientation(first: number, second: number, expected: number) {
  if (first === expected) return true;
  if (second === expected) return false;
  if (first <= 512 && second > first) return true;
  if (second <= 512 && first > second) return false;
  throw new Error(`Cannot identify YOLO feature axis in 1x${first}x${second}`);
}

function normalizeBox(x: number, y: number, width: number, height: number, frameWidth: number, frameHeight: number) {
  const normalizedX = clamp(x / frameWidth);
  const normalizedY = clamp(y / frameHeight);
  return {
    x: normalizedX,
    y: normalizedY,
    width: Math.max(0.0001, Math.min(1 - normalizedX, width / frameWidth)),
    height: Math.max(0.0001, Math.min(1 - normalizedY, height / frameHeight)),
  };
}

function nonMaximumSuppression(candidates: InferenceObject[], threshold: number) {
  const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: InferenceObject[] = [];
  while (ordered.length > 0) {
    const best = ordered.shift()!;
    kept.push(best);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const candidate = ordered[index]!;
      if (candidate.label === best.label && iou(best, candidate) >= threshold) ordered.splice(index, 1);
    }
  }
  return kept;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function iou(a: InferenceObject, b: InferenceObject): number {
  const intersection = Math.max(0, Math.min(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width) - Math.max(a.boundingBox.x, b.boundingBox.x))
    * Math.max(0, Math.min(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height) - Math.max(a.boundingBox.y, b.boundingBox.y));
  const union = a.boundingBox.width * a.boundingBox.height + b.boundingBox.width * b.boundingBox.height - intersection;
  return union > 0 ? intersection / union : 0;
}
