/**
 * Helmet Detection
 * Detects whether persons on motorcycles/bicycles are wearing helmets
 * Critical for construction sites and traffic enforcement
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, calculateIoU, getInferenceObjects, shouldRunLocalSpecialtyInference } from "./base-detector.js";
import { loadObjectInference, modelUnavailableReason, type ObjectFrameInference } from "../inference/configured-model-inference.js";

export interface HelmetDetection {
  personBoundingBox: { x: number; y: number; width: number; height: number };
  helmetDetected: boolean;
  confidence: number;
  vehicleType?: "motorcycle" | "bicycle";
  riskLevel: "compliant" | "violation" | "uncertain";
}

export class HelmetDetector extends BaseDetector {
  private isModelLoaded = false;
  private inference: ObjectFrameInference | null;
  private modelLoadError: string | null = null;
  private readonly MIN_CONFIDENCE: number;
  private readonly HEAD_REGION_OVERLAP_THRESHOLD = 0.6;

  constructor(inference: ObjectFrameInference | null = null, confidenceThreshold = 0.7) {
    super("helmet", "1.0.0");
    this.inference = inference;
    this.MIN_CONFIDENCE = confidenceThreshold;
  }

  async initialize(): Promise<void> {
    try {
      this.inference ??= await loadObjectInference("helmet", this.MIN_CONFIDENCE);
      this.isModelLoaded = true;
      this.modelLoadError = null;
      console.log("Helmet detector loaded local ONNX model");
    } catch (error) {
      this.inference = null;
      this.isModelLoaded = false;
      this.modelLoadError = error instanceof Error ? error.message : modelUnavailableReason("helmet");
      console.warn(`Helmet detector running in normalized-observation mode: ${this.modelLoadError}`);
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const detections = await this.detectHelmetsInFrame(frame);
    
    const results: DetectionResult[] = [];
    const violations = detections.filter(d => d.riskLevel === "violation");

    if (violations.length > 0) {
      results.push({
        detectionType: "no-helmet",
        confidence: this.calculateAverageConfidence(violations),
        objects: violations.map(detection => ({
          label: "no-helmet",
          confidence: detection.confidence,
          boundingBox: detection.personBoundingBox,
        })),
        metadata: {
          violationCount: violations.length,
          totalChecked: detections.length,
          vehicleTypes: violations.map(v => v.vehicleType).filter(Boolean),
        },
        requiresAlert: true,
      });
    }

    // Also report compliant cases for analytics
    const compliant = detections.filter(d => d.riskLevel === "compliant");
    if (compliant.length > 0) {
      results.push({
        detectionType: "helmet-compliant",
        confidence: this.calculateAverageConfidence(compliant),
        objects: compliant.map(detection => ({
          label: "helmet-worn",
          confidence: detection.confidence,
          boundingBox: detection.personBoundingBox,
        })),
        metadata: {
          compliantCount: compliant.length,
        },
        requiresAlert: false,
      });
    }

    return results;
  }

  /**
   * Detect helmets in frame
   */
  private async detectHelmetsInFrame(frame: DetectionFrame): Promise<HelmetDetection[]> {
    const local = shouldRunLocalSpecialtyInference(frame) && this.inference
      ? await this.inference.run(frame)
      : [];
    const observations = [...getInferenceObjects(frame), ...local];
    const persons = observations.filter((item) => item.label === "person")
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE);
    const vehicles = observations.filter((item) => item.label === "motorcycle" || item.label === "bicycle")
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE);
    const helmets = observations.filter((item) => item.label === "helmet")
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE);
    const heads = observations.filter((item) => item.label === "head")
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE);

    // A missing helmet alone is not a violation: a high-confidence head
    // observation is required before reporting a rider as unprotected.
    return this.matchPersonsToVehicles(persons, vehicles)
      .map((match) => this.checkHelmetCompliance(match, helmets, heads));
  }

  /**
   * Match persons to nearby vehicles
   */
  private matchPersonsToVehicles(
    persons: any[],
    vehicles: any[]
  ): Array<{ person: any; vehicle: any }> {
    const matches: Array<{ person: any; vehicle: any }> = [];

    for (const person of persons) {
      for (const vehicle of vehicles) {
        // Check if person bounding box overlaps with vehicle
        const iou = calculateIoU(person.boundingBox, vehicle.boundingBox);
        
        if (iou > 0.1) {
          matches.push({ person, vehicle });
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Check if person is wearing helmet
   */
  private checkHelmetCompliance(
    match: { person: any; vehicle: any },
    helmets: any[],
    heads: any[]
  ): HelmetDetection {
    // Find head in upper portion of person bounding box
    const personBox = match.person.boundingBox;
    const headRegion = {
      x: personBox.x,
      y: personBox.y,
      width: personBox.width,
      height: personBox.height * 0.3, // Top 30% of person box
    };

    // Find helmets near the head region
    let helmetDetected = false;
    let maxHelmetConfidence = 0;

    for (const helmet of helmets) {
      if (overlapOfCandidate(headRegion, helmet.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD) {
        helmetDetected = true;
        maxHelmetConfidence = Math.max(maxHelmetConfidence, helmet.confidence);
      }
    }

    // Determine risk level
    let riskLevel: "compliant" | "violation" | "uncertain";
    let confidence: number;

    if (helmetDetected && maxHelmetConfidence >= this.MIN_CONFIDENCE) {
      riskLevel = "compliant";
      confidence = maxHelmetConfidence;
    } else if (!helmetDetected) {
      // Check if we can see the head clearly
      const headVisible = heads.some(head => {
        return overlapOfCandidate(headRegion, head.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD
          && head.confidence >= 0.6;
      });

      if (headVisible) {
        riskLevel = "violation";
        confidence = 0.85; // High confidence violation if head is clearly visible
      } else {
        // Cannot determine without clear head visibility
        // Return null confidence to indicate model unavailable for this detection
        riskLevel = "uncertain";
        confidence = 0; // Explicitly 0 - no head visible means no violation evidence
      }
    } else {
      riskLevel = "uncertain";
      confidence = maxHelmetConfidence;
    }

    return {
      personBoundingBox: personBox,
      helmetDetected,
      confidence,
      vehicleType: match.vehicle.label as HelmetDetection["vehicleType"],
      riskLevel,
    };
  }

  private calculateAverageConfidence(detections: HelmetDetection[]): number {
    if (detections.length === 0) return 0;
    const sum = detections.reduce((acc, d) => acc + d.confidence, 0);
    return sum / detections.length;
  }

  async cleanup(): Promise<void> {
    this.inference = null;
    this.isModelLoaded = false;
    console.log("Helmet detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? "Local helmet model active"
        : `Awaiting helmet/head model; normalized observations remain supported. ${this.modelLoadError ?? "Model unavailable"}`,
    };
  }
}

/** Portion of a small head/helmet box contained by a person's head region. */
function overlapOfCandidate(
  region: { x: number; y: number; width: number; height: number },
  candidate: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(region.x, candidate.x);
  const top = Math.max(region.y, candidate.y);
  const right = Math.min(region.x + region.width, candidate.x + candidate.width);
  const bottom = Math.min(region.y + region.height, candidate.y + candidate.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const candidateArea = candidate.width * candidate.height;
  return candidateArea > 0 ? intersection / candidateArea : 0;
}
