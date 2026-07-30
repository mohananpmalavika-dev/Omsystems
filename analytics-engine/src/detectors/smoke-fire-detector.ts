/**
 * Smoke and Fire Detection
 * Early warning system for fire hazards
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, getInferenceObjects, shouldRunLocalSpecialtyInference } from "./base-detector.js";
import { loadObjectInference, modelUnavailableReason, type ObjectFrameInference } from "../inference/configured-model-inference.js";

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
  private detectionHistory: Array<{ timestamp: Date; hazards: FireHazard[] }> = [];
  
  private readonly MIN_CONFIDENCE: number;
  private readonly HISTORY_SIZE = 10;
  private readonly AREA_THRESHOLD_LOW = 0.05; // 5% of frame
  private readonly AREA_THRESHOLD_HIGH = 0.20; // 20% of frame

  constructor(inference: ObjectFrameInference | null = null, confidenceThreshold = 0.65) {
    super("fire-smoke", "1.0.0");
    this.inference = inference;
    this.MIN_CONFIDENCE = confidenceThreshold;
  }

  async initialize(): Promise<void> {
    console.log("Initializing smoke and fire detector...");
    
    try {
      this.inference ??= await loadObjectInference("fire-smoke", this.MIN_CONFIDENCE);
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
    
    // Store in history for trend analysis
    this.detectionHistory.push({
      timestamp: frame.timestamp,
      hazards,
    });

    if (this.detectionHistory.length > this.HISTORY_SIZE) {
      this.detectionHistory.shift();
    }

    const results: DetectionResult[] = [];

    // Process fire detections
    const fires = hazards.filter(h => h.type === "fire" || h.type === "both");
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
          spreading: this.isSpreadingFast(),
          colorIndicators: fires.map(f => f.color).filter(Boolean),
        },
        requiresAlert: true,
      });
    }

    // Process smoke detections
    const smokes = hazards.filter(h => h.type === "smoke" || h.type === "both");
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
    const local = shouldRunLocalSpecialtyInference(frame) && this.inference
      ? await this.inference.run(frame)
      : [];
    return [...getInferenceObjects(frame, ["smoke", "fire"]), ...local]
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
  private isSpreadingFast(): boolean {
    if (this.detectionHistory.length < 3) return false;

    const recent = this.detectionHistory.slice(-3);
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
    this.detectionHistory = [];
    console.log("Smoke and fire detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? `Local fire/smoke model active; history: ${this.detectionHistory.length} frames`
        : `Awaiting fire/smoke model; normalized observations remain supported. ${this.modelLoadError ?? "Model unavailable"}. History: ${this.detectionHistory.length} frames`,
    };
  }
}
