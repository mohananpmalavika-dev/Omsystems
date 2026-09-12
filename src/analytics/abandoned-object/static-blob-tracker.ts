/**
 * Static Foreground Blob Tracker & Spatial Analytics
 * 
 * Production mathematical computer vision engine providing:
 * 1. ITU-R BT.601 Photometric Luminance Conversion
 * 2. Background differencing & foreground spatial component agglomeration
 * 3. Centroid Euclidean drift and IoU tracking
 * 4. Continuous stationary dwell time accumulation
 * 5. Ray-casting Jordan curve point-in-polygon zone containment
 * 6. Depositor / owner proximity and separation kinematics
 * 7. Threat severity and object categorization heuristics
 */

import type {
  BoundingBox,
  PolygonPoint,
  TrackedBlob,
  AbandonedObjectZoneRecord,
  DetectedPersonObservation,
  AbandonedObjectType,
  AbandonedEventType,
  AbandonedSeverity,
  FrameAnalysisResult,
  AbandonedObjectConfigRecord,
} from './types.js';

export class StaticBlobTracker {
  private readonly trackedBlobs = new Map<string, TrackedBlob>();
  private backgroundModel: Uint8Array | null = null;
  private bgWidth = 0;
  private bgHeight = 0;

  constructor(
    private readonly defaultStationaryThresholdPx = 12.0,
    private readonly defaultOwnerProximityPx = 120.0,
  ) {}

  /**
   * Projects raw RGB/RGBA frame buffer into ITU-R BT.601 photometric luminance
   */
  public static extractLuma(
    buffer: Uint8Array,
    width: number,
    height: number,
    channels = 3
  ): Uint8Array {
    const pixels = width * height;
    const luma = new Uint8Array(pixels);

    for (let i = 0; i < pixels; i++) {
      const srcIdx = i * channels;
      const r = buffer[srcIdx] ?? 0;
      const g = buffer[srcIdx + 1] ?? 0;
      const b = buffer[srcIdx + 2] ?? 0;
      // Y = 0.299*R + 0.587*G + 0.114*B
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return luma;
  }

  /**
   * Initializes or updates running background model with temporal smoothing
   */
  public updateBackground(luma: Uint8Array, width: number, height: number, learningRate = 0.05): void {
    const pixels = width * height;
    if (!this.backgroundModel || this.bgWidth !== width || this.bgHeight !== height) {
      this.backgroundModel = new Uint8Array(luma);
      this.bgWidth = width;
      this.bgHeight = height;
      return;
    }

    for (let i = 0; i < pixels; i++) {
      const current = luma[i] ?? 0;
      const bg = this.backgroundModel[i] ?? 0;
      this.backgroundModel[i] = Math.round((1 - learningRate) * bg + learningRate * current);
    }
  }

  /**
   * Detects foreground difference blobs against background model
   */
  public detectForegroundBlobs(
    luma: Uint8Array,
    width: number,
    height: number,
    threshold = 28,
    minArea = 100,
    maxArea = 60000
  ): BoundingBox[] {
    if (!this.backgroundModel || this.bgWidth !== width || this.bgHeight !== height) {
      this.updateBackground(luma, width, height, 1.0);
      return [];
    }

    const gridSize = 8;
    const gridCols = Math.floor(width / gridSize);
    const gridRows = Math.floor(height / gridSize);
    const gridActivity = new Uint8Array(gridCols * gridRows);

    // Compute block-level difference density
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let diffCount = 0;
        const startX = gx * gridSize;
        const startY = gy * gridSize;

        for (let y = startY; y < startY + gridSize && y < height; y++) {
          for (let x = startX; x < startX + gridSize && x < width; x++) {
            const idx = y * width + x;
            const diff = Math.abs((luma[idx] ?? 0) - (this.backgroundModel[idx] ?? 0));
            if (diff > threshold) {
              diffCount++;
            }
          }
        }

        if (diffCount >= (gridSize * gridSize) * 0.25) {
          gridActivity[gy * gridCols + gx] = 1;
        }
      }
    }

    // Connected-component bounding box agglomeration over active blocks
    const visited = new Uint8Array(gridCols * gridRows);
    const blobs: BoundingBox[] = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const index = gy * gridCols + gx;
        if ((gridActivity[index] ?? 0) === 0 || (visited[index] ?? 0) === 1) {
          continue;
        }

        // BFS flood fill
        let minX = gx;
        let maxX = gx;
        let minY = gy;
        let maxY = gy;
        const queue: Array<[number, number]> = [[gx, gy]];
        visited[index] = 1;

        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          const [cx, cy] = item;

          const neighbors: Array<[number, number]> = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
              const nIdx = ny * gridCols + nx;
              if ((gridActivity[nIdx] ?? 0) === 1 && (visited[nIdx] ?? 0) === 0) {
                visited[nIdx] = 1;
                minX = Math.min(minX, nx);
                maxX = Math.max(maxX, nx);
                minY = Math.min(minY, ny);
                maxY = Math.max(maxY, ny);
                queue.push([nx, ny]);
              }
            }
          }
        }

        const bbox: BoundingBox = {
          x: minX * gridSize,
          y: minY * gridSize,
          width: (maxX - minX + 1) * gridSize,
          height: (maxY - minY + 1) * gridSize,
        };

        const area = bbox.width * bbox.height;
        if (area >= minArea && area <= maxArea) {
          blobs.push(bbox);
        }
      }
    }

    return blobs;
  }

  /**
   * Ray-casting Point-In-Polygon (Jordan Curve Theorem)
   */
  public static isPointInPolygon(point: { x: number; y: number }, polygon: PolygonPoint[]): boolean {
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const p1 = polygon[i];
      const p2 = polygon[j];
      if (!p1 || !p2) continue;

      const xi = p1.x;
      const yi = p1.y;
      const xj = p2.x;
      const yj = p2.y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Calculates Intersection over Union (IoU) between two bounding boxes
   */
  public static computeIoU(b1: BoundingBox, b2: BoundingBox): number {
    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
    const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

    const intersectionWidth = Math.max(0, x2 - x1);
    const intersectionHeight = Math.max(0, y2 - y1);
    const intersectionArea = intersectionWidth * intersectionHeight;

    const b1Area = b1.width * b1.height;
    const b2Area = b2.width * b2.height;
    const unionArea = b1Area + b2Area - intersectionArea;

    if (unionArea <= 0) return 0;
    return intersectionArea / unionArea;
  }

  /**
   * Euclidean distance between centroids
   */
  public static getCentroidDistance(
    c1: { x: number; y: number },
    c2: { x: number; y: number }
  ): number {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Categorizes object type based on bounding box geometry and aspect ratio
   */
  public static classifyBlob(bbox: BoundingBox): AbandonedObjectType {
    const ar = bbox.width / Math.max(1, bbox.height);
    const area = bbox.width * bbox.height;

    if (area > 15000) {
      return ar > 1.25 ? 'duffel_bag' : 'suitcase';
    }
    if (area >= 4000) {
      if (ar >= 0.8 && ar <= 1.25) return 'box';
      if (ar > 1.25) return 'suitcase';
      return 'backpack';
    }
    if (area >= 1200) {
      if (ar >= 0.75 && ar <= 1.3) return 'parcel';
      return 'backpack';
    }
    if (area >= 300) {
      return 'handbag';
    }
    return 'generic_blob';
  }

  /**
   * Correlates nearest detected person and measures separation distance
   */
  public static correlatePersonProximity(
    blobCentroid: { x: number; y: number },
    persons: DetectedPersonObservation[]
  ): { closestPerson: DetectedPersonObservation | null; distancePx: number } {
    if (!persons || persons.length === 0) {
      return { closestPerson: null, distancePx: Number.POSITIVE_INFINITY };
    }

    let minDistance = Number.POSITIVE_INFINITY;
    let closest: DetectedPersonObservation | null = null;

    for (const p of persons) {
      const pCentroid = {
        x: p.boundingBox.x + p.boundingBox.width / 2,
        y: p.boundingBox.y + p.boundingBox.height / 2,
      };
      const d = StaticBlobTracker.getCentroidDistance(blobCentroid, pCentroid);
      if (d < minDistance) {
        minDistance = d;
        closest = p;
      }
    }

    return { closestPerson: closest, distancePx: minDistance };
  }

  /**
   * Main multi-frame tracking pipeline.
   * Ingests candidate foreground bounding boxes and person detections,
   * updates temporal stationary state, evaluates sensitive zones, and detects unattended items.
   */
  public processFrameBlobs(params: {
    candidateBlobs: BoundingBox[];
    persons: DetectedPersonObservation[];
    zones: AbandonedObjectZoneRecord[];
    timestamp?: Date;
    config?: Partial<AbandonedObjectConfigRecord>;
  }): FrameAnalysisResult {
    const now = params.timestamp ?? new Date();
    const candidateBlobs = params.candidateBlobs;
    const persons = params.persons || [];
    const zones = params.zones.filter((z) => z.enabled);
    const stationaryLimitPx = params.config?.stationary_pixel_threshold ?? this.defaultStationaryThresholdPx;
    const ownerProximityLimitPx = params.config?.owner_proximity_threshold_px ?? this.defaultOwnerProximityPx;
    const debounceFrames = params.config?.debounce_frames ?? 3;

    const matchedBlobIds = new Set<string>();

    // 1. Associate incoming candidate blobs with existing tracked blobs
    for (const bbox of candidateBlobs) {
      const centroid = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      };
      const area = bbox.width * bbox.height;

      let bestMatch: TrackedBlob | null = null;
      let minCentroidDist = Number.POSITIVE_INFINITY;

      for (const [id, tracked] of this.trackedBlobs.entries()) {
        if (matchedBlobIds.has(id)) continue;

        const dist = StaticBlobTracker.getCentroidDistance(centroid, tracked.centroid);
        const iou = StaticBlobTracker.computeIoU(bbox, tracked.currentBbox);

        if ((dist < 40 || iou > 0.3) && dist < minCentroidDist) {
          minCentroidDist = dist;
          bestMatch = tracked;
        }
      }

      if (bestMatch) {
        matchedBlobIds.add(bestMatch.blobId);
        bestMatch.lastSeen = now;
        bestMatch.positions.push({ bbox, timestamp: now });

        // Keep last 30 positions
        if (bestMatch.positions.length > 30) {
          bestMatch.positions.shift();
        }

        // Measure displacement from last stationary anchor
        const drift = StaticBlobTracker.getCentroidDistance(centroid, bestMatch.centroid);
        if (drift <= stationaryLimitPx) {
          bestMatch.consecutiveStationaryFrames++;
          bestMatch.isStationary = true;
          bestMatch.stationaryDurationSec = Math.max(
            0,
            Math.round((now.getTime() - bestMatch.stationarySince.getTime()) / 1000)
          );
        } else {
          // Moved significantly -> reset stationary clock
          bestMatch.stationarySince = now;
          bestMatch.consecutiveStationaryFrames = 0;
          bestMatch.isStationary = false;
          bestMatch.stationaryDurationSec = 0;
          bestMatch.alerted = false;
        }

        bestMatch.currentBbox = bbox;
        bestMatch.centroid = centroid;
        bestMatch.area = area;
      } else {
        // New tracked blob
        const newId = `blob-${now.getTime()}-${Math.floor(Math.random() * 10000)}`;
        const classification = StaticBlobTracker.classifyBlob(bbox);

        const newBlob: TrackedBlob = {
          blobId: newId,
          firstSeen: now,
          lastSeen: now,
          stationarySince: now,
          positions: [{ bbox, timestamp: now }],
          currentBbox: bbox,
          centroid,
          area,
          isStationary: true,
          stationaryDurationSec: 0,
          consecutiveStationaryFrames: 1,
          classification,
          status: 'detected',
          alerted: false,
        };

        this.trackedBlobs.set(newId, newBlob);
        matchedBlobIds.add(newId);
      }
    }

    // 2. Evaluate zones, owner proximity, and trigger conditions
    const alertBlobs: FrameAnalysisResult['blobs'] = [];

    for (const [id, blob] of this.trackedBlobs.entries()) {
      // Clean up disappeared blobs after 120 seconds
      if ((now.getTime() - blob.lastSeen.getTime()) / 1000 > 120) {
        this.trackedBlobs.delete(id);
        continue;
      }

      // Find matching sensitive zone
      let matchingZone: AbandonedObjectZoneRecord | null = null;
      for (const zone of zones) {
        if (StaticBlobTracker.isPointInPolygon(blob.centroid, zone.polygon)) {
          matchingZone = zone;
          break;
        }
      }
      blob.assignedZone = matchingZone;

      // Correlate with detected persons in frame
      const { closestPerson, distancePx } = StaticBlobTracker.correlatePersonProximity(
        blob.centroid,
        persons
      );

      blob.ownerDistancePx = Number.isFinite(distancePx) ? Math.round(distancePx) : null;

      if (closestPerson && distancePx <= ownerProximityLimitPx) {
        // Owner/person is nearby
        blob.associatedOwnerId = closestPerson.trackId;
        blob.ownerLastSeen = now;
      }

      // Check stationary threshold
      const unattendedThresholdSec = matchingZone?.unattended_threshold_seconds ?? (params.config?.default_unattended_threshold_sec ?? 60);
      const abandonedThresholdSec = matchingZone?.abandoned_threshold_seconds ?? (params.config?.default_abandoned_threshold_sec ?? 180);

      const isPersonSeparated =
        !blob.associatedOwnerId ||
        !blob.ownerLastSeen ||
        (now.getTime() - blob.ownerLastSeen.getTime()) / 1000 >= 10 ||
        (blob.ownerDistancePx !== null && blob.ownerDistancePx > ownerProximityLimitPx);

      if (
        blob.isStationary &&
        blob.consecutiveStationaryFrames >= debounceFrames &&
        isPersonSeparated
      ) {
        let eventType: AbandonedEventType = 'unattended_object';
        let severity: AbandonedSeverity = 'P3';

        // Staged escalation logic
        if (blob.stationaryDurationSec >= abandonedThresholdSec) {
          eventType = 'abandoned_object';
          severity = matchingZone?.sensitivity === 'critical' ? 'P1' : 'P2';
        } else if (blob.stationaryDurationSec >= unattendedThresholdSec) {
          eventType = 'unattended_object';
          if (matchingZone?.zone_type === 'sterile_zone' || matchingZone?.zone_type === 'vault_perimeter') {
            severity = 'P1';
            eventType = 'suspicious_package';
          } else if (matchingZone?.zone_type === 'cash_counter' || matchingZone?.zone_type === 'atm_vestibule') {
            severity = 'P2';
          } else {
            severity = 'P3';
          }
        }

        const requiresAlert = blob.stationaryDurationSec >= unattendedThresholdSec;

        if (requiresAlert) {
          blob.alerted = true;
          blob.alertSeverity = severity;
          blob.alertType = eventType;

          alertBlobs.push({
            blobId: blob.blobId,
            objectType: blob.classification,
            eventType,
            severity,
            confidence: Math.min(0.98, 0.75 + (blob.stationaryDurationSec / 300) * 0.2),
            boundingBox: blob.currentBbox,
            dwellTimeSeconds: blob.stationaryDurationSec,
            zoneName: matchingZone?.zone_name,
            zoneType: matchingZone?.zone_type,
            ownerTrackId: blob.associatedOwnerId,
            ownerDistancePixels: blob.ownerDistancePx,
            requiresAlert: true,
          });
        }
      }
    }

    // Determine highest severity
    let highestSeverity: AbandonedSeverity | null = null;
    if (alertBlobs.some((b) => b.severity === 'P1')) highestSeverity = 'P1';
    else if (alertBlobs.some((b) => b.severity === 'P2')) highestSeverity = 'P2';
    else if (alertBlobs.some((b) => b.severity === 'P3')) highestSeverity = 'P3';
    else if (alertBlobs.length > 0) highestSeverity = 'P4';

    return {
      isUnattendedOrAbandoned: alertBlobs.length > 0,
      blobs: alertBlobs,
      summary: {
        totalStaticBlobs: Array.from(this.trackedBlobs.values()).filter((b) => b.isStationary).length,
        activeAlerts: alertBlobs.length,
        highestSeverity,
      },
    };
  }

  public getTrackedBlobs(): TrackedBlob[] {
    return Array.from(this.trackedBlobs.values());
  }

  public clear(): void {
    this.trackedBlobs.clear();
    this.backgroundModel = null;
    this.bgWidth = 0;
    this.bgHeight = 0;
  }
}
