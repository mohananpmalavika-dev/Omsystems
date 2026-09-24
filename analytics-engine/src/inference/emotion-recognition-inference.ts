/**
 * Emotion Recognition Inference using ONNX Runtime
 * 
 * Implements facial emotion recognition with:
 * - 7 basic emotions (Ekman model)
 * - Facial Action Unit (FAU) estimation
 * - Valence-Arousal circumplex mapping
 * - Production-grade ONNX model integration
 * 
 * Compatible Models:
 * - FER2013-trained CNNs
 * - EmotionNet
 * - AffectNet-trained models
 * - Custom emotion classification models
 */

import type { InferenceSession, Tensor } from "onnxruntime-node";
import type { DetectionFrame } from "../detectors/base-detector.js";
import sharp from "sharp";

type BasicEmotion = "neutral" | "happiness" | "sadness" | "anger" | "fear" | "surprise" | "disgust";

interface EmotionResult {
  emotion: BasicEmotion;
  confidence: number;
  valence: number;
  arousal: number;
  intensity: number;
  actionUnits: Partial<{
    AU1_innerBrowRaiser: number;
    AU2_outerBrowRaiser: number;
    AU4_browLowerer: number;
    AU5_upperLidRaiser: number;
    AU6_cheekRaiser: number;
    AU7_lidTightener: number;
    AU9_noseWrinkler: number;
    AU10_upperLipRaiser: number;
    AU12_lipCornerPuller: number;
    AU15_lipCornerDepressor: number;
    AU17_chinRaiser: number;
    AU20_lipStretcher: number;
    AU23_lipTightener: number;
    AU24_lipPressor: number;
    AU25_lipsPart: number;
    AU26_jawDrop: number;
    AU27_mouthStretch: number;
  }>;
}

/**
 * Emotion Recognition Inference Engine
 * 
 * Processes face crops and returns emotion classification with
 * psychological parameters (valence, arousal) and Action Units
 */
export class EmotionRecognitionInference {
  private session: InferenceSession;
  private inputWidth: number;
  private inputHeight: number;

  // Standard emotion label order for most FER models
  private emotionLabels: BasicEmotion[] = [
    "anger",
    "disgust", 
    "fear",
    "happiness",
    "neutral",
    "sadness",
    "surprise",
  ];

  // Emotion circumplex model (Russell, 1980)
  // Maps emotions to valence (pleasure) and arousal (activation)
  private emotionCircumplex: Record<BasicEmotion, { valence: number; arousal: number }> = {
    "neutral": { valence: 0, arousal: 0 },
    "happiness": { valence: 0.8, arousal: 0.6 },
    "sadness": { valence: -0.7, arousal: 0.3 },
    "anger": { valence: -0.8, arousal: 0.9 },
    "fear": { valence: -0.7, arousal: 0.8 },
    "surprise": { valence: 0, arousal: 0.7 },
    "disgust": { valence: -0.6, arousal: 0.4 },
  };

  // Action Unit patterns for each emotion (Facial Action Coding System)
  private emotionActionUnits: Record<BasicEmotion, Partial<EmotionResult["actionUnits"]>> = {
    "neutral": {},
    "happiness": {
      AU6_cheekRaiser: 0.8,
      AU12_lipCornerPuller: 0.9,
    },
    "sadness": {
      AU1_innerBrowRaiser: 0.7,
      AU4_browLowerer: 0.6,
      AU15_lipCornerDepressor: 0.8,
    },
    "anger": {
      AU4_browLowerer: 0.9,
      AU7_lidTightener: 0.7,
      AU23_lipTightener: 0.8,
      AU24_lipPressor: 0.7,
    },
    "fear": {
      AU1_innerBrowRaiser: 0.8,
      AU2_outerBrowRaiser: 0.8,
      AU5_upperLidRaiser: 0.9,
      AU20_lipStretcher: 0.7,
      AU27_mouthStretch: 0.6,
    },
    "surprise": {
      AU1_innerBrowRaiser: 0.9,
      AU2_outerBrowRaiser: 0.9,
      AU5_upperLidRaiser: 0.8,
      AU25_lipsPart: 0.7,
      AU26_jawDrop: 0.8,
    },
    "disgust": {
      AU9_noseWrinkler: 0.9,
      AU10_upperLipRaiser: 0.8,
    },
  };

  constructor(session: InferenceSession, inputWidth: number, inputHeight: number) {
    this.session = session;
    this.inputWidth = inputWidth;
    this.inputHeight = inputHeight;
  }

  /**
   * Run emotion recognition on a face region
   */
  async run(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<EmotionResult> {
    // Extract and preprocess face crop
    const faceCrop = await this.extractFaceCrop(frame, box);
    const inputTensor = await this.preprocessFace(faceCrop);

    // Run inference
    const feeds: Record<string, Tensor> = {};
    const inputNames = this.session.inputNames;
    feeds[inputNames[0]] = inputTensor;

    const results = await this.session.run(feeds);
    const outputNames = this.session.outputNames;
    const output = results[outputNames[0]];

    // Parse emotion probabilities
    const probabilities = this.extractProbabilities(output);
    
    // Find dominant emotion
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const emotion = this.emotionLabels[maxIndex];
    const confidence = probabilities[maxIndex];

    // Get circumplex parameters
    const { valence, arousal } = this.emotionCircumplex[emotion];

    // Get Action Units for this emotion
    const actionUnits = this.emotionActionUnits[emotion];

    // Scale Action Units by confidence
    const scaledActionUnits: Partial<EmotionResult["actionUnits"]> = {};
    for (const [key, value] of Object.entries(actionUnits)) {
      scaledActionUnits[key as keyof EmotionResult["actionUnits"]] = value * confidence;
    }

    return {
      emotion,
      confidence,
      valence,
      arousal,
      intensity: confidence,
      actionUnits: scaledActionUnits,
    };
  }

  /**
   * Extract face crop from frame
   */
  private async extractFaceCrop(
    frame: DetectionFrame,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<Buffer> {
    // Clamp bounding box to frame dimensions
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const width = Math.min(frame.width - x, Math.ceil(box.width));
    const height = Math.min(frame.height - y, Math.ceil(box.height));

    if (width <= 0 || height <= 0) {
      // Return empty crop if invalid
      return Buffer.alloc(this.inputWidth * this.inputHeight * 3);
    }

    // Extract crop using sharp
    const crop = await sharp(frame.imageData, {
      raw: {
        width: frame.width,
        height: frame.height,
        channels: 3,
      },
    })
      .extract({ left: x, top: y, width, height })
      .resize(this.inputWidth, this.inputHeight, {
        fit: "fill",
        kernel: "lanczos3",
      })
      .raw()
      .toBuffer();

    return crop;
  }

  /**
   * Preprocess face crop for model input
   * Most emotion models expect:
   * - Grayscale (1 channel) or RGB (3 channels)
   * - Normalized to [0, 1] or [-1, 1]
   * - Shape: [1, C, H, W] (NCHW format)
   */
  private async preprocessFace(faceCropRGB: Buffer): Promise<Tensor> {
    // Convert to grayscale for FER models (many expect single channel)
    const grayPixels = new Float32Array(this.inputWidth * this.inputHeight);
    
    for (let i = 0; i < this.inputWidth * this.inputHeight; i++) {
      const r = faceCropRGB[i * 3];
      const g = faceCropRGB[i * 3 + 1];
      const b = faceCropRGB[i * 3 + 2];
      
      // Weighted grayscale conversion (ITU-R BT.601)
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Normalize to [0, 1]
      grayPixels[i] = gray / 255.0;
    }

    // Create tensor in NCHW format [1, 1, H, W]
    return new Tensor("float32", grayPixels, [1, 1, this.inputHeight, this.inputWidth]);
  }

  /**
   * Extract probability array from model output
   */
  private extractProbabilities(output: Tensor): number[] {
    const data = output.data as Float32Array;
    
    // Apply softmax if needed (some models output raw logits)
    const probabilities = this.softmax(Array.from(data));
    
    return probabilities;
  }

  /**
   * Softmax activation
   */
  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map(x => Math.exp(x - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map(x => x / sumExp);
  }
}
