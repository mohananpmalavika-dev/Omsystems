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
    private readonly inputWidth = 100,
    private readonly inputHeight = 32,
    private readonly inputChannels = 1,
  ) {
    if (alphabet.length < 2) throw new Error("CTC alphabet must include a blank and at least one character");
    if (inputChannels !== 1 && inputChannels !== 3) throw new Error("CTC input must have one or three channels");
  }

  async run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
    corners?: Array<{ x: number; y: number }>,
  ): Promise<TextRecognition> {
    const crop = corners && isQuadrilateral(corners)
      ? rectifyRgb24(frame, corners, this.inputWidth, this.inputHeight)
      : cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("OCR model has no input tensor");
    const chw = this.inputChannels === 1
      ? resizeRgb24ToGrayChw(crop.imageData, crop.width, crop.height, this.inputWidth, this.inputHeight)
      : resizeRgb24ToChw(
        crop.imageData,
        crop.width,
        crop.height,
        this.inputWidth,
        this.inputHeight,
        (value) => (value / 127.5) - 1,
      );
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, this.inputChannels, this.inputHeight, this.inputWidth]),
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

  async run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
    landmarks?: Array<{ x: number; y: number }>,
  ): Promise<number[]> {
    const crop = landmarks && isFaceLandmarkSet(landmarks)
      ? alignFaceRgb24(frame, landmarks, this.inputWidth, this.inputHeight)
      : cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Face embedding model has no input tensor");
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value) => value,
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

export interface HelmetClassification {
  wearingHelmet: boolean;
  confidence: number;
  wearingHelmetConfidence: number;
  unwearingHelmetConfidence: number;
}

/**
 * Runs PaddleClas PULC's two-class safety-helmet model on a rider's upper
 * body/head crop. The official class order is wearing_helmet, then
 * unwearing_helmet; outputs may be logits or already-normalized scores.
 */
export class HelmetClassificationInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly inputWidth = 224,
    private readonly inputHeight = 224,
  ) {}

  async run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<HelmetClassification> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Safety-helmet model has no input tensor");
    const mean = [0.485, 0.456, 0.406];
    const standardDeviation = [0.229, 0.224, 0.225];
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value, channel) => ((value / 255) - mean[channel]!) / standardDeviation[channel]!,
    );
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("Safety-helmet model produced no output tensor");
    const tensor = requireFloatTensor(output, "Safety-helmet classification");
    const scores = Array.from(tensor.data as Float32Array);
    if (scores.length !== 2) {
      throw new Error(`Safety-helmet model must produce two class scores; received ${scores.length}`);
    }
    const [wearingHelmetConfidence, unwearingHelmetConfidence] = classifierProbabilities(scores);
    const wearingHelmet = wearingHelmetConfidence >= unwearingHelmetConfidence;
    return {
      wearingHelmet,
      confidence: wearingHelmet ? wearingHelmetConfidence : unwearingHelmetConfidence,
      wearingHelmetConfidence,
      unwearingHelmetConfidence,
    };
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

/** OpenCV CRNN expects a grayscale 100x32 plate tensor normalized to [-1, 1]. */
function resizeRgb24ToGrayChw(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Float32Array {
  const output = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      const offset = ((sourceY * sourceWidth) + sourceX) * 3;
      const gray = (0.299 * source[offset]!) + (0.587 * source[offset + 1]!) + (0.114 * source[offset + 2]!);
      output[(y * targetWidth) + x] = (gray / 127.5) - 1;
    }
  }
  return output;
}

function isFaceLandmarkSet(value: Array<{ x: number; y: number }>): boolean {
  return value.length === 5 && value.every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  ));
}

/** Reproduces OpenCV FaceRecognizerSF's five-point similarity alignment. */
function alignFaceRgb24(
  frame: DetectionFrame,
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): DetectionFrame {
  const source = landmarks.map((point) => ({ x: point.x * frame.width, y: point.y * frame.height }));
  const scaleX = width / 112;
  const scaleY = height / 112;
  const target = [
    { x: 38.2946 * scaleX, y: 51.6963 * scaleY },
    { x: 73.5318 * scaleX, y: 51.5014 * scaleY },
    { x: 56.0252 * scaleX, y: 71.7366 * scaleY },
    { x: 41.5493 * scaleX, y: 92.3655 * scaleY },
    { x: 70.7299 * scaleX, y: 92.2041 * scaleY },
  ];
  const transform = solveSimilarityTransform(source, target);
  if (!transform) return cropRgb24(frame, boundsOfCorners(landmarks));
  const imageData = Buffer.alloc(width * height * 3);
  const determinant = (transform.a * transform.a) + (transform.b * transform.b);
  if (determinant < 1e-8) return cropRgb24(frame, boundsOfCorners(landmarks));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const adjustedX = x - transform.tx;
      const adjustedY = y - transform.ty;
      const sourceX = ((transform.a * adjustedX) + (transform.b * adjustedY)) / determinant;
      const sourceY = ((-transform.b * adjustedX) + (transform.a * adjustedY)) / determinant;
      sampleRgb24(frame, sourceX, sourceY, imageData, ((y * width) + x) * 3);
    }
  }
  return { ...frame, imageData, width, height };
}

function solveSimilarityTransform(
  source: Array<{ x: number; y: number }>,
  target: Array<{ x: number; y: number }>,
): { a: number; b: number; tx: number; ty: number } | null {
  const normal = Array.from({ length: 4 }, () => Array(5).fill(0) as number[]);
  const addEquation = (coefficients: number[], result: number) => {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) normal[row]![column] += coefficients[row]! * coefficients[column]!;
      normal[row]![4] += coefficients[row]! * result;
    }
  };
  for (let index = 0; index < source.length; index += 1) {
    const point = source[index]!;
    const destination = target[index]!;
    addEquation([point.x, -point.y, 1, 0], destination.x);
    addEquation([point.y, point.x, 0, 1], destination.y);
  }
  const solved = solveLinearSystem(normal);
  return solved ? { a: solved[0]!, b: solved[1]!, tx: solved[2]!, ty: solved[3]! } : null;
}

function isQuadrilateral(value: Array<{ x: number; y: number }>): boolean {
  return value.length === 4 && value.every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  ));
}

/**
 * Rectifies the four corners emitted by LPD-YuNet into the CRNN's canonical
 * rectangle. Corner order matches the official OpenCV Zoo adapter:
 * bottom-left, top-left, top-right, bottom-right.
 */
function rectifyRgb24(
  frame: DetectionFrame,
  corners: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): DetectionFrame {
  const source = corners.map((point) => ({ x: point.x * frame.width, y: point.y * frame.height }));
  const target = [
    { x: 0, y: height - 1 }, { x: 0, y: 0 },
    { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 },
  ];
  const homography = solveHomography(target, source);
  if (!homography) return cropRgb24(frame, boundsOfCorners(corners));
  const imageData = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = (homography[6]! * x) + (homography[7]! * y) + 1;
      if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) continue;
      const sourceX = ((homography[0]! * x) + (homography[1]! * y) + homography[2]!) / denominator;
      const sourceY = ((homography[3]! * x) + (homography[4]! * y) + homography[5]!) / denominator;
      sampleRgb24(frame, sourceX, sourceY, imageData, ((y * width) + x) * 3);
    }
  }
  return { ...frame, imageData, width, height };
}

function boundsOfCorners(corners: Array<{ x: number; y: number }>) {
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { x: minX, y: minY, width: Math.max(0.0001, maxX - minX), height: Math.max(0.0001, maxY - minY) };
}

function solveHomography(
  from: Array<{ x: number; y: number }>,
  to: Array<{ x: number; y: number }>,
): number[] | null {
  const matrix: number[][] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x: u, y: v } = from[index]!;
    const { x, y } = to[index]!;
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(matrix[row]![column]!) > Math.abs(matrix[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(matrix[pivot]![column]!) < 1e-8) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot]!, matrix[column]!];
    const divisor = matrix[column]![column]!;
    for (let cell = column; cell <= 8; cell += 1) matrix[column]![cell] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = matrix[row]![column]!;
      for (let cell = column; cell <= 8; cell += 1) matrix[row]![cell] -= factor * matrix[column]![cell]!;
    }
  }
  return matrix.map((row) => row[8]!).concat(1);
}

function solveLinearSystem(matrix: number[][]): number[] | null {
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row]![column]!) > Math.abs(matrix[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(matrix[pivot]![column]!) < 1e-8) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot]!, matrix[column]!];
    const divisor = matrix[column]![column]!;
    for (let cell = column; cell <= size; cell += 1) matrix[column]![cell] = matrix[column]![cell]! / divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row]![column]!;
      for (let cell = column; cell <= size; cell += 1) matrix[row]![cell] = matrix[row]![cell]! - (factor * matrix[column]![cell]!);
    }
  }
  return matrix.map((row) => row[size]!);
}

function sampleRgb24(frame: DetectionFrame, x: number, y: number, target: Buffer, targetOffset: number) {
  if (x < 0 || y < 0 || x > frame.width - 1 || y > frame.height - 1) return;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const wx = x - x0;
  const wy = y - y0;
  for (let channel = 0; channel < 3; channel += 1) {
    const pixel = (px: number, py: number) => frame.imageData[((py * frame.width + px) * 3) + channel]!;
    const top = (pixel(x0, y0) * (1 - wx)) + (pixel(x1, y0) * wx);
    const bottom = (pixel(x0, y1) * (1 - wx)) + (pixel(x1, y1) * wx);
    target[targetOffset + channel] = Math.round((top * (1 - wy)) + (bottom * wy));
  }
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

function classifierProbabilities(scores: number[]): [number, number] {
  const total = scores.reduce((sum, score) => sum + score, 0);
  if (scores.every((score) => score >= 0 && score <= 1) && Math.abs(total - 1) < 0.001) {
    return [scores[0]!, scores[1]!];
  }
  const maximum = Math.max(...scores);
  const exponentials = scores.map((score) => Math.exp(score - maximum));
  const denominator = exponentials[0]! + exponentials[1]!;
  return [exponentials[0]! / denominator, exponentials[1]! / denominator];
}

/**
 * Person Re-Identification Inference (OSNet)
 * 
 * OSNet models expect 256x128 input (portrait aspect ratio for full-body person crops).
 * Produces L2-normalized embeddings for cross-camera person tracking.
 * 
 * Preprocessing differs from face embeddings:
 * - Input dimensions: 256x128 (not 112x112)
 * - Normalization: ImageNet-style (mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
 */
export class PersonReIdInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly inputWidth = 128,  // OSNet standard: 128
    private readonly inputHeight = 256, // OSNet standard: 256
  ) {}

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }): Promise<number[]> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Person Re-ID model has no input tensor");
    
    // ImageNet normalization for OSNet
    const imagenetMean = [0.485, 0.456, 0.406];
    const imagenetStd = [0.229, 0.224, 0.225];
    
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value, channel) => {
        const normalized = value / 255.0;
        return (normalized - imagenetMean[channel]!) / imagenetStd[channel]!;
      },
    );
    
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("Person Re-ID model produced no output tensor");
    
    const tensor = requireFloatTensor(output, "Person Re-ID");
    const vector = Array.from(tensor.data as Float32Array);
    
    // L2 normalization
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error("Person Re-ID model produced a zero vector");
    }
    
    return vector.map((value) => value / norm);
  }
}

/**
 * Vehicle Re-Identification Inference
 * 
 * Vehicle Re-ID models typically expect different preprocessing than person models.
 * Produces L2-normalized embeddings for cross-camera vehicle tracking.
 */
export class VehicleReIdInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly inputWidth = 256,
    private readonly inputHeight = 256,
  ) {}

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }): Promise<number[]> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Vehicle Re-ID model has no input tensor");
    
    // ImageNet normalization
    const imagenetMean = [0.485, 0.456, 0.406];
    const imagenetStd = [0.229, 0.224, 0.225];
    
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value, channel) => {
        const normalized = value / 255.0;
        return (normalized - imagenetMean[channel]!) / imagenetStd[channel]!;
      },
    );
    
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("Vehicle Re-ID model produced no output tensor");
    
    const tensor = requireFloatTensor(output, "Vehicle Re-ID");
    const vector = Array.from(tensor.data as Float32Array);
    
    // L2 normalization
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error("Vehicle Re-ID model produced a zero vector");
    }
    
    return vector.map((value) => value / norm);
  }
}

/**
 * YOLOv8 Pose Estimation Inference
 * 
 * YOLOv8-Pose outputs person bounding boxes + 17 keypoints (COCO format).
 * This is NOT standard object detection - it requires specialized decoding.
 */
export interface PoseKeypoint {
  x: number;
  y: number;
  confidence: number;
}

export interface PoseDetection {
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  keypoints: PoseKeypoint[];
}

export class YoloPoseInference {
  private readonly keypointNames = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
  ];

  constructor(
    private readonly session: InferenceSession,
    private readonly confidenceThreshold = 0.5,
    private readonly inputWidth = 640,
    private readonly inputHeight = 640,
  ) {}

  async run(frame: DetectionFrame): Promise<PoseDetection[]> {
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Pose model has no input tensor");
    
    const chw = resizeRgb24ToChw(
      frame.imageData,
      frame.width,
      frame.height,
      this.inputWidth,
      this.inputHeight,
      (value) => value / 255.0,
    );
    
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    
    const outputName = this.session.outputNames[0];
    const output = outputName ? outputs[outputName] : Object.values(outputs)[0];
    if (!output) throw new Error("Pose model produced no output tensor");
    
    const tensor = requireFloatTensor(output, "Pose");
    return this.decodePoseOutput(tensor, frame.width, frame.height);
  }

  private decodePoseOutput(tensor: Tensor, frameWidth: number, frameHeight: number): PoseDetection[] {
    const data = tensor.data as Float32Array;
    const dims = tensor.dims.map(Number);
    
    // YOLOv8-Pose output: [1, 56, 8400] or [1, 8400, 56]
    // 56 = 4 bbox + 1 confidence + 51 keypoint values (17 keypoints × 3)
    const detections: PoseDetection[] = [];
    
    let numDetections: number;
    let stride: number;
    
    if (dims[1] === 56 || dims[1] === 51 + 5) {
      // Format: [1, attributes, detections]
      numDetections = dims[2]!;
      stride = dims[1]!;
      
      for (let i = 0; i < numDetections; i++) {
        const confidence = data[4 * numDetections + i]!;
        if (confidence < this.confidenceThreshold) continue;
        
        const cx = data[0 * numDetections + i]! / this.inputWidth;
        const cy = data[1 * numDetections + i]! / this.inputHeight;
        const w = data[2 * numDetections + i]! / this.inputWidth;
        const h = data[3 * numDetections + i]! / this.inputHeight;
        
        const keypoints: PoseKeypoint[] = [];
        for (let k = 0; k < 17; k++) {
          const kpX = data[(5 + k * 3) * numDetections + i]! / this.inputWidth;
          const kpY = data[(5 + k * 3 + 1) * numDetections + i]! / this.inputHeight;
          const kpConf = data[(5 + k * 3 + 2) * numDetections + i]!;
          
          keypoints.push({ x: kpX, y: kpY, confidence: kpConf });
        }
        
        detections.push({
          boundingBox: {
            x: cx - w / 2,
            y: cy - h / 2,
            width: w,
            height: h
          },
          confidence,
          keypoints
        });
      }
    }
    
    return detections;
  }
}

/**
 * Person Attribute Estimation Inference
 * 
 * Estimates age, gender, emotion from person crops.
 * Outputs classification logits, not bounding boxes.
 */
export interface PersonAttributes {
  age?: number;
  ageConfidence?: number;
  gender?: 'male' | 'female';
  genderConfidence?: number;
  emotion?: 'angry' | 'disgust' | 'fear' | 'happy' | 'sad' | 'surprise' | 'neutral';
  emotionConfidence?: number;
}

export class PersonAttributeInference {
  constructor(
    private readonly session: InferenceSession,
    private readonly inputWidth = 224,
    private readonly inputHeight = 224,
  ) {}

  async run(frame: DetectionFrame, box: { x: number; y: number; width: number; height: number }): Promise<PersonAttributes> {
    const crop = cropRgb24(frame, box);
    const inputName = this.session.inputNames[0];
    if (!inputName) throw new Error("Attribute model has no input tensor");
    
    // ImageNet normalization
    const imagenetMean = [0.485, 0.456, 0.406];
    const imagenetStd = [0.229, 0.224, 0.225];
    
    const chw = resizeRgb24ToChw(
      crop.imageData,
      crop.width,
      crop.height,
      this.inputWidth,
      this.inputHeight,
      (value, channel) => {
        const normalized = value / 255.0;
        return (normalized - imagenetMean[channel]!) / imagenetStd[channel]!;
      },
    );
    
    const outputs = await this.session.run({
      [inputName]: new Tensor("float32", chw, [1, 3, this.inputHeight, this.inputWidth]),
    });
    
    // Parse multi-head outputs
    const attributes: PersonAttributes = {};
    
    // Age output (regression or classification)
    if (outputs['age']) {
      const ageTensor = requireFloatTensor(outputs['age'], "Age");
      const ageData = ageTensor.data as Float32Array;
      attributes.age = Math.max(0, Math.min(100, Math.round(ageData[0] || 0)));
      attributes.ageConfidence = 1.0; // For regression models
    }
    
    // Gender output (binary classification)
    if (outputs['gender']) {
      const genderTensor = requireFloatTensor(outputs['gender'], "Gender");
      const genderData = genderTensor.data as Float32Array;
      const femaleScore = genderData[0] || 0;
      const maleScore = genderData[1] || 0;
      const total = Math.exp(femaleScore) + Math.exp(maleScore);
      const maleProb = Math.exp(maleScore) / total;
      
      attributes.gender = maleProb > 0.5 ? 'male' : 'female';
      attributes.genderConfidence = Math.max(maleProb, 1 - maleProb);
    }
    
    // Emotion output (7-class classification)
    if (outputs['emotion']) {
      const emotionTensor = requireFloatTensor(outputs['emotion'], "Emotion");
      const emotionData = emotionTensor.data as Float32Array;
      const emotions: Array<'angry' | 'disgust' | 'fear' | 'happy' | 'sad' | 'surprise' | 'neutral'> = 
        ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'];
      
      let maxIdx = 0;
      let maxScore = emotionData[0] || -Infinity;
      for (let i = 1; i < emotionData.length; i++) {
        if ((emotionData[i] || -Infinity) > maxScore) {
          maxScore = emotionData[i]!;
          maxIdx = i;
        }
      }
      
      // Softmax for confidence
      const expScores = Array.from(emotionData).map(s => Math.exp(s));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      
      attributes.emotion = emotions[maxIdx];
      attributes.emotionConfidence = expScores[maxIdx]! / sumExp;
    }
    
    return attributes;
  }
}
