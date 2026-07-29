/**
 * Vehicle Detection
 * Detects cars, motorcycles, buses, trucks, bicycles
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, calculateIoU, type DetectionFrame, type DetectionResult, getInferenceObjects, hasInferenceObjects } from "./base-detector.js";
import { getModelManager } from "../model-manager.js";
import { YoloCocoInference } from "../inference/yolo-coco-inference.js";

export type VehicleType = "car" | "motorcycle" | "bus" | "truck" | "bicycle" | "auto-rickshaw";

export interface VehicleTrack {
  trackId: string;
  vehicleType: VehicleType;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{ x: number; y: number; timestamp: Date }>;
  speed?: number; // pixels per second
  direction?: "north" | "south" | "east" | "west";
  lastBoundingBox: { x: number; y: number; width: number; height: number };
}

export class VehicleDetector extends BaseDetector {
  private tracks = new Map<string, VehicleTrack>();
  private isModelLoaded = false;
  private inference: YoloCocoInference | null = null;
  private modelLoadError: string | undefined;

  private readonly TRACKING_TIMEOUT_MS = 10000; // 10 seconds
  private readonly MIN_CONFIDENCE = 0.6;

  constructor() {
    super("vehicle", "2.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing vehicle detector...");
    
    try {
      this.inference = new YoloCocoInference(await getModelManager().getModel("yolov8n"), this.MIN_CONFIDENCE);
      this.isModelLoaded = true;
      this.modelLoadError = undefined;
      console.log("Vehicle detector loaded shared YOLOv8 ONNX model");
    } catch (error) {
      this.inference = null;
      this.isModelLoaded = false;
      this.modelLoadError = error instanceof Error ? error.message : String(error);
      console.warn(`Vehicle detector running in external-ingestion mode: ${this.modelLoadError}`);
    }
    this.startTrackingCleanup();
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const vehicles = await this.detectVehiclesInFrame(frame);
    const tracked = this.updateTracking(vehicles, frame.timestamp);

    const results: DetectionResult[] = [];

    if (tracked.length > 0) {
      results.push({
        detectionType: "vehicle",
        confidence: this.calculateAverageConfidence(tracked),
        objects: tracked.map(vehicle => ({
          label: vehicle.vehicleType,
          confidence: vehicle.confidence,
          trackId: vehicle.trackId,
          boundingBox: vehicle.boundingBox,
        })),
        metadata: {
          count: tracked.length,
          byType: this.countByType(tracked),
          averageSpeed: this.calculateAverageSpeed(tracked),
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Detect vehicles in frame using ML model
   */
  private async detectVehiclesInFrame(frame: DetectionFrame): Promise<any[]> {
    const labels = ["car", "motorcycle", "bus", "truck", "bicycle", "auto-rickshaw"];
    const candidates = hasInferenceObjects(frame)
      ? getInferenceObjects(frame, labels)
      : this.inference
        ? await this.inference.run(frame)
        : [];
    return candidates
      .filter((item) => labels.includes(item.label))
      .filter((item) => item.confidence >= this.MIN_CONFIDENCE)
      .map((item) => ({ ...item, vehicleType: item.label }));
  }

  /**
   * Update tracking for detected vehicles
   */
  private updateTracking(detections: any[], timestamp: Date): any[] {
    const tracked: any[] = [];

    this.cleanupStaleTracks(timestamp);

    for (const detection of detections) {
      let trackId = this.findMatchingTrack(detection);

      if (!trackId) {
        trackId = randomUUID();
        this.tracks.set(trackId, {
          trackId,
          vehicleType: detection.vehicleType,
          firstSeen: timestamp,
          lastSeen: timestamp,
          positions: [],
          lastBoundingBox: detection.boundingBox,
        });
      }

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

      if (track.positions.length > 30) {
        track.positions.shift();
      }

      // Calculate speed and direction
      track.speed = this.calculateSpeed(track);
      track.direction = this.calculateDirection(track);

      tracked.push({
        ...detection,
        trackId,
        speed: track.speed,
        direction: track.direction,
        dwellTimeSeconds: (timestamp.getTime() - track.firstSeen.getTime()) / 1000,
      });
    }

    return tracked;
  }

  /**
   * Find matching track for detection
   */
  private findMatchingTrack(detection: any): string | null {
    let bestMatch: string | null = null;
    let bestScore = 0;
    for (const [trackId, track] of this.tracks) {
      if (track.vehicleType !== detection.vehicleType) continue;
      const score = calculateIoU(track.lastBoundingBox, detection.boundingBox);
      if (score > bestScore && score >= 0.25) {
        bestScore = score;
        bestMatch = trackId;
      }
    }
    return bestMatch;
  }

  /**
   * Calculate vehicle speed in pixels per second
   */
  private calculateSpeed(track: VehicleTrack): number {
    if (track.positions.length < 2) return 0;

    const recent = track.positions.slice(-5);
    if (recent.length < 2) return 0;

    const first = recent[0]!;
    const last = recent[recent.length - 1]!;

    const distance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + 
      Math.pow(last.y - first.y, 2)
    );

    const timeDiff = (last.timestamp.getTime() - first.timestamp.getTime()) / 1000;
    
    return timeDiff > 0 ? distance / timeDiff : 0;
  }

  /**
   * Calculate movement direction
   */
  private calculateDirection(track: VehicleTrack): "north" | "south" | "east" | "west" | undefined {
    if (track.positions.length < 5) return undefined;

    const recent = track.positions.slice(-5);
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;

    const dx = last.x - first.x;
    const dy = last.y - first.y;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle >= -45 && angle < 45) return "east";
    if (angle >= 45 && angle < 135) return "south";
    if (angle >= 135 || angle < -135) return "west";
    return "north";
  }

  /**
   * Count vehicles by type
   */
  private countByType(vehicles: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const vehicle of vehicles) {
      const type = vehicle.vehicleType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Calculate average speed
   */
  private calculateAverageSpeed(vehicles: any[]): number {
    if (vehicles.length === 0) return 0;
    
    const sum = vehicles.reduce((acc, v) => acc + (v.speed || 0), 0);
    return sum / vehicles.length;
  }

  private cleanupStaleTracks(currentTime: Date): void {
    const staleThreshold = currentTime.getTime() - this.TRACKING_TIMEOUT_MS;

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.lastSeen.getTime() < staleThreshold) {
        this.tracks.delete(trackId);
      }
    }
  }

  private startTrackingCleanup(): void {
    setInterval(() => {
      this.cleanupStaleTracks(new Date());
    }, 15000); // Every 15 seconds
  }

  private calculateAverageConfidence(detections: any[]): number {
    if (detections.length === 0) return 0;
    const sum = detections.reduce((acc, d) => acc + d.confidence, 0);
    return sum / detections.length;
  }

  getActiveTracks(): VehicleTrack[] {
    return Array.from(this.tracks.values());
  }

  async cleanup(): Promise<void> {
    this.tracks.clear();
    this.inference = null;
    this.isModelLoaded = false;
    console.log("Vehicle detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? `Local YOLOv8 ONNX inference active; ${this.tracks.size} active vehicle tracks`
        : `External normalized detections only; ${this.tracks.size} active vehicle tracks. ${this.modelLoadError ?? "Local model not provisioned"}`,
    };
  }
}
