/**
 * Person Detection
 * Detects and tracks people with pose estimation support
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, calculateIoU, type DetectionFrame, type DetectionResult, getInferenceObjects, hasInferenceObjects } from "./base-detector.js";
import { getModelManager } from "../model-manager.js";
import { YoloPersonInference } from "../inference/yolo-person-inference.js";
import { modelUnavailableReason } from "../inference/configured-model-inference.js";

export interface PersonTrack {
  trackId: string;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{ x: number; y: number; timestamp: Date }>;
  isStationary: boolean;
  lastBoundingBox: { x: number; y: number; width: number; height: number };
  enteredAt?: Date;
  exitedAt?: Date;
}

export class PersonDetector extends BaseDetector {
  private tracks = new Map<string, PersonTrack>();
  private isModelLoaded = false;
  private inference: YoloPersonInference | null = null;
  
  // Configuration
  private readonly TRACKING_TIMEOUT_MS = 5000; // 5 seconds
  private readonly STATIONARY_THRESHOLD = 0.03;
  private readonly MIN_CONFIDENCE = 0.5;

  constructor() {
    super("person", "2.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing person detector...");
    
    try {
      const manager = getModelManager();
      if (!manager.isModelAvailable("yolov8n")) throw new Error(modelUnavailableReason("yolov8n"));
      this.inference = new YoloPersonInference(await manager.getModel("yolov8n"));
      this.isModelLoaded = true;
      console.log("Person detector loaded yolov8n ONNX model");
    } catch (error) {
      this.isModelLoaded = false;
      console.warn("Person detector running in external-ingestion mode:", error instanceof Error ? error.message : error);
    }
    this.startTrackingCleanup();
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const persons = await this.detectPersonsInFrame(frame);
    
    // Update tracking for each detected person
    const tracked = this.updateTracking(persons, frame.timestamp);
    
    const results: DetectionResult[] = [];
    
    if (tracked.length > 0) {
      results.push({
        detectionType: "person",
        confidence: this.calculateAverageConfidence(tracked),
        objects: tracked.map(person => ({
          label: "person",
          confidence: person.confidence,
          trackId: person.trackId,
          boundingBox: person.boundingBox,
        })),
        metadata: {
          count: tracked.length,
          trackedIds: tracked.map(p => p.trackId),
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Detect persons in frame using ML model
   */
  private async detectPersonsInFrame(frame: DetectionFrame): Promise<any[]> {
    const external = getInferenceObjects(frame, ["person"]).filter((item) => item.confidence >= this.MIN_CONFIDENCE);
    // An explicit empty list is the result of the shared object pass, not a
    // request to run a second YOLO inference for this frame.
    if (hasInferenceObjects(frame) || !this.inference) return external;
    return this.inference.run(frame);
  }

  /**
   * Update tracking for detected persons
   */
  private updateTracking(detections: any[], timestamp: Date): any[] {
    const tracked: any[] = [];

    // Clean up stale tracks
    this.cleanupStaleTracks(timestamp);

    for (const detection of detections) {
      // Try to match with existing track
      let trackId = this.findMatchingTrack(detection);
      
      if (!trackId) {
        // Create new track
        trackId = randomUUID();
        this.tracks.set(trackId, {
          trackId,
          firstSeen: timestamp,
          lastSeen: timestamp,
          positions: [],
          isStationary: false,
          lastBoundingBox: detection.boundingBox,
        });
      }

      // Update track
      const track = this.tracks.get(trackId)!;
      track.lastSeen = timestamp;
      track.lastBoundingBox = detection.boundingBox;
      
      const center = {
        x: detection.boundingBox.x + detection.boundingBox.width / 2,
        y: detection.boundingBox.y + detection.boundingBox.height / 2,
      };
      
      track.positions.push({
        x: center.x,
        y: center.y,
        timestamp,
      });

      // Limit position history
      if (track.positions.length > 50) {
        track.positions.shift();
      }

      // Check if stationary
      track.isStationary = this.isTrackStationary(track);

      tracked.push({
        ...detection,
        trackId,
        isStationary: track.isStationary,
        dwellTimeSeconds: (timestamp.getTime() - track.firstSeen.getTime()) / 1000,
      });
    }

    return tracked;
  }

  /**
   * Find matching track for detection using IoU
   */
  private findMatchingTrack(detection: any): string | null {
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [trackId, track] of this.tracks) {
      const score = calculateIoU(track.lastBoundingBox, detection.boundingBox);
      if (score > bestScore && score >= 0.25) {
        bestScore = score;
        bestMatch = trackId;
      }
    }
    return bestMatch;
  }

  /**
   * Check if track is stationary
   */
  private isTrackStationary(track: PersonTrack): boolean {
    if (track.positions.length < 5) return false;

    const recent = track.positions.slice(-5);
    const firstPos = recent[0]!;
    
    for (const pos of recent) {
      const distance = Math.sqrt(
        Math.pow(pos.x - firstPos.x, 2) + 
        Math.pow(pos.y - firstPos.y, 2)
      );
      
      if (distance > this.STATIONARY_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clean up tracks that haven't been seen recently
   */
  private cleanupStaleTracks(currentTime: Date): void {
    const staleThreshold = currentTime.getTime() - this.TRACKING_TIMEOUT_MS;
    
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.lastSeen.getTime() < staleThreshold) {
        this.tracks.delete(trackId);
      }
    }
  }

  /**
   * Start periodic cleanup of stale tracks
   */
  private startTrackingCleanup(): void {
    setInterval(() => {
      this.cleanupStaleTracks(new Date());
    }, 10000); // Every 10 seconds
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(detections: any[]): number {
    if (detections.length === 0) return 0;
    const sum = detections.reduce((acc, d) => acc + d.confidence, 0);
    return sum / detections.length;
  }

  /**
   * Get active tracks
   */
  getActiveTracks(): PersonTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get track by ID
   */
  getTrack(trackId: string): PersonTrack | undefined {
    return this.tracks.get(trackId);
  }

  async cleanup(): Promise<void> {
    this.tracks.clear();
    this.inference = null;
    this.isModelLoaded = false;
    console.log("Person detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded ? `Local ONNX inference active; ${this.tracks.size} active tracks` : `External detection ingestion only; ${this.tracks.size} active tracks`,
    };
  }
}
