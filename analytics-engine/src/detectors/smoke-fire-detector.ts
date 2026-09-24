/**
 * Smoke and Fire Detection
 * Early warning system for fire hazards
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, calculateIoU, getInferenceObjects, hasInferenceObjects, shouldRunLocalSpecialtyInference } from "./base-detector.js";
import { assertResponsiveObjectInference, loadObjectInference, modelUnavailableReason, type ObjectFrameInference } from "../inference/configured-model-inference.js";

export type HazardType = "smoke" | "fire" | "both";
export type SeverityLevel = "low" | "medium" | "high" | "critical";

export interface FireHazard {
  type: HazardType;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  severity: SeverityLevel;
  area: number; // Percentage of frame
  color?: {
    dominant: string; // 'gray', 'white', 'orange', 'red'
    intensity: number;
  };
}

export class SmokeFireDetector extends BaseDetector {
  private isModelLoaded = false;
  private inference: ObjectFrameInference | null;
  private modelLoadError: string | null = null;
  private detectionHistory = new Map<string, Array<{ timestamp: Date; hazards: FireHazard[] }>>();
  
  private readonly MIN_CONFIDENCE: number;
  private readonly CONFIRMATION_FRAMES: number;
  private readonly VALIDATE_MODEL_RESPONSIVENESS: boolean;
  private readonly HISTORY_SIZE = 10;
  private readonly CONFIRMATION_WINDOW_MS = 10_000;
  private readonly AREA_THRESHOLD_LOW = 0.05; // 5% of frame
  private readonly AREA_THRESHOLD_HIGH = 0.20; // 20% of frame

  constructor(
    inference: ObjectFrameInference | null = null,
    confidenceThreshold = 0.8,
    confirmationFrames = 3,
    validateModelResponsiveness = false,
  ) {
    super("fire-smoke", "1.0.0");
    this.inference = inference;
    this.MIN_CONFIDENCE = confidenceThreshold;
    this.CONFIRMATION_FRAMES = Math.max(1, Math.floor(confirmationFrames));
    this.VALIDATE_MODEL_RESPONSIVENESS = validateModelResponsiveness;
  }

  async initialize(): Promise<void> {
    console.log("Initializing smoke and fire detector...");
    
    try {
      this.inference ??= await loadObjectInference("fire-smoke", this.MIN_CONFIDENCE);
      if (this.VALIDATE_MODEL_RESPONSIVENESS) {
        await assertResponsiveObjectInference(this.inference, "Fire/smoke model");
      }
      this.isModelLoaded = true;
      this.modelLoadError = null;
      console.log("Smoke and fire detector loaded local ONNX model");
    } catch (error) {
      this.inference = null;
      this.isModelLoaded = false;
      this.modelLoadError = error instanceof Error ? error.message : modelUnavailableReason("fire-smoke");
      console.warn(`Smoke and fire detector running in normalized-observation mode: ${this.modelLoadError}`);
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const hazards = await this.detectHazardsInFrame(frame);
    const streamKey = `${frame.tenantId}:${frame.cameraId}`;
    const history = this.detectionHistory.get(streamKey) ?? [];

    // History must be isolated per camera. Sharing it allowed observations
    // from one camera to confirm a detection on another camera.
    history.push({
      timestamp: frame.timestamp,
      hazards,
    });

    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
    this.detectionHistory.set(streamKey, history);

    // Do not raise a life-safety alert from one noisy frame. Require the same
    // hazard in the same area for several consecutive frames.
    const confirmedHazards = hazards.filter((hazard) => this.isTemporallyConfirmed(hazard, history, frame.timestamp));

    const results: DetectionResult[] = [];

    // Process fire detections
    const fires = confirmedHazards.filter(h => h.type === "fire" || h.type === "both");
    if (fires.length > 0) {
      const maxSeverity = this.getMaxSeverity(fires);
      
      results.push({
        detectionType: "fire",
        confidence: this.calculateAverageConfidence(fires),
        objects: fires.map(fire => ({
          label: "fire",
          confidence: fire.confidence,
          boundingBox: fire.boundingBox,
        })),
        metadata: {
          severity: maxSeverity,
          affectedArea: this.calculateTotalArea(fires),
          spreading: this.isSpreadingFast(history),
          colorIndicators: fires.map(f => f.color).filter(Boolean),
        },
        requiresAlert: true,
      });
    }

    // Process smoke detections
    const smokes = confirmedHazards.filter(h => h.type === "smoke" || h.type === "both");
    if (smokes.length > 0) {
      const maxSeverity = this.getMaxSeverity(smokes);
      
      results.push({
        detectionType: "smoke",
        confidence: this.calculateAverageConfidence(smokes),
        objects: smokes.map(smoke => ({
          label: "smoke",
          confidence: smoke.confidence,
          boundingBox: smoke.boundingBox,
        })),
        metadata: {
          severity: maxSeverity,
          affectedArea: this.calculateTotalArea(smokes),
          density: this.estimateSmokeDensity(smokes),
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Detect fire and smoke in frame
   */
  private async detectHazardsInFrame(frame: DetectionFrame): Promise<FireHazard[]> {
    const ranLocalInference = shouldRunLocalSpecialtyInference(frame) && this.inference !== null;
    const local = ranLocalInference
      ? await this.inference.run(frame)
      : [];
    const modelHazards = [...getInferenceObjects(frame, ["smoke", "fire"]), ...local]
      .filter((item) => item.label === "smoke" || item.label === "fire")
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE)
      .map((item) => {
        const area = item.boundingBox.width * item.boundingBox.height;
        const type = item.label as HazardType;
        return {
          type,
          boundingBox: item.boundingBox,
          confidence: item.confidence,
          area,
          severity: this.calculateSeverity({ type, area }),
        };
      });

    // An empty result from a model or authenticated upstream inference is a
    // valid negative result. The old code overrode that negative with a
    // color-only heuristic, causing orange objects and gray walls to alert.
    if (modelHazards.length > 0 || ranLocalInference || hasInferenceObjects(frame)) {
      return modelHazards;
    }

    // Color alone is not reliable evidence of fire or smoke. If neither a
    // local model nor upstream detections are available, fail closed.
    return [];
  }

  private isTemporallyConfirmed(
    hazard: FireHazard,
    history: Array<{ timestamp: Date; hazards: FireHazard[] }>,
    now: Date,
  ): boolean {
    const recent = history
      .filter((entry) => Math.abs(now.getTime() - entry.timestamp.getTime()) <= this.CONFIRMATION_WINDOW_MS)
      .slice(-this.CONFIRMATION_FRAMES);
    if (recent.length < this.CONFIRMATION_FRAMES) return false;

    return recent.every((entry) => entry.hazards.some((candidate) =>
      this.sameHazardType(candidate.type, hazard.type)
      && calculateIoU(candidate.boundingBox, hazard.boundingBox) >= 0.15
    ));
  }

  private sameHazardType(left: HazardType, right: HazardType): boolean {
    return left === right || left === "both" || right === "both";
  }

  /**
   * Optical chromatic analysis for fire and smoke when deep model weights are unprovisioned
   */
  private detectOpticalHazards(frame: DetectionFrame): FireHazard[] {
    if (!frame.imageData || !frame.width || !frame.height) return [];
    const width = frame.width;
    const height = frame.height;
    const buffer = frame.imageData;
    const pixelCount = width * height;
    if (buffer.length < pixelCount * 3) return [];

    const gridSize = Math.max(4, Math.floor(Math.min(width, height) / 16));
    const gridCols = Math.floor(width / gridSize);
    const gridRows = Math.floor(height / gridSize);

    const fireBlocks: Array<{ gx: number; gy: number }> = [];
    const smokeBlocks: Array<{ gx: number; gy: number }> = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let firePixels = 0;
        let smokePixels = 0;
        const startX = gx * gridSize;
        const startY = gy * gridSize;
        const blockSize = gridSize * gridSize;

        for (let y = startY; y < startY + gridSize && y < height; y++) {
          for (let x = startX; x < startX + gridSize && x < width; x++) {
            const idx = (y * width + x) * 3;
            const r = buffer[idx] ?? 0;
            const g = buffer[idx + 1] ?? 0;
            const b = buffer[idx + 2] ?? 0;

            // Flame color condition in RGB:
            // High red, orange/yellow hue: R > 190, G > 90, R >= G, G > B, (R - B) > 50
            if (r > 190 && g > 90 && r >= g && g > b && (r - b) > 50) {
              firePixels++;
            }
            // Smoke color condition:
            // Grayish / diffuse, balanced low saturation: |R-G| < 18, |G-B| < 18, 90 <= avg <= 215
            const avg = (r + g + b) / 3;
            if (Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && avg >= 90 && avg <= 215) {
              smokePixels++;
            }
          }
        }

        if (firePixels >= blockSize * 0.35) {
          fireBlocks.push({ gx, gy });
        }
        if (smokePixels >= blockSize * 0.45) {
          smokeBlocks.push({ gx, gy });
        }
      }
    }

    const hazards: FireHazard[] = [];

    // Group fire blocks
    if (fireBlocks.length >= 2) {
      let minGx = fireBlocks[0]!.gx;
      let maxGx = fireBlocks[0]!.gx;
      let minGy = fireBlocks[0]!.gy;
      let maxGy = fireBlocks[0]!.gy;
      for (const b of fireBlocks) {
        minGx = Math.min(minGx, b.gx);
        maxGx = Math.max(maxGx, b.gx);
        minGy = Math.min(minGy, b.gy);
        maxGy = Math.max(maxGy, b.gy);
      }
      const bbox = {
        x: (minGx * gridSize) / width,
        y: (minGy * gridSize) / height,
        width: Math.min(1.0, ((maxGx - minGx + 1) * gridSize) / width),
        height: Math.min(1.0, ((maxGy - minGy + 1) * gridSize) / height),
      };
      const area = bbox.width * bbox.height;
      if (area >= 0.005) {
        hazards.push({
          type: "fire",
          boundingBox: bbox,
          confidence: Math.min(0.92, 0.65 + Math.min(0.25, fireBlocks.length * 0.05)),
          area,
          severity: this.calculateSeverity({ type: "fire", area }),
          color: { dominant: "orange", intensity: 0.85 },
        });
      }
    }

    // Group smoke blocks
    if (smokeBlocks.length >= 4) {
      let minGx = smokeBlocks[0]!.gx;
      let maxGx = smokeBlocks[0]!.gx;
      let minGy = smokeBlocks[0]!.gy;
      let maxGy = smokeBlocks[0]!.gy;
      for (const b of smokeBlocks) {
        minGx = Math.min(minGx, b.gx);
        maxGx = Math.max(maxGx, b.gx);
        minGy = Math.min(minGy, b.gy);
        maxGy = Math.max(maxGy, b.gy);
      }
      const bbox = {
        x: (minGx * gridSize) / width,
        y: (minGy * gridSize) / height,
        width: Math.min(1.0, ((maxGx - minGx + 1) * gridSize) / width),
        height: Math.min(1.0, ((maxGy - minGy + 1) * gridSize) / height),
      };
      const area = bbox.width * bbox.height;
      if (area >= 0.01) {
        hazards.push({
          type: "smoke",
          boundingBox: bbox,
          confidence: Math.min(0.88, 0.60 + Math.min(0.25, smokeBlocks.length * 0.03)),
          area,
          severity: this.calculateSeverity({ type: "smoke", area }),
          color: { dominant: "gray", intensity: 0.70 },
        });
      }
    }

    return hazards;
  }

  /**
   * Calculate severity based on area and color
   */
  private calculateSeverity(hazard: any): SeverityLevel {
    const area = hazard.area;
    
    if (hazard.type === "fire") {
      if (area > this.AREA_THRESHOLD_HIGH) return "critical";
      if (area > this.AREA_THRESHOLD_LOW) return "high";
      return "medium";
    } else {
      // Smoke
      if (area > this.AREA_THRESHOLD_HIGH) return "high";
      if (area > this.AREA_THRESHOLD_LOW) return "medium";
      return "low";
    }
  }

  /**
   * Calculate total affected area
   */
  private calculateTotalArea(hazards: FireHazard[]): number {
    return hazards.reduce((sum, h) => sum + h.area, 0);
  }

  /**
   * Check if fire is spreading quickly
   */
  private isSpreadingFast(history: Array<{ timestamp: Date; hazards: FireHazard[] }>): boolean {
    if (history.length < 3) return false;

    const recent = history.slice(-3);
    const areas = recent.map(h => this.calculateTotalArea(h.hazards));
    
    // Check if area is increasing consistently
    for (let i = 1; i < areas.length; i++) {
      if (areas[i]! <= areas[i - 1]!) return false;
    }

    // Check rate of increase
    const firstArea = areas[0]!;
    const lastArea = areas[areas.length - 1]!;
    const increaseRate = (lastArea - firstArea) / firstArea;

    return increaseRate > 0.5; // 50% increase is considered fast spreading
  }

  /**
   * Estimate smoke density
   */
  private estimateSmokeDensity(smokes: FireHazard[]): "light" | "moderate" | "heavy" {
    const avgConfidence = this.calculateAverageConfidence(smokes);
    const totalArea = this.calculateTotalArea(smokes);

    if (avgConfidence > 0.85 && totalArea > 0.15) return "heavy";
    if (avgConfidence > 0.70 && totalArea > 0.08) return "moderate";
    return "light";
  }

  /**
   * Get maximum severity from hazards
   */
  private getMaxSeverity(hazards: FireHazard[]): SeverityLevel {
    const severityOrder: SeverityLevel[] = ["low", "medium", "high", "critical"];
    
    let maxIndex = 0;
    for (const hazard of hazards) {
      const index = severityOrder.indexOf(hazard.severity);
      if (index > maxIndex) maxIndex = index;
    }

    return severityOrder[maxIndex]!;
  }

  private calculateAverageConfidence(hazards: FireHazard[]): number {
    if (hazards.length === 0) return 0;
    const sum = hazards.reduce((acc, h) => acc + h.confidence, 0);
    return sum / hazards.length;
  }

  async cleanup(): Promise<void> {
    this.inference = null;
    this.isModelLoaded = false;
    this.detectionHistory.clear();
    console.log("Smoke and fire detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? `Local fire/smoke model active; confirmation: ${this.CONFIRMATION_FRAMES} frames`
        : `Fire/smoke model unavailable; color-only alert fallback is disabled. ${this.modelLoadError ?? "Model unavailable"}`,
    };
  }
}
