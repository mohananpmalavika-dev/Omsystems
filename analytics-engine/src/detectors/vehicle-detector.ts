/**
 * Vehicle Detection
 * Detects cars, motorcycles, buses, trucks, bicycles
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export type VehicleType = "car" | "motorcycle" | "bus" | "truck" | "bicycle" | "auto-rickshaw";

export interface VehicleTrack {
  trackId: string;
  vehicleType: VehicleType;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{ x: number; y: number; timestamp: Date }>;
  speed?: number; // pixels per second
  direction?: "north" | "south" | "east" | "west";
}

export class VehicleDetector extends BaseDetector {
  private tracks = new Map<string, VehicleTrack>();
  private isModelLoaded = false;

  private readonly TRACKING_TIMEOUT_MS = 10000; // 10 seconds
  private readonly MIN_CONFIDENCE = 0.6;

  constructor() {
    super("vehicle", "2.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing vehicle detector...");
    
    // TODO: Load YOLO model trained for vehicle detection
    // Model should detect: car, motorcycle, bus, truck, bicycle
    
    this.isModelLoaded = true;
    this.startTrackingCleanup();
    console.log("Vehicle detector initialized");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

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
    // TODO: Replace with actual YOLO/ONNX inference
    /*
    Example implementation:
    
    const input = this.preprocessFrame(frame);
    const outputs = await this.model.run(input);
    const detections = this.postprocess(outputs);
    
    // Filter for vehicle classes
    const vehicleClasses = ['car', 'motorcycle', 'bus', 'truck', 'bicycle'];
    return detections.filter(d => 
      vehicleClasses.includes(d.class) && 
      d.confidence >= this.MIN_CONFIDENCE
    );
    */
    
    return [];
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
        });
      }

      const track = this.tracks.get(trackId)!;
      track.lastSeen = timestamp;

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
    // TODO: Implement proper vehicle tracking (SORT, ByteTrack, etc.)
    return null;
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
    this.isModelLoaded = false;
    console.log("Vehicle detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("unhealthy" as const),
      details: `${this.tracks.size} active vehicle tracks`,
    };
  }
}
