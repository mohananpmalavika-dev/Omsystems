/**
 * ONNX Object Detector
 * 
 * ONNX Runtime-based object detection provider for specialty models.
 * Supports YOLOv8, YOLOv5, and other object detection architectures.
 * 
 * Features:
 * - Automatic preprocessing (letterbox, normalization)
 * - NMS postprocessing
 * - GPU acceleration support (CUDA, TensorRT)
 * - Model warmup
 * - Performance metrics
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  BaseInferenceProvider,
  type InferenceInput,
  type InferenceOptions,
  type RawDetection,
  type InferenceHealth,
  letterboxResize,
  restoreBoundingBox,
  nonMaximumSuppression,
  CapabilityUnavailableError,
} from '../specialty-inference-provider.js';
import type { ModelManifest } from '../model-manifest.js';

// ============================================================================
// ONNX Object Detector
// ============================================================================

export class OnnxObjectDetector extends BaseInferenceProvider {
  private session?: ort.InferenceSession;
  private manifest: ModelManifest;

  constructor(manifest: ModelManifest) {
    super(manifest.capability);
    this.manifest = manifest;
  }

  /**
   * Initialize the ONNX session
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if model file exists
      const fs = await import('fs');
      const path = await import('path');

      let modelPath = this.manifest.modelPath;

      // Check environment variable override
      if (this.manifest.modelPathEnvironment) {
        const envPath = process.env[this.manifest.modelPathEnvironment];
        if (envPath && envPath.trim()) {
          modelPath = envPath.trim();
        }
      }

      // Resolve relative paths
      if (!path.isAbsolute(modelPath)) {
        const modelsDir = process.env.MODELS_DIR || '/models';
        modelPath = path.join(modelsDir, modelPath);
      }

      // Check if file exists
      if (!fs.existsSync(modelPath)) {
        throw new CapabilityUnavailableError(
          this.capability,
          `Model file not found: ${modelPath}`
        );
      }

      // Create ONNX Runtime session
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: this.getExecutionProviders(),
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true,
        enableMemPattern: true,
      };

      console.log(
        `Loading ONNX model for ${this.capability} from ${modelPath}...`
      );

      this.session = await ort.InferenceSession.create(
        modelPath,
        sessionOptions
      );

      console.log(
        `ONNX model loaded successfully for ${this.capability}`
      );

      this.isInitialized = true;

      // Warm up the model
      await this.warmup();
    } catch (error) {
      console.error(
        `Failed to initialize ONNX detector for ${this.capability}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get execution providers (GPU if available, otherwise CPU)
   */
  private getExecutionProviders(): ort.InferenceSession.ExecutionProviderConfig[] {
    const providers: ort.InferenceSession.ExecutionProviderConfig[] = [];

    // Try CUDA first (NVIDIA GPU)
    if (process.env.USE_CUDA === 'true') {
      providers.push('cuda');
      console.log(`Using CUDA execution provider for ${this.capability}`);
    }

    // Fallback to CPU
    providers.push('cpu');

    return providers;
  }

  /**
   * Check if detector is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error(
          `Detector initialization failed for ${this.capability}:`,
          error
        );
        return false;
      }
    }

    return this.session !== undefined;
  }

  /**
   * Perform object detection
   */
  async detect(
    input: InferenceInput,
    options?: InferenceOptions
  ): Promise<RawDetection[]> {
    if (!this.session) {
      await this.initialize();
    }

    if (!this.session) {
      throw new CapabilityUnavailableError(
        this.capability,
        'ONNX session not initialized'
      );
    }

    return this.detectWithMetrics(async () => {
      // Preprocess image
      const preprocessed = await this.preprocessImage(
        input.image,
        input.width,
        input.height
      );

      // Run inference
      const rawOutput = await this.runInference(preprocessed.tensor);

      // Decode YOLO output
      const detections = this.decodeYoloOutput(
        rawOutput,
        preprocessed,
        options?.confidenceThreshold ?? this.manifest.confidenceThreshold
      );

      // Apply NMS
      const nmsDetections = nonMaximumSuppression(
        detections,
        options?.nmsThreshold ?? this.manifest.nmsThreshold
      );

      // Limit detections if requested
      if (options?.maxDetections && nmsDetections.length > options.maxDetections) {
        return nmsDetections
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, options.maxDetections);
      }

      return nmsDetections;
    });
  }

  /**
   * Preprocess image for YOLO input
   */
  private async preprocessImage(
    imageBuffer: Buffer,
    originalWidth?: number,
    originalHeight?: number
  ): Promise<{
    tensor: Float32Array;
    originalWidth: number;
    originalHeight: number;
    scale: number;
    padX: number;
    padY: number;
  }> {
    const targetWidth = this.manifest.input.width;
    const targetHeight = this.manifest.input.height;

    // Use sharp for image processing
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const width = originalWidth || metadata.width || targetWidth;
    const height = originalHeight || metadata.height || targetHeight;

    // Calculate letterbox parameters
    const scale = Math.min(targetWidth / width, targetHeight / height);
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);
    const padX = Math.floor((targetWidth - scaledWidth) / 2);
    const padY = Math.floor((targetHeight - scaledHeight) / 2);

    // Resize with letterbox (preserve aspect ratio)
    const resized = await image
      .resize(scaledWidth, scaledHeight, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .extend({
        top: padY,
        bottom: targetHeight - scaledHeight - padY,
        left: padX,
        right: targetWidth - scaledWidth - padX,
        background: { r: 114, g: 114, b: 114 }, // Gray padding
      })
      .raw()
      .toBuffer();

    // Convert to NCHW format and normalize to [0, 1]
    const tensor = new Float32Array(3 * targetWidth * targetHeight);
    const pixelCount = targetWidth * targetHeight;

    for (let i = 0; i < pixelCount; i++) {
      const r = resized[i * 3] ?? 0;
      const g = resized[i * 3 + 1] ?? 0;
      const b = resized[i * 3 + 2] ?? 0;

      // NCHW format: [R channel, G channel, B channel]
      tensor[i] = r / 255.0;
      tensor[pixelCount + i] = g / 255.0;
      tensor[pixelCount * 2 + i] = b / 255.0;
    }

    return {
      tensor,
      originalWidth: width,
      originalHeight: height,
      scale,
      padX,
      padY,
    };
  }

  /**
   * Run ONNX inference
   */
  private async runInference(tensor: Float32Array): Promise<Float32Array> {
    if (!this.session) {
      throw new Error('ONNX session not initialized');
    }

    const inputName = this.session.inputNames[0];
    if (!inputName) {
      throw new Error('No input name found in ONNX model');
    }

    const inputTensor = new ort.Tensor('float32', tensor, [
      1,
      3,
      this.manifest.input.height,
      this.manifest.input.width,
    ]);

    const feeds: Record<string, ort.Tensor> = {
      [inputName]: inputTensor,
    };

    const results = await this.session.run(feeds);

    const outputName = this.session.outputNames[0];
    if (!outputName) {
      throw new Error('No output name found in ONNX model');
    }

    const output = results[outputName];
    if (!output) {
      throw new Error('No output tensor found');
    }

    return output.data as Float32Array;
  }

  /**
   * Decode YOLO output format
   * 
   * YOLOv8 output format: [batch, num_boxes, 4 + num_classes]
   * Where each detection is: [x, y, w, h, class_scores...]
   */
  private decodeYoloOutput(
    output: Float32Array,
    preprocessing: {
      originalWidth: number;
      originalHeight: number;
      scale: number;
      padX: number;
      padY: number;
    },
    confidenceThreshold: number
  ): RawDetection[] {
    const detections: RawDetection[] = [];
    const numClasses = Object.keys(this.manifest.labels).length;

    // YOLOv8 output shape: [1, 4 + num_classes, num_boxes]
    // We need to transpose to [num_boxes, 4 + num_classes]
    const numBoxes = Math.floor(output.length / (4 + numClasses));

    for (let i = 0; i < numBoxes; i++) {
      // Extract box coordinates (center format)
      const cx = output[i] ?? 0;
      const cy = output[numBoxes + i] ?? 0;
      const w = output[numBoxes * 2 + i] ?? 0;
      const h = output[numBoxes * 3 + i] ?? 0;

      // Extract class scores
      let maxScore = 0;
      let maxClassId = 0;

      for (let c = 0; c < numClasses; c++) {
        const score = output[numBoxes * (4 + c) + i] ?? 0;
        if (score > maxScore) {
          maxScore = score;
          maxClassId = c;
        }
      }

      // Filter by confidence threshold
      if (maxScore < confidenceThreshold) {
        continue;
      }

      // Convert center format to corner format
      const x = cx - w / 2;
      const y = cy - h / 2;

      // Restore original coordinates
      const restored = restoreBoundingBox(
        { x, y, width: w, height: h },
        preprocessing
      );

      const className = this.manifest.labels[maxClassId] || 'unknown';

      detections.push({
        classId: maxClassId,
        className,
        confidence: maxScore,
        bbox: restored,
      });
    }

    return detections;
  }

  /**
   * Warm up the model with dummy inference
   */
  async warmup(): Promise<void> {
    if (!this.session) {
      return;
    }

    console.log(`Warming up ONNX model for ${this.capability}...`);

    try {
      // Create dummy input
      const dummyInput = Buffer.alloc(
        this.manifest.input.width * this.manifest.input.height * 3
      );

      await this.detect({
        image: dummyInput,
        cameraId: 'warmup',
        tenantId: 'warmup',
        timestamp: new Date(),
      });

      console.log(`Warmup complete for ${this.capability}`);
    } catch (error) {
      console.warn(`Warmup failed for ${this.capability}:`, error);
    }
  }

  /**
   * Get health status
   */
  async health(): Promise<InferenceHealth> {
    const baseHealth = await super.health();

    return {
      ...baseHealth,
      model: this.manifest.id,
      version: this.manifest.version,
      backend: this.session ? 'onnxruntime' : undefined,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await super.cleanup();

    if (this.session) {
      // ONNX Runtime doesn't require explicit cleanup
      this.session = undefined;
    }
  }
}
