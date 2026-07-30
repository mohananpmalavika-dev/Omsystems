import { Tensor, type InferenceSession, type OnnxValue } from "onnxruntime-node";
import type { DetectionFrame } from "../detectors/base-detector.js";
import { resizeRgb24ToChw } from "./yolo-detection-inference.js";

export interface TextRecognition {
  text: string;
  confidence: number;
  characters: Array<{ char: string; confidence: number }>;
}

/** Greedy CTC decoder for an ONNX plate-recognition model. */
export class CtcTextInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly alphabet: readonly string[],
    private readonly blankIndex = 0,
    private readonly inputWidth = 168,
    private readonly inputHeight = 48,
  ) {
    if (alphabet.length < 2) throw new Error("CTC alphabet must include a blank and at least one character");
  }

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }): Promise<TextRecognition> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("OCR model has no input tensor");
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value) => (value / 127.5) - 1,
    );
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("OCR model produced no output tensor");
    return this.decode(output);
  }

  private decode(output: OnnxValue): TextRecognition {
    const tensor = requireFloatTensor(output, "OCR");
    const dims = tensor.dims.map(Number);
    const layout = ctcLayout(dims, this.alphabet.length);
    const data = tensor.data as Float32Array;
    const characters: TextRecognition["characters"] = [];
    let previous = this.blankIndex;
    for (let step = 0; step < layout.steps; step += 1) {
      const scores = Array.from({ length: layout.classes }, (_, classIndex) => (
        data[layout.offset(step, classIndex)]!
      ));
      let bestIndex = 0;
      for (let index = 1; index < scores.length; index += 1) {
        if (scores[index]! > scores[bestIndex]!) bestIndex = index;
      }
      if (bestIndex !== this.blankIndex && bestIndex !== previous) {
        const char = this.alphabet[bestIndex];
        if (char) characters.push({ char, confidence: softmaxConfidence(scores, bestIndex) });
      }
      previous = bestIndex;
    }
    return {
      text: characters.map((item) => item.char).join(""),
      confidence: characters.length > 0
        ? characters.reduce((total, item) => total + item.confidence, 0) / characters.length
        : 0,
      characters,
    };
  }
}

/** Extracts an L2-normalized face embedding from an RGB face crop. */
export class FaceEmbeddingInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly inputWidth = 112,
    private readonly inputHeight = 112,
  ) {}

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }): Promise<number[]> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Face embedding model has no input tensor");
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value) => (value - 127.5) / 128,
    );
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("Face embedding model produced no output tensor");
    const tensor = requireFloatTensor(output, "Face embedding");
    const vector = Array.from(tensor.data as Float32Array);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) throw new Error("Face embedding model produced a zero vector");
    return vector.map((value) => value / norm);
  }
}

export function cropRgb24(
  frame: DetectionFrame,
  box: { x: number; y: number; width: number; height: number },
): DetectionFrame {
  const left = Math.max(0, Math.min(frame.width - 1, Math.floor(box.x * frame.width)));
  const top = Math.max(0, Math.min(frame.height - 1, Math.floor(box.y * frame.height)));
  const right = Math.max(left + 1, Math.min(frame.width, Math.ceil((box.x + box.width) * frame.width)));
  const bottom = Math.max(top + 1, Math.min(frame.height, Math.ceil((box.y + box.height) * frame.height)));
  const width = right - left;
  const height = bottom - top;
  const imageData = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = (((top + row) * frame.width) + left) * 3;
    frame.imageData.copy(imageData, row * width * 3, sourceStart, sourceStart + width * 3);
  }
  return { ...frame, imageData, width, height };
}

function requireFloatTensor(value: OnnxValue, name: string) {
  if (!(value instanceof Tensor) || !(value.data instanceof Float32Array)) {
    throw new Error(`${name} output must be a float32 tensor`);
  }
  return value;
}

function ctcLayout(dims: number[], alphabetSize: number) {
  if (dims.length === 3 && dims[0] === 1 && dims[2] === alphabetSize) {
    const steps = dims[1]!;
    return { steps, classes: alphabetSize, offset: (step: number, classIndex: number) => (step * alphabetSize) + classIndex };
  }
  if (dims.length === 3 && dims[1] === 1 && dims[2] === alphabetSize) {
    const steps = dims[0]!;
    return { steps, classes: alphabetSize, offset: (step: number, classIndex: number) => (step * alphabetSize) + classIndex };
  }
  if (dims.length === 2 && dims[1] === alphabetSize) {
    const steps = dims[0]!;
    return { steps, classes: alphabetSize, offset: (step: number, classIndex: number) => (step * alphabetSize) + classIndex };
  }
  throw new Error(`Unsupported CTC output shape: ${dims.join("x")}; expected alphabet size ${alphabetSize}`);
}

function softmaxConfidence(scores: number[], selected: number) {
  const maximum = Math.max(...scores);
  const exponentials = scores.map((score) => Math.exp(score - maximum));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);
  return denominator > 0 ? exponentials[selected]! / denominator : 0;
}
