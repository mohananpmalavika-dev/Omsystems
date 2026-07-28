import { Tensor, type InferenceSession, type OnnxValue } from "onnxruntime-node";
import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";

type Candidate = InferenceObject;

export class YoloPersonInference {
  constructor(private readonly session: InferenceSession, private readonly confidenceThreshold = 0.5, private readonly iouThreshold = 0.45) {}

  async run(frame: DetectionFrame): Promise<InferenceObject[]> {
    const expected = frame.width * frame.height * 3;
    if (frame.imageData.length !== expected) throw new Error(`Expected RGB24 frame with ${expected} bytes, received ${frame.imageData.length}`);
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
    const outputs = await this.session.run({ [inputName]: new Tensor("float32", chw, [1, 3, frame.height, frame.width]) });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("YOLO model produced no output tensor");
    return this.nonMaximumSuppression(this.decode(output, frame.width, frame.height));
  }

  private decode(output: OnnxValue, width: number, height: number): Candidate[] {
    if (!(output instanceof Tensor) || !(output.data instanceof Float32Array)) throw new Error("YOLO output must be a float32 tensor");
    const dims = output.dims.map(Number);
    if (dims.length !== 3 || dims[0] !== 1) throw new Error(`Unsupported YOLO output shape: ${dims.join("x")}`);
    const featureFirst = dims[1]! < dims[2]!;
    const features = featureFirst ? dims[1]! : dims[2]!;
    const detections = featureFirst ? dims[2]! : dims[1]!;
    if (features < 5) throw new Error(`Unsupported YOLO feature count: ${features}`);
    const data = output.data;
    const at = (detection: number, feature: number) => featureFirst ? data[(feature * detections) + detection]! : data[(detection * features) + feature]!;
    const candidates: Candidate[] = [];
    for (let index = 0; index < detections; index += 1) {
      const confidence = at(index, 4); // COCO class zero is person.
      if (confidence < this.confidenceThreshold) continue;
      const boxWidth = at(index, 2);
      const boxHeight = at(index, 3);
      candidates.push({
        label: "person", confidence,
        boundingBox: {
          x: clamp((at(index, 0) - boxWidth / 2) / width),
          y: clamp((at(index, 1) - boxHeight / 2) / height),
          width: clamp(boxWidth / width), height: clamp(boxHeight / height),
        },
      });
    }
    return candidates;
  }

  private nonMaximumSuppression(candidates: Candidate[]): Candidate[] {
    const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const kept: Candidate[] = [];
    while (ordered.length) {
      const best = ordered.shift()!;
      kept.push(best);
      for (let index = ordered.length - 1; index >= 0; index -= 1) if (iou(best, ordered[index]!) >= this.iouThreshold) ordered.splice(index, 1);
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
