import { Tensor, type InferenceSession } from "onnxruntime-node";
import sharp from "sharp";
import type { DetectionFrame } from "../detectors/base-detector.js";
import { cropRgb24 } from "./vision-specialty-inference.js";
import { HELMET_HEAD_PROBE } from "./helmet-head-probe.js";

export interface HelmetHeadProbe {
  dimensions: number;
  weights: readonly number[];
  bias: number;
}

/** The classifier consumes complete localized heads, rather than crown strips. */
export function classifyHelmetHeadEmbedding(embedding: ArrayLike<number>, probe: HelmetHeadProbe = HELMET_HEAD_PROBE) {
  if (embedding.length !== probe.dimensions || probe.weights.length !== probe.dimensions ||
      !Number.isFinite(probe.bias) || !probe.weights.every(Number.isFinite)) {
    throw new Error("Invalid helmet head classifier dimensions or parameters");
  }
  const feature = Array.from(embedding);
  const norm = Math.hypot(...feature);
  if (!feature.every(Number.isFinite) || !Number.isFinite(norm) || norm < 1e-8) {
    throw new Error("Helmet head feature model returned an invalid embedding");
  }
  const logit = feature.reduce((sum, value, index) => sum + value / norm * probe.weights[index]!, probe.bias);
  const exponential = Math.exp(logit >= 0 ? -logit : logit);
  const wearingHelmetConfidence = logit >= 0 ? 1 / (1 + exponential) : exponential / (1 + exponential);
  const unwearingHelmetConfidence = 1 - wearingHelmetConfidence;
  const wearingHelmet = wearingHelmetConfidence >= 0.5;
  return { wearingHelmet, confidence: Math.max(wearingHelmetConfidence, unwearingHelmetConfidence),
    wearingHelmetConfidence, unwearingHelmetConfidence };
}

export class HelmetHeadClassificationInference {
  constructor(private readonly session: InferenceSession) {}

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }) {
    const crop = cropRgb24(frame, box);
    const pixels = await sharp(crop.imageData, { raw: { width: crop.width, height: crop.height, channels: 3 } })
      .resize(224, 224, { fit: "cover", position: "centre", kernel: "cubic" }).raw().toBuffer();
    const mean = [0.48145466, 0.4578275, 0.40821073];
    const standardDeviation = [0.26862954, 0.26130258, 0.27577711];
    const chw = new Float32Array(3 * 224 * 224);
    for (let index = 0; index < 224 * 224; index++) {
      for (let channel = 0; channel < 3; channel++) {
        chw[channel * 224 * 224 + index] = (pixels[index * 3 + channel]! / 255 - mean[channel]!) / standardDeviation[channel]!;
      }
    }
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Helmet head feature model has no input tensor");
    const output = await this.session.run({ [inputName]: new Tensor("float32", chw, [1, 3, 224, 224]) });
    const embedding = output.image_embeds ?? output[this.session.outputNames[0]!];
    if (!embedding || embedding.type !== "float32" || embedding.dims.length !== 2 ||
        embedding.dims[0] !== 1 || embedding.dims[1] !== HELMET_HEAD_PROBE.dimensions) {
      throw new Error("Helmet head feature model returned an unexpected output tensor");
    }
    return classifyHelmetHeadEmbedding(embedding.data as Float32Array);
  }
}
