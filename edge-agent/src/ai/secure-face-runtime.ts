import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "./sharp-runtime.js";

type Artifact = {
  id: "detector" | "recognizer" | "liveness";
  file: string;
  sha256: string;
  modelName: string;
  modelVersion: string;
  input: { width: number; height: number; color: "rgb"; normalization: "zero-one" | "minus-one-one" };
  /** Detector must expose post-NMS rows [x,y,width,height,score,...]. */
  output?: "post-nms-xywh-score" | "binary-live-logits" | "embedding";
};

type Manifest = { version: 1; artifacts: Artifact[] };

export interface SecureFaceRuntimeOptions {
  manifestPath: string;
  minLivenessScore: number;
  executionProviders?: ort.InferenceSession.ExecutionProviderConfig[];
}

export interface SecureFaceObservation {
  edgeEventId: string;
  embedding: number[];
  livenessScore: number;
  faceBbox: { x: number; y: number; width: number; height: number };
  modelName: string;
  modelVersion: string;
}

export class SecureFaceRuntime {
  private detector: ort.InferenceSession | null = null;
  private recognizer: ort.InferenceSession | null = null;
  private liveness: ort.InferenceSession | null = null;
  private artifacts = new Map<Artifact["id"], Artifact>();
  private unavailableReason: string | null = "not_initialized";

  constructor(private readonly options: SecureFaceRuntimeOptions) {}

  async initialize(): Promise<void> {
    const manifestPath = resolve(this.options.manifestPath);
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.artifacts)) throw new Error("secure_face_manifest_invalid");
    for (const artifact of parsed.artifacts) this.artifacts.set(artifact.id, artifact);
    const required = ["detector", "recognizer", "liveness"] as const;
    for (const id of required) {
      const artifact = this.artifacts.get(id);
      if (!artifact || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw new Error(`secure_face_artifact_invalid:${id}`);
      const filePath = resolve(dirname(manifestPath), artifact.file);
      if (!(await verified(filePath, artifact.sha256))) throw new Error(`secure_face_artifact_unverified:${id}`);
    }
    const providers = this.options.executionProviders ?? ["cpu"];
    const load = async (id: Artifact["id"]) => {
      const artifact = this.artifacts.get(id)!;
      return ort.InferenceSession.create(resolve(dirname(manifestPath), artifact.file), {
        executionProviders: providers,
        graphOptimizationLevel: "all",
      });
    };
    this.detector = await load("detector");
    this.recognizer = await load("recognizer");
    this.liveness = await load("liveness");
    this.unavailableReason = null;
  }

  status() {
    return {
      available: Boolean(this.detector && this.recognizer && this.liveness),
      reason: this.unavailableReason,
      artifacts: [...this.artifacts.values()].map(({ id, modelName, modelVersion }) => ({ id, modelName, modelVersion })),
    };
  }

  /**
   * Runs detector, liveness and 512-d recognition locally. It deliberately
   * returns no result for no-face, spoof, low-quality, or ambiguous frames.
   */
  async observeRgbFrame(rgb: Buffer, frameWidth: number, frameHeight: number): Promise<SecureFaceObservation | null> {
    if (!this.detector || !this.recognizer || !this.liveness) throw new Error(`secure_face_model_unavailable:${this.unavailableReason ?? "unknown"}`);
    if (rgb.length !== frameWidth * frameHeight * 3) throw new Error("secure_face_invalid_rgb_frame");
    const detectorArtifact = this.artifacts.get("detector")!;
    const detection = await this.detect(rgb, frameWidth, frameHeight, detectorArtifact);
    if (!detection) return null;
    const face = await sharp(rgb, { raw: { width: frameWidth, height: frameHeight, channels: 3 } })
      .extract({ left: detection.x, top: detection.y, width: detection.width, height: detection.height })
      .resize(112, 112, { fit: "fill" }).raw().toBuffer();
    const livenessArtifact = this.artifacts.get("liveness")!;
    const livenessScore = await this.liveScore(face, livenessArtifact);
    if (livenessScore < this.options.minLivenessScore) return null;
    const recognizerArtifact = this.artifacts.get("recognizer")!;
    const embedding = await this.embed(face, recognizerArtifact);
    return {
      edgeEventId: randomUUID(), embedding, livenessScore,
      faceBbox: detection,
      modelName: recognizerArtifact.modelName,
      modelVersion: recognizerArtifact.modelVersion,
    };
  }

  private async detect(rgb: Buffer, sourceWidth: number, sourceHeight: number, artifact: Artifact) {
    if (artifact.output !== "post-nms-xywh-score") throw new Error("secure_face_detector_adapter_unsupported");
    const resized = await resizeRgb(rgb, sourceWidth, sourceHeight, artifact.input.width, artifact.input.height);
    const outputs = await this.detector!.run({ [this.detector!.inputNames[0]!]: tensor(resized, artifact.input) });
    const output = firstFloatOutput(outputs);
    let best: { x: number; y: number; width: number; height: number; score: number } | null = null;
    for (let index = 0; index + 4 < output.length; index += 5) {
      const [x, y, width, height, score] = [output[index]!, output[index + 1]!, output[index + 2]!, output[index + 3]!, output[index + 4]!];
      if (!Number.isFinite(score) || score < 0.85 || width < 24 || height < 24) continue;
      if (!best || score > best.score) best = { x, y, width, height, score };
    }
    if (!best) return null;
    const scaleX = sourceWidth / artifact.input.width;
    const scaleY = sourceHeight / artifact.input.height;
    const x = Math.max(0, Math.floor(best.x * scaleX));
    const y = Math.max(0, Math.floor(best.y * scaleY));
    const width = Math.min(sourceWidth - x, Math.ceil(best.width * scaleX));
    const height = Math.min(sourceHeight - y, Math.ceil(best.height * scaleY));
    return width >= 40 && height >= 40 ? { x, y, width, height } : null;
  }

  private async liveScore(faceRgb: Buffer, artifact: Artifact) {
    if (artifact.output !== "binary-live-logits") throw new Error("secure_face_liveness_adapter_unsupported");
    const image = await resizeRgb(faceRgb, 112, 112, artifact.input.width, artifact.input.height);
    const outputs = await this.liveness!.run({ [this.liveness!.inputNames[0]!]: tensor(image, artifact.input) });
    const values = firstFloatOutput(outputs);
    if (values.length !== 2) throw new Error("secure_face_liveness_output_invalid");
    const max = Math.max(values[0]!, values[1]!);
    const denominator = Math.exp(values[0]! - max) + Math.exp(values[1]! - max);
    return Math.exp(values[1]! - max) / denominator; // class 1 must be "live" in the approved artifact contract
  }

  private async embed(faceRgb: Buffer, artifact: Artifact) {
    if (artifact.output !== "embedding") throw new Error("secure_face_recognizer_adapter_unsupported");
    const image = await resizeRgb(faceRgb, 112, 112, artifact.input.width, artifact.input.height);
    const outputs = await this.recognizer!.run({ [this.recognizer!.inputNames[0]!]: tensor(image, artifact.input) });
    const values = firstFloatOutput(outputs);
    if (values.length !== 512) throw new Error("secure_face_embedding_dimension_invalid");
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude < 1e-12) throw new Error("secure_face_embedding_invalid");
    return Array.from(values, (value) => Number((value / magnitude).toFixed(8)));
  }
}

async function resizeRgb(input: Buffer, width: number, height: number, targetWidth: number, targetHeight: number) {
  return sharp(input, { raw: { width, height, channels: 3 } }).resize(targetWidth, targetHeight, { fit: "fill" }).raw().toBuffer();
}

function tensor(rgb: Buffer, input: Artifact["input"]) {
  const data = new Float32Array(3 * input.width * input.height);
  const pixels = input.width * input.height;
  for (let pixel = 0; pixel < pixels; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      const value = rgb[pixel * 3 + channel]!;
      data[channel * pixels + pixel] = input.normalization === "minus-one-one" ? value / 127.5 - 1 : value / 255;
    }
  }
  return new ort.Tensor("float32", data, [1, 3, input.height, input.width]);
}

function firstFloatOutput(outputs: Record<string, ort.OnnxValue>) {
  const output = outputs[Object.keys(outputs)[0] ?? ""];
  if (!(output instanceof ort.Tensor) || !(output.data instanceof Float32Array)) throw new Error("secure_face_model_output_invalid");
  return output.data;
}

async function verified(filePath: string, expectedHash: string) {
  const metadata = await stat(filePath).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 1024) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex").toLowerCase() === expectedHash.toLowerCase();
}
