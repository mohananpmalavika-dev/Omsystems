import { Tensor, type InferenceSession, type OnnxValue } from "onnxruntime-node";
import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";

export type NormalizedBox = { x: number; y: number; width: number; height: number };
export type NormalizedPoint = { x: number; y: number };

/**
 * Native ONNX Runtime adapter for OpenCV Zoo's YuNet face detector.  It keeps
 * its five landmarks so the paired SFace embedding model can align faces.
 */
export class YuNetFaceInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly confidenceThreshold = 0.8,
    private readonly nmsThreshold = 0.3,
    private readonly inputWidth = 640,
    private readonly inputHeight = 640,
  ) {}

  async run(frame: DetectionFrame): Promise<InferenceObject[]> {
    assertRgb24(frame);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("YuNet model has no input tensor");
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", resizeRgb24ToBgrChw(frame, this.inputWidth, this.inputHeight), [1, 3, this.inputHeight, this.inputWidth]),
    });

    const candidates: InferenceObject[] = [];
    for (const stride of [8, 16, 32]) {
      const cls = floatOutput(outputs, `cls_${stride}`, "YuNet");
      const obj = floatOutput(outputs, `obj_${stride}`, "YuNet");
      const bbox = floatOutput(outputs, `bbox_${stride}`, "YuNet");
      const kps = floatOutput(outputs, `kps_${stride}`, "YuNet");
      const count = Math.floor((this.inputWidth / stride) * (this.inputHeight / stride));
      const columns = Math.floor(this.inputWidth / stride);
      assertCount(cls, count, 1, `cls_${stride}`);
      assertCount(obj, count, 1, `obj_${stride}`);
      assertCount(bbox, count, 4, `bbox_${stride}`);
      assertCount(kps, count, 10, `kps_${stride}`);
      const clsData = cls.data as Float32Array;
      const objData = obj.data as Float32Array;
      const boxData = bbox.data as Float32Array;
      const landmarkData = kps.data as Float32Array;

      for (let index = 0; index < count; index += 1) {
        const confidence = Math.sqrt(clamp(clsData[index]!) * clamp(objData[index]!));
        if (confidence < this.confidenceThreshold) continue;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const offset = index * 4;
        const centerX = (column + boxData[offset]!) * stride;
        const centerY = (row + boxData[offset + 1]!) * stride;
        const width = Math.exp(boxData[offset + 2]!) * stride;
        const height = Math.exp(boxData[offset + 3]!) * stride;
        const landmarks: NormalizedPoint[] = [];
        for (let landmark = 0; landmark < 5; landmark += 1) {
          const pointOffset = (index * 10) + (landmark * 2);
          landmarks.push({
            x: clamp(((landmarkData[pointOffset]! + column) * stride) / this.inputWidth),
            y: clamp(((landmarkData[pointOffset + 1]! + row) * stride) / this.inputHeight),
          });
        }
        candidates.push({
          label: "face",
          confidence,
          boundingBox: normalizeBox(centerX - width / 2, centerY - height / 2, width, height, this.inputWidth, this.inputHeight),
          attributes: { landmarks },
        });
      }
    }
    return nonMaximumSuppression(candidates, this.nmsThreshold);
  }
}

/** Native ONNX Runtime adapter for OpenCV Zoo's LPD-YuNet plate detector. */
export class LpdYuNetInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly confidenceThreshold = 0.7,
    private readonly nmsThreshold = 0.3,
    private readonly inputWidth = 320,
    private readonly inputHeight = 240,
  ) {}

  async run(frame: DetectionFrame): Promise<InferenceObject[]> {
    assertRgb24(frame);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("LPD-YuNet model has no input tensor");
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", resizeRgb24ToBgrChw(frame, this.inputWidth, this.inputHeight), [1, 3, this.inputHeight, this.inputWidth]),
    });
    const loc = floatOutput(outputs, "loc", "LPD-YuNet");
    const conf = floatOutput(outputs, "conf", "LPD-YuNet");
    const iou = floatOutput(outputs, "iou", "LPD-YuNet");
    const priors = lpdPriors(this.inputWidth, this.inputHeight);
    assertCount(loc, priors.length, 14, "loc");
    assertCount(conf, priors.length, 2, "conf");
    assertCount(iou, priors.length, 1, "iou");
    const locData = loc.data as Float32Array;
    const confData = conf.data as Float32Array;
    const iouData = iou.data as Float32Array;
    const candidates: InferenceObject[] = [];

    for (let index = 0; index < priors.length; index += 1) {
      const confidence = Math.sqrt(clamp(confData[(index * 2) + 1]!) * clamp(iouData[index]!));
      if (confidence < this.confidenceThreshold) continue;
      const prior = priors[index]!;
      const base = index * 14;
      const corners = [4, 6, 10, 12].map((offset) => ({
        x: within((prior.x + locData[base + offset]! * 0.1 * prior.width) * this.inputWidth, this.inputWidth),
        y: within((prior.y + locData[base + offset + 1]! * 0.1 * prior.height) * this.inputHeight, this.inputHeight),
      }));
      const minX = Math.min(...corners.map((point) => point.x));
      const maxX = Math.max(...corners.map((point) => point.x));
      const minY = Math.min(...corners.map((point) => point.y));
      const maxY = Math.max(...corners.map((point) => point.y));
      candidates.push({
        label: "license-plate",
        confidence,
        boundingBox: normalizeBox(minX, minY, maxX - minX, maxY - minY, this.inputWidth, this.inputHeight),
        attributes: { corners },
      });
    }
    return nonMaximumSuppression(candidates, this.nmsThreshold);
  }
}

function assertRgb24(frame: DetectionFrame) {
  const expected = frame.width * frame.height * 3;
  if (frame.imageData.length !== expected) {
    throw new Error(`Expected RGB24 frame with ${expected} bytes, received ${frame.imageData.length}`);
  }
}

export function resizeRgb24ToBgrChw(frame: DetectionFrame, targetWidth: number, targetHeight: number): Float32Array {
  const plane = targetWidth * targetHeight;
  const output = new Float32Array(plane * 3);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor((y * frame.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor((x * frame.width) / targetWidth));
      const inputOffset = ((sourceY * frame.width) + sourceX) * 3;
      const outputOffset = (y * targetWidth) + x;
      output[outputOffset] = frame.imageData[inputOffset + 2]!;
      output[plane + outputOffset] = frame.imageData[inputOffset + 1]!;
      output[(2 * plane) + outputOffset] = frame.imageData[inputOffset]!;
    }
  }
  return output;
}

function floatOutput(outputs: Record<string, OnnxValue>, name: string, modelName: string): Tensor {
  const value = outputs[name];
  if (!(value instanceof Tensor) || !(value.data instanceof Float32Array)) {
    throw new Error(`${modelName} output ${name} must be a float32 tensor`);
  }
  return value;
}

function assertCount(tensor: Tensor, expectedCount: number, features: number, name: string) {
  if (tensor.data.length !== expectedCount * features) {
    throw new Error(`Unexpected ${name} output length ${tensor.data.length}; expected ${expectedCount * features}`);
  }
}

function normalizeBox(x: number, y: number, width: number, height: number, frameWidth: number, frameHeight: number): NormalizedBox {
  const normalizedX = clamp(x / frameWidth);
  const normalizedY = clamp(y / frameHeight);
  return {
    x: normalizedX,
    y: normalizedY,
    width: Math.max(0.0001, Math.min(1 - normalizedX, width / frameWidth)),
    height: Math.max(0.0001, Math.min(1 - normalizedY, height / frameHeight)),
  };
}

function nonMaximumSuppression(candidates: InferenceObject[], threshold: number): InferenceObject[] {
  const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: InferenceObject[] = [];
  while (ordered.length > 0) {
    const best = ordered.shift()!;
    kept.push(best);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (iou(best.boundingBox, ordered[index]!.boundingBox) >= threshold) ordered.splice(index, 1);
    }
  }
  return kept;
}

function iou(a: NormalizedBox, b: NormalizedBox): number {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const union = (a.width * a.height) + (b.width * b.height) - intersection;
  return union > 0 ? intersection / union : 0;
}

function lpdPriors(width: number, height: number) {
  const feature2 = [Math.floor(Math.floor((height + 1) / 2) / 2), Math.floor(Math.floor((width + 1) / 2) / 2)];
  const feature3 = [Math.floor(feature2[0]! / 2), Math.floor(feature2[1]! / 2)];
  const feature4 = [Math.floor(feature3[0]! / 2), Math.floor(feature3[1]! / 2)];
  const feature5 = [Math.floor(feature4[0]! / 2), Math.floor(feature4[1]! / 2)];
  const feature6 = [Math.floor(feature5[0]! / 2), Math.floor(feature5[1]! / 2)];
  const featureMaps = [feature3, feature4, feature5, feature6];
  const minSizes = [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]];
  const steps = [8, 16, 32, 64];
  const priors: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let level = 0; level < featureMaps.length; level += 1) {
    const [rows, columns] = featureMaps[level]!;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        for (const minSize of minSizes[level]!) {
          priors.push({
            x: (column + 0.5) * steps[level]! / width,
            y: (row + 0.5) * steps[level]! / height,
            width: minSize / width,
            height: minSize / height,
          });
        }
      }
    }
  }
  return priors;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const within = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
