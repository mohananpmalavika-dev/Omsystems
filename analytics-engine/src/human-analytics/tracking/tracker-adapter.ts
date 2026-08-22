/**
 * Tracker Adapter
 * Wraps tracking algorithms (ByteTrack, BoT-SORT) and manages track lifecycle
 */

import { randomUUID } from "node:crypto";
import type { PersonObservation, PersonTrack, BoundingBox, Point2D } from "../types.js";

interface DetectionInput {
  boundingBox: BoundingBox;
  confidence: number;
  trackId?: string;
}

/**
 * Track association using IoU and appearance similarity
 */
export class TrackerAdapter {
  private tracks = new Map<string, PersonTrack>();
  private nextTrackId = 1;

  private readonly TRACKING_TIMEOUT_MS = 5000;
  private readonly MIN_CONFIRMATION_FRAMES = 3;
  private readonly IOU_THRESHOLD = 0.3;
  private readonly APPEARANCE_WEIGHT = 0.4;

  constructor(
    private readonly cameraId: string,
    private readonly tenantId: string,
  ) {}

  /**
   * Update tracking with new detections
   */
  updateTracking(
    detections: DetectionInput[],
    timestamp: Date,
    frameId: string,
  ): PersonObservation[] {
    const observations: PersonObservation[] = [];
    const matchedTrackIds = new Set<string>();

    // Match detections to existing tracks
    for (const detection of detections) {
      const matchedTrack = this.findMatchingTrack(detection, timestamp);

      if (matchedTrack) {
        // Update existing track
        const observation = this.createObservation(
          matchedTrack.trackId,
          detection,
          timestamp,
          frameId,
        );
        this.updateTrack(matchedTrack, observation);
        observations.push(observation);
        matchedTrackIds.add(matchedTrack.trackId);
      } else {
        // Create new track
        const trackId = this.generateTrackId();
        const observation = this.createObservation(trackId, detection, timestamp, frameId);
        const newTrack = this.createTrack(trackId, observation);
        this.tracks.set(trackId, newTrack);
        observations.push(observation);
        matchedTrackIds.add(trackId);
      }
    }

    // Update unmatched tracks
    for (const [trackId, track] of this.tracks.entries()) {
      if (!matchedTrackIds.has(trackId)) {
        track.lastSeenAt = timestamp;
        
        // Mark track as lost if timeout exceeded
        const timeSinceLastSeen = timestamp.getTime() - track.lastSeenAt.getTime();
        if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS && track.status === "confirmed") {
          track.status = "lost";
        }
      }
    }

    return observations;
  }

  /**
   * Find matching track for a detection
   */
  private findMatchingTrack(
    detection: DetectionInput,
    timestamp: Date,
  ): PersonTrack | undefined {
    let bestMatch: PersonTrack | undefined;
    let bestScore = 0;

    for (const track of this.tracks.values()) {
      // Skip completed or very old tracks
      if (track.status === "completed") continue;
      
      const timeSinceLastSeen = timestamp.getTime() - track.lastSeenAt.getTime();
      if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS) continue;

      // Get last observation
      const lastObs = track.observations[track.observations.length - 1];
      if (!lastObs) continue;

      // Calculate IoU
      const iou = this.calculateIoU(detection.boundingBox, lastObs.boundingBox);

      // Combine IoU with appearance similarity if available
      let score = iou;
      if (track.stableEmbedding && detection.trackId) {
        // Placeholder for appearance similarity
        // In production, compute cosine similarity between embeddings
        score = (1 - this.APPEARANCE_WEIGHT) * iou + this.APPEARANCE_WEIGHT * 0.5;
      }

      if (score > bestScore && score > this.IOU_THRESHOLD) {
        bestScore = score;
        bestMatch = track;
      }
    }

    return bestMatch;
  }

  /**
   * Create a person observation
   */
  private createObservation(
    trackId: string,
    detection: DetectionInput,
    timestamp: Date,
    frameId: string,
  ): PersonObservation {
    const footPoint = this.calculateFootPoint(detection.boundingBox);

    return {
      tenantId: this.tenantId,
      cameraId: this.cameraId,
      frameId,
      timestamp,
      localTrackId: trackId,
      boundingBox: detection.boundingBox,
      detectionConfidence: detection.confidence,
      footPoint,
    };
  }

  /**
   * Calculate foot point (bottom-center of bounding box)
   */
  private calculateFootPoint(bbox: BoundingBox): Point2D {
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height,
    };
  }

  /**
   * Create a new track
   */
  private createTrack(trackId: string, observation: PersonObservation): PersonTrack {
    return {
      trackId,
      cameraId: this.cameraId,
      tenantId: this.tenantId,
      startedAt: observation.timestamp,
      lastSeenAt: observation.timestamp,
      observations: [observation],
      currentZoneIds: [],
      status: "tentative",
      dwellTimeSeconds: 0,
      isStationary: false,
    };
  }

  /**
   * Update existing track with new observation
   */
  private updateTrack(track: PersonTrack, observation: PersonObservation): void {
    track.observations.push(observation);
    track.lastSeenAt = observation.timestamp;

    // Update dwell time
    track.dwellTimeSeconds =
      (observation.timestamp.getTime() - track.startedAt.getTime()) / 1000;

    // Confirm track after minimum frames
    if (
      track.status === "tentative" &&
      track.observations.length >= this.MIN_CONFIRMATION_FRAMES
    ) {
      track.status = "confirmed";
    }

    // Calculate velocity
    if (track.observations.length >= 2) {
      const prev = track.observations[track.observations.length - 2];
      const curr = observation;
      const timeDelta = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;

      if (timeDelta > 0) {
        track.velocity = {
          dx: (curr.footPoint.x - prev.footPoint.x) / timeDelta,
          dy: (curr.footPoint.y - prev.footPoint.y) / timeDelta,
        };

        const speed = Math.sqrt(
          track.velocity.dx ** 2 + track.velocity.dy ** 2,
        );
        track.speed = speed;
      }
    }

    // Check if stationary
    if (track.observations.length >= 5) {
      const recent = track.observations.slice(-5);
      const movement = this.calculateMovement(recent);
      track.isStationary = movement < 20; // pixels
    }

    // Rate-limit observations storage (keep max 100 recent)
    if (track.observations.length > 100) {
      track.observations = track.observations.slice(-100);
    }
  }

  /**
   * Calculate total movement from observations
   */
  private calculateMovement(observations: PersonObservation[]): number {
    let totalMovement = 0;

    for (let i = 1; i < observations.length; i++) {
      const prev = observations[i - 1];
      const curr = observations[i];
      const dx = curr.footPoint.x - prev.footPoint.x;
      const dy = curr.footPoint.y - prev.footPoint.y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    return totalMovement;
  }

  /**
   * Calculate IoU between two bounding boxes
   */
  private calculateIoU(bbox1: BoundingBox, bbox2: BoundingBox): number {
    const x1 = Math.max(bbox1.x, bbox2.x);
    const y1 = Math.max(bbox1.y, bbox2.y);
    const x2 = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width);
    const y2 = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = bbox1.width * bbox1.height;
    const area2 = bbox2.width * bbox2.height;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Generate unique track ID
   */
  private generateTrackId(): string {
    return `track_${this.cameraId}_${this.nextTrackId++}_${randomUUID().substring(0, 8)}`;
  }

  /**
   * Get all active tracks
   */
  getActiveTracks(): PersonTrack[] {
    return Array.from(this.tracks.values()).filter(
      (track) => track.status === "confirmed" || track.status === "tentative",
    );
  }

  /**
   * Get track by ID
   */
  getTrack(trackId: string): PersonTrack | undefined {
    return this.tracks.get(trackId);
  }

  /**
   * Clean up old tracks
   */
  cleanupOldTracks(now: Date): number {
    const staleTrackIds: string[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      const timeSinceLastSeen = now.getTime() - track.lastSeenAt.getTime();

      // Mark lost tracks as completed
      if (track.status === "lost" && timeSinceLastSeen > this.TRACKING_TIMEOUT_MS) {
        track.status = "completed";
      }

      // Remove very old completed tracks
      if (track.status === "completed" && timeSinceLastSeen > this.TRACKING_TIMEOUT_MS * 4) {
        staleTrackIds.push(trackId);
      }
    }

    for (const trackId of staleTrackIds) {
      this.tracks.delete(trackId);
    }

    return staleTrackIds.length;
  }

  /**
   * Get track statistics
   */
  getStats(): {
    total: number;
    tentative: number;
    confirmed: number;
    lost: number;
    completed: number;
  } {
    const stats = {
      total: this.tracks.size,
      tentative: 0,
      confirmed: 0,
      lost: 0,
      completed: 0,
    };

    for (const track of this.tracks.values()) {
      stats[track.status]++;
    }

    return stats;
  }
}
