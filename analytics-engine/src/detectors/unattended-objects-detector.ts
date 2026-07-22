/**
 * Unattended and Removed Objects Detector
 * Detects objects left behind or removed from protected areas
 */

import {
  BaseDetector,
  type DetectedObject,
  type DetectionFrame,
  type DetectionResult,
  calculateIoU,
  getBoundingBoxCenter,
} from "./base-detector.js";

export interface UnattendedObjectsConfig {
  unattendedThresholdSeconds: number; // Time before object is considered unattended
  removedThresholdSeconds: number; // Time before absence is confirmed
  minObjectSize: number; // Minimum object size to track (0-1, normalized)
  ignoredClasses: string[]; // Objects to ignore (e.g., "person", "vehicle")
  protectedObjectsEnabled: boolean;
}

interface TrackedObject {
  id: string;
  label: string;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{
    bbox: { x: number; y: number; width: number; height: number };
    timestamp: Date;
  }>;
  associatedPerson?: string; // Track ID of person who placed it
  lastPersonProximity?: Date; // Last time a person was near
  isStationary: boolean;
  alerted: boolean;
}

interface ProtectedObject {
  id: string;
  name: string;
  zone: { x: number; y: number; width: number; height: number };
  lastSeen?: Date;
  missing: boolean;
}

export class UnattendedObjectsDetector extends BaseDetector {
  private config: UnattendedObjectsConfig;
  private trackedObjects = new Map<string, TrackedObject>();
  private protectedObjects = new Map<string, ProtectedObject>();
  private isInitialized = false;
  private readonly PROXIMITY_THRESHOLD = 100; // pixels
  private readonly STATIONARY_THRESHOLD = 10; // pixels movement to be considered stationary

  constructor(config: Partial<UnattendedObjectsConfig> = {}) {
    super("unattended-objects", "1.0.0");
    this.config = {
      unattendedThresholdSeconds: config.unattendedThresholdSeconds ?? 60, // 1 minute
      removedThresholdSeconds: config.removedThresholdSeconds ?? 30, // 30 seconds
      minObjectSize: config.minObjectSize ?? 0.01, // 1% of frame
      ignoredClasses: config.ignoredClasses ?? ["person", "vehicle", "car", "motorcycle"],
      protectedObjectsEnabled: config.protectedObjectsEnabled ?? false,
    };
  }

  async initialize(): Promise<void> {
    // No model needed - uses object tracking
    console.log("UnattendedObjectsDetector initialized");
    this.isInitialized = true;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("UnattendedObjectsDetector not initialized");
    }

    // This detector needs both object detections and person detections
    // It doesn't detect objects itself
    return [];
  }

  /**
   * Analyze objects for unattended/removed scenarios
   */
  async analyzeObjects(
    frame: DetectionFrame,
    objects: DetectedObject[],
    persons: DetectedObject[],
  ): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp;

    // Filter objects (exclude ignored classes)
    const relevantObjects = objects.filter(
      (obj) =>
        !this.config.ignoredClasses.includes(obj.label) &&
        obj.boundingBox.width * obj.boundingBox.height >= this.config.minObjectSize,
    );

    // Track objects
    const currentObjectIds = new Set<string>();

    for (const obj of relevantObjects) {
      if (!obj.trackId) continue;
      currentObjectIds.add(obj.trackId);

      let tracked = this.trackedObjects.get(obj.trackId);
      if (!tracked) {
        tracked = {
          id: obj.trackId,
          label: obj.label,
          firstSeen: now,
          lastSeen: now,
          positions: [],
          isStationary: false,
          alerted: false,
        };
        this.trackedObjects.set(obj.trackId, tracked);
      }

      tracked.lastSeen = now;
      tracked.positions.push({
        bbox: obj.boundingBox,
        timestamp: now,
      });

      // Keep only recent history (last 2 minutes)
      tracked.positions = tracked.positions.filter(
        (p) => now.getTime() - p.timestamp.getTime() < 120000,
      );

      // Check if object is stationary
      if (tracked.positions.length >= 3) {
        tracked.isStationary = this.isStationary(tracked.positions);
      }

      // Check person proximity
      const nearbyPerson = this.findNearbyPerson(obj, persons);
      if (nearbyPerson) {
        tracked.lastPersonProximity = now;
        if (!tracked.associatedPerson) {
          tracked.associatedPerson = nearbyPerson.trackId;
        }
      }

      // Detect unattended object
      if (
        tracked.isStationary &&
        !tracked.alerted &&
        tracked.associatedPerson
      ) {
        const timeSincePersonLeft = tracked.lastPersonProximity
          ? (now.getTime() - tracked.lastPersonProximity.getTime()) / 1000
          : (now.getTime() - tracked.firstSeen.getTime()) / 1000;

        if (timeSincePersonLeft >= this.config.unattendedThresholdSeconds) {
          tracked.alerted = true;
          results.push({
            detectionType: "unattended-object",
            confidence: 0.9,
            objects: [obj],
            metadata: {
              trackId: obj.trackId,
              label: obj.label,
              duration: Math.round(timeSincePersonLeft),
              threshold: this.config.unattendedThresholdSeconds,
              associatedPerson: tracked.associatedPerson,
            },
            requiresAlert: true,
          });
        }
      }
    }

    // Check protected objects for removal
    if (this.config.protectedObjectsEnabled) {
      for (const [id, protected] of this.protectedObjects.entries()) {
        // Check if protected object is still present
        const stillPresent = relevantObjects.some((obj) =>
          this.isInZone(obj.boundingBox, protected.zone),
        );

        if (stillPresent) {
          protected.lastSeen = now;
          protected.missing = false;
        } else if (protected.lastSeen) {
          const timeSinceSeen =
            (now.getTime() - protected.lastSeen.getTime()) / 1000;

          if (
            !protected.missing &&
            timeSinceSeen >= this.config.removedThresholdSeconds
          ) {
            protected.missing = true;
            results.push({
              detectionType: "removed-object",
              confidence: 0.95,
              objects: [],
              metadata: {
                protectedObjectId: id,
                protectedObjectName: protected.name,
                timeSinceSeen: Math.round(timeSinceSeen),
                zone: protected.zone,
              },
              requiresAlert: true,
            });
          }
        }
      }
    }

    // Cleanup old tracked objects
    for (const [id, tracked] of this.trackedObjects.entries()) {
      if (!currentObjectIds.has(id)) {
        const timeSinceLastSeen =
          (now.getTime() - tracked.lastSeen.getTime()) / 1000;
        // Remove from tracking after 5 minutes
        if (timeSinceLastSeen > 300) {
          this.trackedObjects.delete(id);
        }
      }
    }

    return results;
  }

  /**
   * Check if object is stationary
   */
  private isStationary(
    positions: Array<{
      bbox: { x: number; y: number; width: number; height: number };
      timestamp: Date;
    }>,
  ): boolean {
    if (positions.length < 3) return false;

    // Calculate movement of centroid
    const recentPositions = positions.slice(-5);
    let maxMovement = 0;

    for (let i = 0; i < recentPositions.length - 1; i++) {
      const center1 = getBoundingBoxCenter(recentPositions[i]!.bbox);
      const center2 = getBoundingBoxCenter(recentPositions[i + 1]!.bbox);

      const dx = center2.x - center1.x;
      const dy = center2.y - center1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      maxMovement = Math.max(maxMovement, distance);
    }

    return maxMovement < this.STATIONARY_THRESHOLD;
  }

  /**
   * Find nearby person
   */
  private findNearbyPerson(
    obj: DetectedObject,
    persons: DetectedObject[],
  ): DetectedObject | null {
    const objCenter = getBoundingBoxCenter(obj.boundingBox);

    for (const person of persons) {
      const personCenter = getBoundingBoxCenter(person.boundingBox);
      const dx = personCenter.x - objCenter.x;
      const dy = personCenter.y - objCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < this.PROXIMITY_THRESHOLD) {
        return person;
      }
    }

    return null;
  }

  /**
   * Check if object is in protected zone
   */
  private isInZone(
    bbox: { x: number; y: number; width: number; height: number },
    zone: { x: number; y: number; width: number; height: number },
  ): boolean {
    const iou = calculateIoU(bbox, zone);
    return iou > 0.3; // At least 30% overlap
  }

  /**
   * Register protected object
   */
  registerProtectedObject(
    id: string,
    name: string,
    zone: { x: number; y: number; width: number; height: number },
  ): void {
    this.protectedObjects.set(id, {
      id,
      name,
      zone,
      lastSeen: new Date(),
      missing: false,
    });
    console.log(`Registered protected object: ${name}`);
  }

  /**
   * Unregister protected object
   */
  unregisterProtectedObject(id: string): void {
    this.protectedObjects.delete(id);
  }

  /**
   * Get list of protected objects
   */
  getProtectedObjects(): ProtectedObject[] {
    return Array.from(this.protectedObjects.values());
  }

  /**
   * Get list of tracked objects
   */
  getTrackedObjects(): TrackedObject[] {
    return Array.from(this.trackedObjects.values());
  }

  async cleanup(): Promise<void> {
    this.trackedObjects.clear();
    this.protectedObjects.clear();
    this.isInitialized = false;
  }

  getHealth() {
    return {
      status: this.isInitialized ? ("healthy" as const) : ("unhealthy" as const),
      details: this.isInitialized
        ? `Unattended objects detector operational`
        : "Unattended objects detector not initialized",
      metadata: {
        trackedObjects: this.trackedObjects.size,
        protectedObjects: this.protectedObjects.size,
        protectedObjectsEnabled: this.config.protectedObjectsEnabled,
      },
    };
  }
}
