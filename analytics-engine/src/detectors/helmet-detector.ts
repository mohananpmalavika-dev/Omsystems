/**
 * Helmet Detection
 * Detects whether persons on motorcycles/bicycles are wearing helmets
 * Critical for construction sites and traffic enforcement
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, calculateIoU } from "./base-detector.js";

export interface HelmetDetection {
  personBoundingBox: { x: number; y: number; width: number; height: number };
  helmetDetected: boolean;
  confidence: number;
  vehicleType?: "motorcycle" | "bicycle";
  riskLevel: "compliant" | "violation" | "uncertain";
}

export class HelmetDetector extends BaseDetector {
  private isModelLoaded = false;
  private readonly MIN_CONFIDENCE = 0.7;
  private readonly HELMET_IOU_THRESHOLD = 0.3; // Head-helmet overlap threshold

  constructor() {
    super("helmet", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing helmet detector...");
    
    // TODO: Load helmet detection model
    // Model should detect: person, motorcycle, bicycle, helmet, head
    
    this.isModelLoaded = true;
    console.log("Helmet detector initialized");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    const detections = await this.detectHelmetsInFrame(frame);
    
    const results: DetectionResult[] = [];
    const violations = detections.filter(d => d.riskLevel === "violation");

    if (violations.length > 0) {
      results.push({
        detectionType: "helmet-violation",
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
    // TODO: Replace with actual model inference
    /*
    Example implementation:
    
    1. Detect persons, motorcycles, bicycles
    2. Detect helmets and heads
    3. Match helmets to heads using spatial proximity
    4. Determine if person on vehicle is wearing helmet
    
    const allDetections = await this.model.detect(frame);
    
    const persons = allDetections.filter(d => d.class === 'person');
    const vehicles = allDetections.filter(d => ['motorcycle', 'bicycle'].includes(d.class));
    const helmets = allDetections.filter(d => d.class === 'helmet');
    const heads = allDetections.filter(d => d.class === 'head');
    
    // Match persons with vehicles
    const personsOnVehicles = this.matchPersonsToVehicles(persons, vehicles);
    
    // Check helmet compliance for each person on vehicle
    return personsOnVehicles.map(match => 
      this.checkHelmetCompliance(match, helmets, heads)
    );
    */
    
    return [];
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
      const iou = calculateIoU(headRegion, helmet.boundingBox);
      
      if (iou > this.HELMET_IOU_THRESHOLD) {
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
        const iou = calculateIoU(headRegion, head.boundingBox);
        return iou > 0.3 && head.confidence >= 0.6;
      });

      if (headVisible) {
        riskLevel = "violation";
        confidence = 0.85; // High confidence violation if head is clearly visible
      } else {
        riskLevel = "uncertain";
        confidence = 0.5;
      }
    } else {
      riskLevel = "uncertain";
      confidence = maxHelmetConfidence;
    }

    return {
      personBoundingBox: personBox,
      helmetDetected,
      confidence,
      vehicleType: match.vehicle.vehicleType,
      riskLevel,
    };
  }

  private calculateAverageConfidence(detections: HelmetDetection[]): number {
    if (detections.length === 0) return 0;
    const sum = detections.reduce((acc, d) => acc + d.confidence, 0);
    return sum / detections.length;
  }

  async cleanup(): Promise<void> {
    this.isModelLoaded = false;
    console.log("Helmet detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("unhealthy" as const),
      details: "Helmet detection ready",
    };
  }
}
