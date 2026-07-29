import { Tensor, type InferenceSession, type OnnxValue } from "onnxruntime-node";
import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";

/** COCO labels emitted by the stock Ultralytics YOLOv8 ONNX export. */
export const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
  "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
  "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
  "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
  "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
] as const;

type Candidate = InferenceObject;

/**
 * Executes a standard Ultralytics YOLOv8 detection export. Frames must be
 * normalized RGB24 buffers, which is the format emitted by FfmpegFrameExtractor.
 */
export class YoloCocoInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly confidenceThreshold = 0.5,
    private readonly iouThreshold = 0.45,
  ) {}

  async run(frame: DetectionFrame): Promise<InferenceObject[]> {
    const expected = frame.width * frame.height * 3;
    if (frame.imageData.length !== expected) {
      throw new Error(`Expected RGB24 frame with ${expected} bytes, received ${frame.imageData.length}`);
    }

    const chw = new Float32Array(expected);
    const plane = frame.width * frame.height;
    for (let pixel = 0; pixel < plane; pixel += 1) {
      const source = pixel * 3;
      chw[pixel] = frame.imageData[source]! / 255;
      chw[plane + pixel] = frame.imageData[source + 1]! / 255;
      chw[(2 * plane) + pixel] = frame.imageData[source + 2]! / 255;
    }

    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("YOLO model has no input tensor");
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, frame.height, frame.width]),
    });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("YOLO model produced no output tensor");
    return this.nonMaximumSuppression(this.decode(output, frame.width, frame.height));
  }

  private decode(output: OnnxValue, width: number, height: number): Candidate[] {
    if (!(output instanceof Tensor) || !(output.data instanceof Float32Array)) {
      throw new Error("YOLO output must be a float32 tensor");
    }
    const dims = output.dims.map(Number);
    if (dims.length !== 3 || dims[0] !== 1) {
      throw new Error(`Unsupported YOLO output shape: ${dims.join("x")}`);
    }

    // Ultralytics YOLOv8: [1, 84, candidates] (x, y, w, h, 80 class scores).
    const expectedFeatures = 4 + COCO_LABELS.length;
    // The standard export is [1, 84, candidates], though some exporters emit
    // [1, candidates, 84]. Do not infer orientation from the candidate count:
    // tests and low-volume streams can legitimately have fewer than 84.
    const featureFirst = dims[1] === expectedFeatures;
    const features = featureFirst ? dims[1]! : dims[2]!;
    const detections = featureFirst ? dims[2]! : dims[1]!;
    if (features < expectedFeatures) {
      throw new Error(`Unsupported YOLOv8 feature count: ${features}; expected at least ${expectedFeatures}`);
    }

    const data = output.data;
    const at = (detection: number, feature: number) => (
      featureFirst ? data[(feature * detections) + detection]! : data[(detection * features) + feature]!
    );
    const candidates: Candidate[] = [];

    for (let index = 0; index < detections; index += 1) {
      let classIndex = -1;
      let confidence = 0;
      for (let offset = 0; offset < COCO_LABELS.length; offset += 1) {
        const score = at(index, 4 + offset);
        if (score > confidence) {
          confidence = score;
          classIndex = offset;
        }
      }
      if (classIndex < 0 || confidence < this.confidenceThreshold) continue;

      const boxWidth = at(index, 2);
      const boxHeight = at(index, 3);
      candidates.push({
        label: COCO_LABELS[classIndex]!,
        confidence,
        boundingBox: {
          x: clamp((at(index, 0) - boxWidth / 2) / width),
          y: clamp((at(index, 1) - boxHeight / 2) / height),
          width: clamp(boxWidth / width),
          height: clamp(boxHeight / height),
        },
      });
    }
    return candidates;
  }

  private nonMaximumSuppression(candidates: Candidate[]): Candidate[] {
    const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const kept: Candidate[] = [];
    while (ordered.length > 0) {
      const best = ordered.shift()!;
      kept.push(best);
      for (let index = ordered.length - 1; index >= 0; index -= 1) {
        const candidate = ordered[index]!;
        if (candidate.label === best.label && iou(best, candidate) >= this.iouThreshold) {
          ordered.splice(index, 1);
        }
      }
    }
    return kept;
  }
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function iou(a: Candidate, b: Candidate): number {
  const intersection = Math.max(0, Math.min(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width) - Math.max(a.boundingBox.x, b.boundingBox.x))
    * Math.max(0, Math.min(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height) - Math.max(a.boundingBox.y, b.boundingBox.y));
  const union = a.boundingBox.width * a.boundingBox.height + b.boundingBox.width * b.boundingBox.height - intersection;
  return union > 0 ? intersection / union : 0;
}
