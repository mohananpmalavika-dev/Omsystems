/**
 * Helmet Detection
 * Detects whether persons on motorcycles/bicycles are wearing helmets
 * Critical for construction sites and traffic enforcement
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, calculateIoU, getInferenceObjects, shouldRunLocalSpecialtyInference } from "./base-detector.js";
import {
  loadHelmetClassificationInference,
  modelUnavailableReason,
  type HelmetClassificationFrameInference,
  type ObjectFrameInference,
} from "../inference/configured-model-inference.js";

export interface HelmetDetection {
  personBoundingBox: { x: number; y: number; width: number; height: number };
  helmetDetected: boolean;
  confidence: number | null;
  vehicleType?: "motorcycle" | "bicycle";
  riskLevel: "compliant" | "violation" | "uncertain";
}

export class HelmetDetector extends BaseDetector {
  private isModelLoaded = false;
  private inference: ObjectFrameInference | null;
  private classifier: HelmetClassificationFrameInference | null;
  private modelLoadError: string | null = null;
  private readonly MIN_CONFIDENCE: number;
  private readonly HEAD_REGION_OVERLAP_THRESHOLD = 0.6;

  constructor(
    inference: ObjectFrameInference | null = null,
    confidenceThreshold = 0.5,
    classifier: HelmetClassificationFrameInference | null = null,
  ) {
    super("helmet", "1.0.0");
    this.inference = inference;
    this.classifier = classifier;
    this.MIN_CONFIDENCE = confidenceThreshold;
  }

  async initialize(): Promise<void> {
    try {
      if (!this.inference && !this.classifier) {
        this.classifier = await loadHelmetClassificationInference("helmet");
      }
      this.isModelLoaded = true;
      this.modelLoadError = null;
      console.log("Helmet detector loaded local ONNX safety-helmet classifier");
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
      const avgConf = this.calculateAverageConfidence(violations);
      const effectiveConf = Math.max(avgConf ?? 0.8, 0.75);
      const violationObjects = violations.flatMap(detection => [
        {
          label: "no-helmet",
          confidence: detection.confidence ?? effectiveConf,
          boundingBox: detection.personBoundingBox,
        },
        {
          label: "person",
          confidence: detection.confidence ?? effectiveConf,
          boundingBox: detection.personBoundingBox,
        },
      ]);
      results.push({
        detectionType: "no-helmet",
        status: "SUCCESS",
        provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
        confidence: effectiveConf,
        durationSeconds: 1,
        objects: violationObjects,
        metadata: {
          violationCount: violations.length,
          totalChecked: detections.length,
          vehicleTypes: violations.map(v => v.vehicleType).filter(Boolean),
        },
        executionMetadata: {
          status: "SUCCESS",
          provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
          modelId: "helmet-classifier",
          modelVersion: "1.0.0",
          simulated: false,
          timestamp: new Date().toISOString(),
        },
        requiresAlert: true,
      });
    }

    // Report helmet presence as an alertable event so restricted indoor areas
    // can flag helmeted entrants through the camera rule configuration.
    const compliant = detections.filter(d => d.riskLevel === "compliant");
    if (compliant.length > 0) {
      const avgConf = this.calculateAverageConfidence(compliant);
      const effectiveConf = Math.max(avgConf ?? 0.8, 0.75);
      const compliantObjects = compliant.flatMap(detection => [
        {
          label: "helmet",
          confidence: detection.confidence ?? effectiveConf,
          boundingBox: detection.personBoundingBox,
        },
        {
          label: "person",
          confidence: detection.confidence ?? effectiveConf,
          boundingBox: detection.personBoundingBox,
        },
      ]);
      results.push({
        detectionType: "helmet-worn",
        status: "SUCCESS",
        provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
        confidence: effectiveConf,
        durationSeconds: 1,
        objects: compliantObjects,
        metadata: {
          compliantCount: compliant.length,
        },
        executionMetadata: {
          status: "SUCCESS",
          provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
          modelId: "helmet-classifier",
          modelVersion: "1.0.0",
          simulated: false,
          timestamp: new Date().toISOString(),
        },
        requiresAlert: true,
      });
      // Also emit "helmet" detection type so cameras configured with "AI - Helmet / Face cover detection" trigger
      results.push({
        detectionType: "helmet",
        status: "SUCCESS",
        provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
        confidence: effectiveConf,
        durationSeconds: 1,
        objects: compliantObjects,
        metadata: {
          compliantCount: compliant.length,
        },
        executionMetadata: {
          status: "SUCCESS",
          provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
          modelId: "helmet-classifier",
          modelVersion: "1.0.0",
          simulated: false,
          timestamp: new Date().toISOString(),
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Detect helmets in frame
   */
  private async detectHelmetsInFrame(frame: DetectionFrame): Promise<HelmetDetection[]> {
    const runLocal = shouldRunLocalSpecialtyInference(frame);
    const local = runLocal && this.inference
      ? await this.inference.run(frame)
      : [];
    const observations = [...getInferenceObjects(frame), ...local];
    const persons = observations.filter((item) => item.label === "person")
      .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);
    const vehicles = observations.filter((item) => item.label === "motorcycle" || item.label === "bicycle")
      .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);
    const helmets = observations.filter((item) => item.label === "helmet")
      .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);
    const heads = observations.filter((item) => item.label === "head")
      .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);

    // A missing helmet alone is not a violation: a high-confidence head
    // observation is required before reporting a rider as unprotected.
    const riderMatches = this.matchPersonsToVehicles(persons, vehicles);
    const riderDetections = await Promise.all(riderMatches
      .map(async (match) => {
        if (runLocal && this.classifier) return this.classifyHelmetCompliance(frame, match);
        return this.checkHelmetCompliance(match, helmets, heads);
      }));

    // Use bounding box ID instead of object reference to handle recreated person arrays
    const riderPersonIds = new Set(
      riderMatches.map((match) => this.getPersonIdentifier(match.person))
    );
    const indoorPersons = persons.filter((person) => !riderPersonIds.has(this.getPersonIdentifier(person)));
    const indoorHelmetDetections = runLocal && this.classifier
      ? await Promise.all(indoorPersons.map((person) => this.classifyPersonHelmetCompliance(frame, person)))
      : indoorPersons
        .map((person) => this.detectHelmetPresence(person, helmets))
        .filter((detection): detection is HelmetDetection => Boolean(detection));

    if (riderMatches.length === 0 && indoorPersons.length === 0 && runLocal && this.classifier) {
      // Fallback: evaluate frame when safety helmet rules are active but base detector missed seated/occluded person
      const fullFrameClassification = await this.classifier.run(frame, { x: 0, y: 0, width: 1, height: 1 });
      if (fullFrameClassification.wearingHelmet && fullFrameClassification.confidence >= 0.8) {
        return [{
          personBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
          helmetDetected: true,
          confidence: fullFrameClassification.confidence,
          riskLevel: "compliant",
        }];
      }
    }

    return [...riderDetections, ...indoorHelmetDetections];
  }

  /**
   * Generate stable identifier for person (trackId or bounding box hash)
   */
  private getPersonIdentifier(person: any): string {
    // Use trackId if available (stable across frame updates)
    if (typeof person.trackId === "string") {
      return person.trackId;
    }
    // Fallback to bounding box coordinates (normalized to avoid floating point issues)
    const box = person.boundingBox ?? {};
    return `${Math.round((box.x ?? 0) * 1000)},${Math.round((box.y ?? 0) * 1000)},${Math.round((box.width ?? 0) * 1000)},${Math.round((box.height ?? 0) * 1000)}`;
  }

  private detectHelmetPresence(person: any, helmets: any[]): HelmetDetection | undefined {
    const headRegion = this.headRegion(person.boundingBox);
    const helmet = helmets
      .filter((candidate) => overlapOfCandidate(headRegion, candidate.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD)
      .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))[0];
    if (!helmet) return undefined;
    return {
      personBoundingBox: person.boundingBox,
      helmetDetected: true,
      confidence: helmet.confidence ?? null,
      riskLevel: "compliant",
    };
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
    const headRegion = this.headRegion(personBox);

    // Find helmets near the head region
    let helmetDetected = false;
    let maxHelmetConfidence = 0;

    for (const helmet of helmets) {
      if (overlapOfCandidate(headRegion, helmet.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD) {
        helmetDetected = true;
        maxHelmetConfidence = Math.max(maxHelmetConfidence, helmet.confidence ?? 0);
      }
    }

    // Determine risk level
    let riskLevel: "compliant" | "violation" | "uncertain";
    let confidence: number | null;

    if (helmetDetected && maxHelmetConfidence >= this.MIN_CONFIDENCE) {
      riskLevel = "compliant";
      confidence = maxHelmetConfidence;
    } else if (!helmetDetected) {
      // Check if we can see the head clearly from actual observation confidence
      const visibleHead = heads.find(head => {
        return overlapOfCandidate(headRegion, head.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD
          && (head.confidence ?? 0) >= 0.6;
      });

      if (visibleHead) {
        riskLevel = "violation";
        // Use actual observed head confidence instead of hardcoded 0.85
        confidence = visibleHead.confidence ?? 0.6;
      } else {
        // Cannot determine without clear head visibility - return null confidence
        riskLevel = "uncertain";
        confidence = null;
      }
    } else {
      riskLevel = "uncertain";
      confidence = maxHelmetConfidence > 0 ? maxHelmetConfidence : null;
    }

    return {
      personBoundingBox: personBox,
      helmetDetected,
      confidence,
      vehicleType: match.vehicle.label as HelmetDetection["vehicleType"],
      riskLevel,
    };
  }

  private async classifyHelmetCompliance(
    frame: DetectionFrame,
    match: { person: any; vehicle: any },
  ): Promise<HelmetDetection> {
    const personBox = match.person.boundingBox;
    const classification = await this.bestHelmetClassification(frame, personBox);
    const riskLevel = classification.confidence < this.MIN_CONFIDENCE
      ? "uncertain"
      : classification.wearingHelmet ? "compliant" : "violation";
    return {
      personBoundingBox: personBox,
      helmetDetected: classification.wearingHelmet,
      confidence: classification.confidence,
      vehicleType: match.vehicle.label as HelmetDetection["vehicleType"],
      riskLevel,
    };
  }

  private async classifyPersonHelmetCompliance(
    frame: DetectionFrame,
    person: any,
  ): Promise<HelmetDetection> {
    const personBox = person.boundingBox;
    const classification = await this.bestHelmetClassification(frame, personBox);
    const riskLevel = classification.confidence < this.MIN_CONFIDENCE
      ? "uncertain"
      : classification.wearingHelmet ? "compliant" : "violation";
    return {
      personBoundingBox: person.boundingBox,
      helmetDetected: classification.wearingHelmet,
      confidence: classification.confidence,
      riskLevel,
    };
  }

  private async bestHelmetClassification(
    frame: DetectionFrame,
    personBox: { x: number; y: number; width: number; height: number },
  ) {
    // 1. Upper body box (covers head above/beside torso on seated/slouched persons)
    const upperBodyBox = {
      x: Math.max(0, personBox.x - personBox.width * 0.15),
      y: Math.max(0, personBox.y - personBox.height * 0.15),
      width: Math.min(1 - Math.max(0, personBox.x - personBox.width * 0.15), personBox.width * 1.3),
      height: Math.min(1 - Math.max(0, personBox.y - personBox.height * 0.15), personBox.height * 0.55),
    };
    const upperResult = await this.classifier!.run(frame, upperBodyBox);

    // 2. Standard head region
    const standardHeadBox = this.headRegion(personBox);
    const standardResult = await this.classifier!.run(frame, standardHeadBox);

    // If either detects wearing a helmet, prefer the helmet detection
    if (upperResult.wearingHelmet && (!standardResult.wearingHelmet || upperResult.confidence >= standardResult.confidence)) {
      return upperResult;
    }
    if (standardResult.wearingHelmet) {
      return standardResult;
    }
    // Neither detected helmet, return the more confident unwearing result
    return standardResult.confidence > upperResult.confidence ? standardResult : upperResult;
  }

  private headRegion(personBox: { x: number; y: number; width: number; height: number }) {
    return {
      x: personBox.x + (personBox.width * 0.1),
      y: personBox.y,
      width: personBox.width * 0.8,
      height: personBox.height * 0.35,
    };
  }

  private calculateAverageConfidence(detections: HelmetDetection[]): number | null {
    const validConfidences = detections
      .map(d => d.confidence)
      .filter((c): c is number => c !== null && typeof c === "number");
    if (validConfidences.length === 0) return null;
    const sum = validConfidences.reduce((acc, c) => acc + c, 0);
    return sum / validConfidences.length;
  }


  async cleanup(): Promise<void> {
    this.inference = null;
    this.classifier = null;
    this.isModelLoaded = false;
    console.log("Helmet detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? "Local PaddleClas safety-helmet classifier active"
        : `Awaiting local safety-helmet classifier; normalized observations remain supported. ${this.modelLoadError ?? "Model unavailable"}`,
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
