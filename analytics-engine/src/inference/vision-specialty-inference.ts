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
