/**
 * Zone-based Detection (Line Crossing, Intrusion, Loitering)
 * Analyzes object positions and movements relative to defined zones
 */

import {
  BaseDetector,
  type DetectedObject,
  type DetectionFrame,
  type DetectionResult,
  getBoundingBoxCenter,
  isPointInPolygon,
} from "./base-detector.js";

export interface Zone {
  id: string;
  name: string;
  shape: "polygon" | "line";
  points: Array<{ x: number; y: number }>;
}

export interface LineCrossingConfig {
  line: { start: { x: number; y: number }; end: { x: number; y: number } };
  direction: "any" | "a-to-b" | "b-to-a";
}

interface TrackedObject {
  trackId: string;
  label: string;
  positions: Array<{ x: number; y: number; timestamp: Date }>;
  enteredZoneAt?: Date;
  crossedLineAt?: Date;
  lastSeen: Date;
}

export class ZoneDetector extends BaseDetector {
  private trackedObjects = new Map<string, TrackedObject>();
  private readonly TRACKING_TIMEOUT_MS = 5000; // 5 seconds

  constructor() {
    super("zone", "1.0.0");
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Detect line crossing events
   */
  async detectLineCrossing(
    frame: DetectionFrame,
    objects: DetectedObject[],
    config: LineCrossingConfig,
  ): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp;

    for (const obj of objects) {
      if (!obj.trackId) continue;

      const center = getBoundingBoxCenter(obj.boundingBox);
      const trackId = obj.trackId;

      // Update tracking
      let tracked = this.trackedObjects.get(trackId);
      if (!tracked) {
        tracked = {
          trackId,
          label: obj.label,
          positions: [],
          lastSeen: now,
        };
        this.trackedObjects.set(trackId, tracked);
      }

      tracked.positions.push({ x: center.x, y: center.y, timestamp: now });
      tracked.lastSeen = now;

      // Keep only recent positions (last 3 seconds)
      tracked.positions = tracked.positions.filter(
        (p) => now.getTime() - p.timestamp.getTime() < 3000,
      );

      // Check for line crossing (need at least 2 positions)
      if (tracked.positions.length >= 2) {
        const prev = tracked.positions[tracked.positions.length - 2]!;
        const curr = tracked.positions[tracked.positions.length - 1]!;

        const crossed = this.checkLineCrossing(
          { x: prev.x, y: prev.y },
          { x: curr.x, y: curr.y },
          config.line,
        );

        if (crossed) {
          const direction = this.getLineCrossingDirection(
            { x: prev.x, y: prev.y },
            { x: curr.x, y: curr.y },
            config.line,
          );

          // Check if direction matches config
          const shouldAlert =
            config.direction === "any" ||
            (config.direction === "a-to-b" && direction === "a-to-b") ||
            (config.direction === "b-to-a" && direction === "b-to-a");

          if (shouldAlert && !tracked.crossedLineAt) {
            tracked.crossedLineAt = now;
            results.push({
              detectionType: "line-crossing",
              confidence: obj.confidence,
              objects: [obj],
              metadata: {
                trackId,
                label: obj.label,
                direction,
              },
              requiresAlert: true,
            });
          }
        }
      }
    }

    // Cleanup old tracks
    this.cleanupOldTracks(now);

    return results;
  }

  /**
   * Detect intrusion into restricted zones
   */
  async detectIntrusion(
    frame: DetectionFrame,
    objects: DetectedObject[],
    zone: Zone,
  ): Promise<DetectionResult[]> {
    if (zone.shape !== "polygon") {
      throw new Error("Intrusion detection requires polygon zones");
    }

    const results: DetectionResult[] = [];
    const intrudingObjects: DetectedObject[] = [];

    for (const obj of objects) {
      const center = getBoundingBoxCenter(obj.boundingBox);
      const isInside = isPointInPolygon(center, zone.points);

      if (isInside) {
        intrudingObjects.push(obj);
      }
    }

    if (intrudingObjects.length > 0) {
      results.push({
        detectionType: "intrusion",
        confidence: Math.max(...intrudingObjects.map((o) => o.confidence)),
        objects: intrudingObjects,
        metadata: {
          zoneName: zone.name,
          objectCount: intrudingObjects.length,
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Detect loitering (person remaining in zone beyond threshold)
   */
  async detectLoitering(
    frame: DetectionFrame,
    objects: DetectedObject[],
    zone: Zone,
    thresholdSeconds: number,
  ): Promise<DetectionResult[]> {
    if (zone.shape !== "polygon") {
      throw new Error("Loitering detection requires polygon zones");
    }

    const results: DetectionResult[] = [];
    const now = frame.timestamp;

    for (const obj of objects) {
      if (!obj.trackId || obj.label !== "person") continue;

      const center = getBoundingBoxCenter(obj.boundingBox);
      const isInside = isPointInPolygon(center, zone.points);

      if (isInside) {
        let tracked = this.trackedObjects.get(obj.trackId);
        if (!tracked) {
          tracked = {
            trackId: obj.trackId,
            label: obj.label,
            positions: [],
            enteredZoneAt: now,
            lastSeen: now,
          };
          this.trackedObjects.set(obj.trackId, tracked);
        }

        if (!tracked.enteredZoneAt) {
          tracked.enteredZoneAt = now;
        }

        tracked.lastSeen = now;

        const dwellTime =
          (now.getTime() - tracked.enteredZoneAt.getTime()) / 1000;

        if (dwellTime >= thresholdSeconds) {
          results.push({
            detectionType: "loitering",
            confidence: obj.confidence,
            objects: [obj],
            metadata: {
              trackId: obj.trackId,
              zoneName: zone.name,
              dwellTimeSeconds: dwellTime,
            },
            requiresAlert: true,
          });
        }
      } else {
        // Object left zone
        const tracked = this.trackedObjects.get(obj.trackId);
        if (tracked?.enteredZoneAt) {
          tracked.enteredZoneAt = undefined;
        }
      }
    }

    this.cleanupOldTracks(now);

    return results;
  }

  /**
   * Detect crowd density in zone
   */
  async detectCrowdDensity(
    frame: DetectionFrame,
    objects: DetectedObject[],
    zone: Zone,
    threshold: number,
  ): Promise<DetectionResult[]> {
    if (zone.shape !== "polygon") {
      throw new Error("Crowd density detection requires polygon zones");
    }

    const peopleInZone: DetectedObject[] = [];

    for (const obj of objects) {
      if (obj.label !== "person") continue;

      const center = getBoundingBoxCenter(obj.boundingBox);
      const isInside = isPointInPolygon(center, zone.points);

      if (isInside) {
        peopleInZone.push(obj);
      }
    }

    if (peopleInZone.length >= threshold) {
      return [
        {
          detectionType: "crowd-density",
          confidence: Math.max(...peopleInZone.map((o) => o.confidence)),
          objects: peopleInZone,
          metadata: {
            zoneName: zone.name,
            personCount: peopleInZone.length,
            threshold,
          },
          requiresAlert: true,
        },
      ];
    }

    return [];
  }

  /**
   * Check if a line segment crosses another line segment
   */
  private checkLineCrossing(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    line: { start: { x: number; y: number }; end: { x: number; y: number } },
  ): boolean {
    const l1 = { x: p1.x, y: p1.y };
    const l2 = { x: p2.x, y: p2.y };
    const m1 = line.start;
    const m2 = line.end;

    const d1 = this.direction(m1, m2, l1);
    const d2 = this.direction(m1, m2, l2);
    const d3 = this.direction(l1, l2, m1);
    const d4 = this.direction(l1, l2, m2);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    return false;
  }

  private direction(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): number {
    return (p3.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p3.x - p1.x);
  }

  private getLineCrossingDirection(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    line: { start: { x: number; y: number }; end: { x: number; y: number } },
  ): "a-to-b" | "b-to-a" {
    const d1 = this.direction(line.start, line.end, p1);
    const d2 = this.direction(line.start, line.end, p2);

    return d1 < d2 ? "a-to-b" : "b-to-a";
  }

  private cleanupOldTracks(now: Date) {
    for (const [trackId, tracked] of this.trackedObjects.entries()) {
      if (now.getTime() - tracked.lastSeen.getTime() > this.TRACKING_TIMEOUT_MS) {
        this.trackedObjects.delete(trackId);
      }
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    // This method is not used directly; zone detection requires configuration
    return [];
  }

  async cleanup(): Promise<void> {
    this.trackedObjects.clear();
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: `Tracking ${this.trackedObjects.size} objects`,
    };
  }
}
