/**
 * Specialty Inference Provider
 * 
 * Unified abstraction for specialty object detection models (PPE, industrial equipment,
 * fire/smoke, weapons, etc.). This separates perception (ML inference) from analytics
 * (business logic, rules, alerting).
 * 
 * Key Design Principles:
 * - Models are registered by capability (not embedded in analytics code)
 * - Preprocessing, inference, and postprocessing are encapsulated
 * - Health status is explicit (available/unavailable/degraded)
 * - Inference failures don't crash analytics
 * - Performance metrics are captured automatically
 */

import type { DetectionFrame, InferenceObject } from '../detectors/base-detector.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Inference capability identifier
 */
export type InferenceCapability =
  | 'person_detection'
  | 'vehicle_detection'
  | 'industrial_equipment_detection'
  | 'ppe_detection'
  | 'fire_smoke_detection'
  | 'plate_detection'
  | 'face_detection'
  | 'weapon_detection';

/**
 * Inference input
 */
export interface InferenceInput {
  image: Buffer;
  cameraId: string;
  tenantId: string;
  branchId?: string;
  width?: number;
  height?: number;
  timestamp: Date;
}

/**
 * Raw detection from model (before domain normalization)
 */
export interface RawDetection {
  classId: number;
  className: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, unknown>;
}

/**
 * Inference health status
 */
export interface InferenceHealth {
  available: boolean;
  model?: string;
  version?: string;
  backend?: string;
  latencyMs?: number;
  error?: string;
  lastInferenceAt?: Date;
  totalInferences?: number;
  failureRate?: number;
}

/**
 * Inference options
 */
export interface InferenceOptions {
  confidenceThreshold?: number;
  nmsThreshold?: number;
  maxDetections?: number;
  preprocessingHints?: Record<string, unknown>;
}

// ============================================================================
// Specialty Inference Provider Interface
// ============================================================================

/**
 * Base interface for all specialty inference providers
 */
export interface SpecialtyInferenceProvider {
  readonly capability: InferenceCapability;

  /**
   * Check if the provider is available and ready for inference
   */
  isAvailable(): Promise<boolean>;

  /**
   * Perform object detection on an input frame
   */
  detect(
    input: InferenceInput,
    options?: InferenceOptions
  ): Promise<RawDetection[]>;

  /**
   * Get current health status
   */
  health(): Promise<InferenceHealth>;

  /**
   * Warm up the model (run dummy inference)
   */
  warmup?(): Promise<void>;

  /**
   * Cleanup resources
   */
  cleanup?(): Promise<void>;
}

// ============================================================================
// Preprocessing Utilities
// ============================================================================

/**
 * Preprocessed image with metadata for correct bbox mapping
 */
export interface PreprocessedImage {
  tensor: Float32Array;
  originalWidth: number;
  originalHeight: number;
  inputWidth: number;
  inputHeight: number;
  scale: number;
  padX: number;
  padY: number;
}

/**
 * Letterbox resize (preserves aspect ratio with padding)
 */
export function letterboxResize(
  imageData: Buffer,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number
): PreprocessedImage {
  // Calculate scale to fit within target dimensions
  const scale = Math.min(
    targetWidth / originalWidth,
    targetHeight / originalHeight
  );

  const scaledWidth = Math.round(originalWidth * scale);
  const scaledHeight = Math.round(originalHeight * scale);

  // Calculate padding
  const padX = Math.floor((targetWidth - scaledWidth) / 2);
  const padY = Math.floor((targetHeight - scaledHeight) / 2);

  // In production: Use sharp or jimp for actual image processing
  // For now: Return metadata structure (actual processing deferred to ONNX preprocessing)
  const tensor = new Float32Array(3 * targetWidth * targetHeight);

  return {
    tensor,
    originalWidth,
    originalHeight,
    inputWidth: targetWidth,
    inputHeight: targetHeight,
    scale,
    padX,
    padY,
  };
}

/**
 * Restore bounding box from model output to original image coordinates
 */
export function restoreBoundingBox(
  bbox: { x: number; y: number; width: number; height: number },
  preprocessing: PreprocessedImage
): { x: number; y: number; width: number; height: number } {
  // Remove padding offset
  const x = (bbox.x - preprocessing.padX) / preprocessing.scale;
  const y = (bbox.y - preprocessing.padY) / preprocessing.scale;
  const width = bbox.width / preprocessing.scale;
  const height = bbox.height / preprocessing.scale;

  // Clamp to original image bounds
  return {
    x: Math.max(0, Math.min(preprocessing.originalWidth - width, x)),
    y: Math.max(0, Math.min(preprocessing.originalHeight - height, y)),
    width: Math.max(1, Math.min(preprocessing.originalWidth - x, width)),
    height: Math.max(1, Math.min(preprocessing.originalHeight - y, height)),
  };
}

// ============================================================================
// Non-Maximum Suppression (NMS)
// ============================================================================

/**
 * Calculate Intersection over Union (IoU)
 */
export function calculateIoU(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * Perform Non-Maximum Suppression per class
 */
export function nonMaximumSuppression(
  detections: RawDetection[],
  iouThreshold: number = 0.45
): RawDetection[] {
  if (detections.length === 0) return [];

  // Group detections by class
  const byClass = new Map<string, RawDetection[]>();
  for (const detection of detections) {
    if (!byClass.has(detection.className)) {
      byClass.set(detection.className, []);
    }
    byClass.get(detection.className)!.push(detection);
  }

  // Apply NMS per class
  const results: RawDetection[] = [];
  for (const [className, classDetections] of byClass.entries()) {
    // Sort by confidence (descending)
    classDetections.sort((a, b) => b.confidence - a.confidence);

    const keep: RawDetection[] = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < classDetections.length; i++) {
      if (suppressed.has(i)) continue;

      const detection = classDetections[i]!;
      keep.push(detection);

      // Suppress overlapping detections
      for (let j = i + 1; j < classDetections.length; j++) {
        if (suppressed.has(j)) continue;

        const other = classDetections[j]!;
        const iou = calculateIoU(detection.bbox, other.bbox);

        if (iou > iouThreshold) {
          suppressed.add(j);
        }
      }
    }

    results.push(...keep);
  }

  return results;
}

// ============================================================================
// Inference Error Handling
// ============================================================================

/**
 * Inference error class
 */
export class InferenceError extends Error {
  constructor(
    message: string,
    public readonly capability: InferenceCapability,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'InferenceError';
  }
}

/**
 * Capability unavailable error
 */
export class CapabilityUnavailableError extends InferenceError {
  constructor(
    capability: InferenceCapability,
    public readonly reason: string
  ) {
    super(
      `Capability '${capability}' is unavailable: ${reason}`,
      capability
    );
    this.name = 'CapabilityUnavailableError';
  }
}

// ============================================================================
// Performance Metrics
// ============================================================================

/**
 * Inference metrics collector
 */
export class InferenceMetrics {
  private totalInferences = 0;
  private totalFailures = 0;
  private latencies: number[] = [];
  private lastInferenceAt?: Date;

  recordInference(latencyMs: number, success: boolean): void {
    this.totalInferences++;
    this.lastInferenceAt = new Date();

    if (success) {
      this.latencies.push(latencyMs);
      // Keep only last 100 latencies
      if (this.latencies.length > 100) {
        this.latencies.shift();
      }
    } else {
      this.totalFailures++;
    }
  }

  getMetrics() {
    const avgLatency =
      this.latencies.length > 0
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
        : 0;

    const p95Latency =
      this.latencies.length > 0
        ? this.latencies.sort((a, b) => a - b)[
            Math.floor(this.latencies.length * 0.95)
          ] ?? 0
        : 0;

    const failureRate =
      this.totalInferences > 0
        ? this.totalFailures / this.totalInferences
        : 0;

    return {
      totalInferences: this.totalInferences,
      totalFailures: this.totalFailures,
      failureRate,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      lastInferenceAt: this.lastInferenceAt,
    };
  }

  reset(): void {
    this.totalInferences = 0;
    this.totalFailures = 0;
    this.latencies = [];
    this.lastInferenceAt = undefined;
  }
}

// ============================================================================
// Base Provider Implementation
// ============================================================================

/**
 * Base class for specialty inference providers with common functionality
 */
export abstract class BaseInferenceProvider implements SpecialtyInferenceProvider {
  protected metrics = new InferenceMetrics();
  protected isInitialized = false;

  constructor(public readonly capability: InferenceCapability) {}

  abstract isAvailable(): Promise<boolean>;
  abstract detect(
    input: InferenceInput,
    options?: InferenceOptions
  ): Promise<RawDetection[]>;

  async health(): Promise<InferenceHealth> {
    const available = await this.isAvailable();
    const metrics = this.metrics.getMetrics();

    return {
      available,
      lastInferenceAt: metrics.lastInferenceAt,
      totalInferences: metrics.totalInferences,
      failureRate: metrics.failureRate,
      latencyMs: metrics.avgLatencyMs,
    };
  }

  /**
   * Wrapper for detect() with automatic metrics collection
   */
  protected async detectWithMetrics(
    detectFn: () => Promise<RawDetection[]>
  ): Promise<RawDetection[]> {
    const startTime = Date.now();
    let success = false;

    try {
      const result = await detectFn();
      success = true;
      return result;
    } finally {
      const latency = Date.now() - startTime;
      this.metrics.recordInference(latency, success);
    }
  }

  async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.metrics.reset();
  }
}
