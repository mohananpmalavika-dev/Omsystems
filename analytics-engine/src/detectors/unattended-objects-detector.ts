/**
 * Unattended and Abandoned Objects Detector
 * 
 * Production-ready static foreground blob tracking for bags, boxes, or parcels
 * left in sensitive and sterile surveillance zones.
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
  abandonedThresholdSeconds: number;  // Time before object is escalated to abandoned
  removedThresholdSeconds: number;    // Time before absence is confirmed
  minObjectSize: number;              // Minimum object size to track (normalized 0-1)
  stationaryThresholdPixels: number;  // Centroid drift limit for stationary state
  ownerProximityPixels: number;       // Distance beyond which owner is separated
  ignoredClasses: string[];           // Objects to ignore (e.g., "person", "vehicle")
  protectedObjectsEnabled: boolean;
}

interface TrackedObject {
  id: string;
  label: string;
  firstSeen: Date;
  lastSeen: Date;
  stationarySince: Date;
  positions: Array<{
    bbox: { x: number; y: number; width: number; height: number };
    timestamp: Date;
  }>;
  associatedPerson?: string;
  ownerDistancePx?: number;
  lastPersonProximity?: Date;
  isStationary: boolean;
  consecutiveStationaryFrames: number;
  alerted: boolean;
}

interface ProtectedObject {
  id: string;
  name: string;
  zone: { x: number; y: number; width: number; height: number };
  lastSeen?: Date;
  missing: boolean;
}

interface FrameTrackerState {
  backgroundModel?: Uint8Array;
  lastObservedAt: Date;
  trackedBlobs: Map<string, {
    id: string;
    bbox: { x: number; y: number; width: number; height: number };
    centroid: { x: number; y: number };
    stationarySince: Date;
    consecutiveFrames: number;
    alerted: boolean;
  }>;
}

export class UnattendedObjectsDetector extends BaseDetector {
  private config: UnattendedObjectsConfig;
  private trackedObjects = new Map<string, TrackedObject>();
  private protectedObjects = new Map<string, ProtectedObject>();
  private cameraFrameStates = new Map<string, FrameTrackerState>();
  private isInitialized = false;

  constructor(config: Partial<UnattendedObjectsConfig> = {}) {
    super("unattended-objects", "2.0.0");
    this.config = {
      unattendedThresholdSeconds: config.unattendedThresholdSeconds ?? 45,
      abandonedThresholdSeconds: config.abandonedThresholdSeconds ?? 120,
      removedThresholdSeconds: config.removedThresholdSeconds ?? 30,
      minObjectSize: config.minObjectSize ?? 0.005,
      stationaryThresholdPixels: config.stationaryThresholdPixels ?? 15,
      ownerProximityPixels: config.ownerProximityPixels ?? 120,
      ignoredClasses: config.ignoredClasses ?? ["person", "car", "motorcycle", "bus", "truck"],
      protectedObjectsEnabled: config.protectedObjectsEnabled ?? false,
    };
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
    console.log("UnattendedObjectsDetector initialized with static blob tracking engine");
  }

  /**
   * Direct frame buffer detection using pixel-level difference and static blob tracking
   */
  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("UnattendedObjectsDetector not initialized");
    }

    const results: DetectionResult[] = [];
    const buffer = frame.imageData;
    if (!buffer || buffer.length === 0) {
      return results;
    }

    const width = frame.width || 64;
    const height = frame.height || 36;
    const now = frame.timestamp || new Date();
    const pixelCount = width * height;

    let state = this.cameraFrameStates.get(frame.cameraId);
    if (!state) {
      state = {
        lastObservedAt: now,
        trackedBlobs: new Map(),
      };
      this.cameraFrameStates.set(frame.cameraId, state);
    }

    // 1. Convert to luma
    const luma = new Uint8Array(pixelCount);
    const channels = buffer.length >= pixelCount * 3 ? 3 : 1;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * channels;
      const r = buffer[idx] ?? 0;
      const g = buffer[idx + 1] ?? 0;
      const b = buffer[idx + 2] ?? 0;
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // 2. Initialize or update running background
    if (!state.backgroundModel || state.backgroundModel.length !== pixelCount) {
      state.backgroundModel = new Uint8Array(luma);
      return results;
    }

    // 3. Grid-based block difference analysis (8x8 blocks)
    const gridSize = 8;
    const cols = Math.floor(width / gridSize);
    const rows = Math.floor(height / gridSize);
    const activeBlocks: Array<{ gx: number; gy: number }> = [];

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        let diffCount = 0;
        const startX = gx * gridSize;
        const startY = gy * gridSize;

        for (let y = startY; y < startY + gridSize && y < height; y++) {
          for (let x = startX; x < startX + gridSize && x < width; x++) {
            const idx = y * width + x;
            const diff = Math.abs((luma[idx] ?? 0) - (state.backgroundModel[idx] ?? 0));
            if (diff > 25) {
              diffCount++;
            }
          }
        }

        if (diffCount >= (gridSize * gridSize) * 0.3) {
          activeBlocks.push({ gx, gy });
        }
      }
    }

    // Slowly adapt background where no major difference exists
    for (let i = 0; i < pixelCount; i++) {
      const diff = Math.abs((luma[i] ?? 0) - (state.backgroundModel[i] ?? 0));
      if (diff <= 25) {
        state.backgroundModel[i] = Math.round((state.backgroundModel[i] ?? 0) * 0.95 + (luma[i] ?? 0) * 0.05);
      }
    }

    // 4. Cluster active blocks into candidate foreground blobs
    if (activeBlocks.length > 0) {
      let minGx = activeBlocks[0]!.gx;
      let maxGx = activeBlocks[0]!.gx;
      let minGy = activeBlocks[0]!.gy;
      let maxGy = activeBlocks[0]!.gy;

      for (const b of activeBlocks) {
        minGx = Math.min(minGx, b.gx);
        maxGx = Math.max(maxGx, b.gx);
        minGy = Math.min(minGy, b.gy);
        maxGy = Math.max(maxGy, b.gy);
      }

      const candidateBbox = {
        x: (minGx * gridSize) / width,
        y: (minGy * gridSize) / height,
        width: ((maxGx - minGx + 1) * gridSize) / width,
        height: ((maxGy - minGy + 1) * gridSize) / height,
      };

      const candidateCentroid = {
        x: (candidateBbox.x + candidateBbox.width / 2) * width,
        y: (candidateBbox.y + candidateBbox.height / 2) * height,
      };

      // Match against tracked blobs in state
      let matched = false;
      for (const [id, blob] of state.trackedBlobs.entries()) {
        const dx = candidateCentroid.x - blob.centroid.x;
        const dy = candidateCentroid.y - blob.centroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.config.stationaryThresholdPixels) {
          matched = true;
          blob.consecutiveFrames++;
          const dwellSeconds = (now.getTime() - blob.stationarySince.getTime()) / 1000;

          if (blob.consecutiveFrames >= 3 && dwellSeconds >= this.config.unattendedThresholdSeconds && !blob.alerted) {
            blob.alerted = true;
            const isAbandoned = dwellSeconds >= this.config.abandonedThresholdSeconds;

            results.push({
              detectionType: isAbandoned ? "abandoned-object" : "unattended-object",
              confidence: 0.91,
              objects: [{
                label: "suspicious_package",
                confidence: 0.91,
                boundingBox: candidateBbox,
                trackId: id,
              }],
              metadata: {
                trackId: id,
                dwellTimeSeconds: Math.round(dwellSeconds),
                thresholdSeconds: this.config.unattendedThresholdSeconds,
                classification: "parcel",
                isStationary: true,
                severity: isAbandoned ? "P1" : "P2",
              },
              requiresAlert: true,
            });
          }
          break;
        }
      }

      if (!matched) {
        const blobId = `static-blob-${now.getTime()}`;
        state.trackedBlobs.set(blobId, {
          id: blobId,
          bbox: candidateBbox,
          centroid: candidateCentroid,
          stationarySince: now,
          consecutiveFrames: 1,
          alerted: false,
        });
      }
    }

    return results;
  }

  /**
   * Analyze high-level objects and persons for unattended/removed scenarios
   */
  async analyzeObjects(
    frame: DetectionFrame,
    objects: DetectedObject[],
    persons: DetectedObject[],
  ): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp || new Date();

    const relevantObjects = objects.filter(
      (obj) =>
        !this.config.ignoredClasses.includes(obj.label) &&
        obj.boundingBox.width * obj.boundingBox.height >= this.config.minObjectSize,
    );

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
          stationarySince: now,
          positions: [],
          isStationary: false,
          consecutiveStationaryFrames: 0,
          alerted: false,
        };
        this.trackedObjects.set(obj.trackId, tracked);
      }

      tracked.lastSeen = now;
      tracked.positions.push({
        bbox: obj.boundingBox,
        timestamp: now,
      });

      if (tracked.positions.length > 30) {
        tracked.positions.shift();
      }

      // Evaluate stationary movement
      if (tracked.positions.length >= 3) {
        const stationary = this.isStationary(tracked.positions);
        if (stationary) {
          tracked.consecutiveStationaryFrames++;
          tracked.isStationary = true;
        } else {
          tracked.stationarySince = now;
          tracked.consecutiveStationaryFrames = 0;
          tracked.isStationary = false;
          tracked.alerted = false;
        }
      }

      // Check person proximity
      const { person, distance } = this.findNearbyPerson(obj, persons);
      tracked.ownerDistancePx = distance;
      if (person) {
        tracked.lastPersonProximity = now;
        if (!tracked.associatedPerson) {
          tracked.associatedPerson = person.trackId;
        }
      }

      // Detect unattended object
      if (tracked.isStationary && !tracked.alerted && tracked.consecutiveStationaryFrames >= 3) {
        const timeSincePersonLeft = tracked.lastPersonProximity
          ? (now.getTime() - tracked.lastPersonProximity.getTime()) / 1000
          : (now.getTime() - tracked.stationarySince.getTime()) / 1000;

        if (timeSincePersonLeft >= this.config.unattendedThresholdSeconds) {
          tracked.alerted = true;
          const isAbandoned = timeSincePersonLeft >= this.config.abandonedThresholdSeconds;

          results.push({
            detectionType: isAbandoned ? "abandoned-object" : "unattended-object",
            confidence: 0.92,
            objects: [obj],
            metadata: {
              trackId: obj.trackId,
              label: obj.label,
              duration: Math.round(timeSincePersonLeft),
              dwellTimeSeconds: Math.round(timeSincePersonLeft),
              threshold: this.config.unattendedThresholdSeconds,
              associatedPerson: tracked.associatedPerson,
              ownerDistancePixels: tracked.ownerDistancePx,
              severity: isAbandoned ? "P1" : "P2",
            },
            requiresAlert: true,
          });
        }
      }
    }

    // Check protected objects for removal
    if (this.config.protectedObjectsEnabled) {
      for (const [id, protectedObj] of this.protectedObjects.entries()) {
        const stillPresent = relevantObjects.some((obj) =>
          this.isInZone(obj.boundingBox, protectedObj.zone),
        );

        if (stillPresent) {
          protectedObj.lastSeen = now;
          protectedObj.missing = false;
        } else if (protectedObj.lastSeen) {
          const timeSinceSeen = (now.getTime() - protectedObj.lastSeen.getTime()) / 1000;

          if (!protectedObj.missing && timeSinceSeen >= this.config.removedThresholdSeconds) {
            protectedObj.missing = true;
            results.push({
              detectionType: "removed-object",
              confidence: 0.95,
              objects: [],
              metadata: {
                protectedObjectId: id,
                protectedObjectName: protectedObj.name,
                timeSinceSeen: Math.round(timeSinceSeen),
                zone: protectedObj.zone,
                severity: "P2",
              },
              requiresAlert: true,
            });
          }
        }
      }
    }

    // Cleanup stale tracks
    for (const [id, tracked] of this.trackedObjects.entries()) {
      if (!currentObjectIds.has(id)) {
        const elapsed = (now.getTime() - tracked.lastSeen.getTime()) / 1000;
        if (elapsed > 180) {
          this.trackedObjects.delete(id);
        }
      }
    }

    return results;
  }

  private isStationary(
    positions: Array<{
      bbox: { x: number; y: number; width: number; height: number };
      timestamp: Date;
    }>,
  ): boolean {
    if (positions.length < 3) return false;
    const recent = positions.slice(-5);
    let maxDist = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      const c1 = getBoundingBoxCenter(recent[i]!.bbox);
      const c2 = getBoundingBoxCenter(recent[i + 1]!.bbox);
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      maxDist = Math.max(maxDist, d);
    }

    // Normalized coordinate threshold (e.g. 0.02 of frame)
    return maxDist < 0.03;
  }

  private findNearbyPerson(
    obj: DetectedObject,
    persons: DetectedObject[],
  ): { person: DetectedObject | null; distance: number } {
    const objCenter = getBoundingBoxCenter(obj.boundingBox);
    let minDistance = Number.POSITIVE_INFINITY;
    let closest: DetectedObject | null = null;

    for (const person of persons) {
      const personCenter = getBoundingBoxCenter(person.boundingBox);
      const dx = personCenter.x - objCenter.x;
      const dy = personCenter.y - objCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        closest = person;
      }
    }

    // If normalized distance < 0.15 (equivalent to ~120px in 800px width)
    if (minDistance < 0.15) {
      return { person: closest, distance: Math.round(minDistance * 1000) };
    }

    return { person: null, distance: Math.round(minDistance * 1000) };
  }

  private isInZone(
    bbox: { x: number; y: number; width: number; height: number },
    zone: { x: number; y: number; width: number; height: number },
  ): boolean {
    const iou = calculateIoU(bbox, zone);
    return iou > 0.25;
  }

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
  }

  unregisterProtectedObject(id: string): void {
    this.protectedObjects.delete(id);
  }

  getProtectedObjects(): ProtectedObject[] {
    return Array.from(this.protectedObjects.values());
  }

  getTrackedObjects(): TrackedObject[] {
    return Array.from(this.trackedObjects.values());
  }

  async cleanup(): Promise<void> {
    this.trackedObjects.clear();
    this.protectedObjects.clear();
    this.cameraFrameStates.clear();
    this.isInitialized = false;
  }

  getHealth() {
    return {
      status: this.isInitialized ? ("healthy" as const) : ("unhealthy" as const),
      details: this.isInitialized
        ? "Unattended objects detector operational with dual-mode static tracking"
        : "Unattended objects detector not initialized",
      metadata: {
        trackedObjects: this.trackedObjects.size,
        protectedObjects: this.protectedObjects.size,
        activeCamerasTracked: this.cameraFrameStates.size,
        protectedObjectsEnabled: this.config.protectedObjectsEnabled,
        unattendedThresholdSeconds: this.config.unattendedThresholdSeconds,
        abandonedThresholdSeconds: this.config.abandonedThresholdSeconds,
      },
    };
  }
}
