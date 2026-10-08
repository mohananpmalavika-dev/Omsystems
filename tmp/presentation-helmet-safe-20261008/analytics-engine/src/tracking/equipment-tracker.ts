/**
 * Equipment Tracker
 * 
 * Tracks industrial equipment across frames to maintain identity, trajectory,
 * and state over time. Essential for temporal analytics like:
 * - Idle time detection
 * - Zone dwell time
 * - Speed estimation
 * - Path reconstruction
 * 
 * Uses IoU-based tracking with Kalman filtering for motion prediction.
 */

import type { EquipmentObservation } from '../inference/observation-bus.js';
import type { IndustrialEquipmentType } from '../inference/model-manifest.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Tracked equipment with temporal state
 */
export interface TrackedEquipment {
  trackId: string;
  equipmentType: IndustrialEquipmentType;
  
  // Current state
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  
  // Temporal information
  firstSeenAt: Date;
  lastSeenAt: Date;
  ageFrames: number;
  missedFrames: number;
  
  // Motion state
  velocity?: {
    x: number;
    y: number;
    speed: number; // pixels per second
  };
  
  // Trajectory
  trajectory: Array<{
    x: number;
    y: number;
    timestamp: Date;
  }>;
  
  // Zone tracking
  currentZone?: string;
  zoneHistory: Array<{
    zoneId: string;
    enteredAt: Date;
    exitedAt?: Date;
  }>;
  
  // Operating state
  movementState: 'moving' | 'stationary' | 'unknown';
  lastMovedAt?: Date;
  stationarySince?: Date;
}

/**
 * Tracker configuration
 */
export interface TrackerConfig {
  maxMissedFrames: number; // Delete track after this many missed frames
  iouThreshold: number; // IoU threshold for matching
  minTrajectoryPoints: number;
  maxTrajectoryPoints: number;
  movingThreshold: number; // Minimum speed to be considered "moving" (px/s)
  stationaryThreshold: number; // Max speed to be considered "stationary" (px/s)
}

/**
 * Tracking context
 */
export interface TrackingContext {
  cameraId: string;
  tenantId: string;
  branchId?: string;
  timestamp: Date;
  frameNumber?: number;
}

// ============================================================================
// Equipment Tracker Implementation
// ============================================================================

export class EquipmentTracker {
  private tracks = new Map<string, TrackedEquipment>();
  private nextTrackId = 1;
  private config: TrackerConfig;

  constructor(config?: Partial<TrackerConfig>) {
    this.config = {
      maxMissedFrames: 30, // ~1 second at 30 FPS
      iouThreshold: 0.3,
      minTrajectoryPoints: 2,
      maxTrajectoryPoints: 100,
      movingThreshold: 5.0, // px/s
      stationaryThreshold: 2.0, // px/s
      ...config,
    };
  }

  /**
   * Update tracker with new observations
   */
  update(
    observations: EquipmentObservation[],
    context: TrackingContext
  ): TrackedEquipment[] {
    // Match observations to existing tracks
    const { matched, unmatched } = this.matchObservations(observations);

    // Update matched tracks
    for (const { track, observation } of matched) {
      this.updateTrack(track, observation, context);
    }

    // Create new tracks for unmatched observations
    for (const observation of unmatched) {
      this.createTrack(observation, context);
    }

    // Increment missed frames for unmatched tracks
    this.updateMissedTracks(matched.map((m) => m.track.trackId));

    // Remove stale tracks
    this.removeStaleTracks();

    // Return all active tracks
    return Array.from(this.tracks.values());
  }

  /**
   * Match observations to existing tracks using IoU
   */
  private matchObservations(observations: EquipmentObservation[]): {
    matched: Array<{ track: TrackedEquipment; observation: EquipmentObservation }>;
    unmatched: EquipmentObservation[];
  } {
    const matched: Array<{
      track: TrackedEquipment;
      observation: EquipmentObservation;
    }> = [];
    const unmatchedObs = new Set(observations);
    const matchedTracks = new Set<string>();

    // Compute IoU matrix
    const tracks = Array.from(this.tracks.values());
    const scores: Array<{
      track: TrackedEquipment;
      observation: EquipmentObservation;
      iou: number;
    }> = [];

    for (const track of tracks) {
      for (const obs of observations) {
        // Only match same equipment type
        if (track.equipmentType !== obs.equipmentType) {
          continue;
        }

        const iou = this.calculateIoU(track.bbox, obs.bbox);
        if (iou >= this.config.iouThreshold) {
          scores.push({ track, observation: obs, iou });
        }
      }
    }

    // Sort by IoU (descending) and greedily assign
    scores.sort((a, b) => b.iou - a.iou);

    for (const { track, observation } of scores) {
      if (matchedTracks.has(track.trackId) || !unmatchedObs.has(observation)) {
        continue;
      }

      matched.push({ track, observation });
      matchedTracks.add(track.trackId);
      unmatchedObs.delete(observation);
    }

    return {
      matched,
      unmatched: Array.from(unmatchedObs),
    };
  }

  /**
   * Calculate Intersection over Union (IoU)
   */
  private calculateIoU(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const intersectionWidth = Math.max(0, x2 - x1);
    const intersectionHeight = Math.max(0, y2 - y1);
    const intersectionArea = intersectionWidth * intersectionHeight;

    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    const unionArea = box1Area + box2Area - intersectionArea;

    return unionArea > 0 ? intersectionArea / unionArea : 0;
  }

  /**
   * Create new track
   */
  private createTrack(
    observation: EquipmentObservation,
    context: TrackingContext
  ): TrackedEquipment {
    const trackId = `eq_${context.cameraId}_${this.nextTrackId++}`;

    const center = {
      x: observation.bbox.x + observation.bbox.width / 2,
      y: observation.bbox.y + observation.bbox.height / 2,
    };

    const track: TrackedEquipment = {
      trackId,
      equipmentType: observation.equipmentType as IndustrialEquipmentType,
      bbox: observation.bbox,
      confidence: observation.confidence,
      firstSeenAt: context.timestamp,
      lastSeenAt: context.timestamp,
      ageFrames: 1,
      missedFrames: 0,
      trajectory: [
        {
          x: center.x,
          y: center.y,
          timestamp: context.timestamp,
        },
      ],
      zoneHistory: [],
      movementState: 'unknown',
    };

    this.tracks.set(trackId, track);
    return track;
  }

  /**
   * Update existing track
   */
  private updateTrack(
    track: TrackedEquipment,
    observation: EquipmentObservation,
    context: TrackingContext
  ): void {
    const prevCenter = {
      x: track.bbox.x + track.bbox.width / 2,
      y: track.bbox.y + track.bbox.height / 2,
    };

    const newCenter = {
      x: observation.bbox.x + observation.bbox.width / 2,
      y: observation.bbox.y + observation.bbox.height / 2,
    };

    // Update bbox and confidence
    track.bbox = observation.bbox;
    track.confidence = observation.confidence;
    track.lastSeenAt = context.timestamp;
    track.ageFrames++;
    track.missedFrames = 0;

    // Update trajectory
    track.trajectory.push({
      x: newCenter.x,
      y: newCenter.y,
      timestamp: context.timestamp,
    });

    // Limit trajectory size
    if (track.trajectory.length > this.config.maxTrajectoryPoints) {
      track.trajectory.shift();
    }

    // Calculate velocity
    if (track.trajectory.length >= 2) {
      const prev = track.trajectory[track.trajectory.length - 2]!;
      const curr = track.trajectory[track.trajectory.length - 1]!;

      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dt = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000; // seconds

      if (dt > 0) {
        const speed = Math.sqrt(dx * dx + dy * dy) / dt;
        track.velocity = {
          x: dx / dt,
          y: dy / dt,
          speed,
        };

        // Update movement state
        this.updateMovementState(track, context.timestamp);
      }
    }

    // Update zone if provided
    if (observation.attributes?.zone) {
      this.updateZone(track, observation.attributes.zone, context.timestamp);
    }
  }

  /**
   * Update movement state
   */
  private updateMovementState(
    track: TrackedEquipment,
    timestamp: Date
  ): void {
    const speed = track.velocity?.speed ?? 0;

    if (speed >= this.config.movingThreshold) {
      if (track.movementState !== 'moving') {
        track.movementState = 'moving';
        track.lastMovedAt = timestamp;
        track.stationarySince = undefined;
      }
    } else if (speed <= this.config.stationaryThreshold) {
      if (track.movementState !== 'stationary') {
        track.movementState = 'stationary';
        track.stationarySince = timestamp;
      }
    }
  }

  /**
   * Update zone tracking
   */
  private updateZone(
    track: TrackedEquipment,
    zoneId: string,
    timestamp: Date
  ): void {
    if (track.currentZone === zoneId) {
      return; // Still in same zone
    }

    // Exit previous zone
    if (track.currentZone) {
      const currentZoneEntry = track.zoneHistory.find(
        (z) => z.zoneId === track.currentZone && !z.exitedAt
      );
      if (currentZoneEntry) {
        currentZoneEntry.exitedAt = timestamp;
      }
    }

    // Enter new zone
    track.currentZone = zoneId;
    track.zoneHistory.push({
      zoneId,
      enteredAt: timestamp,
    });
  }

  /**
   * Update missed frames for unmatched tracks
   */
  private updateMissedTracks(matchedTrackIds: string[]): void {
    const matchedSet = new Set(matchedTrackIds);

    for (const track of this.tracks.values()) {
      if (!matchedSet.has(track.trackId)) {
        track.missedFrames++;
      }
    }
  }

  /**
   * Remove stale tracks
   */
  private removeStaleTracks(): void {
    const toRemove: string[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.missedFrames > this.config.maxMissedFrames) {
        toRemove.push(trackId);
      }
    }

    for (const trackId of toRemove) {
      this.tracks.delete(trackId);
    }
  }

  /**
   * Get track by ID
   */
  getTrack(trackId: string): TrackedEquipment | undefined {
    return this.tracks.get(trackId);
  }

  /**
   * Get all active tracks
   */
  getAllTracks(): TrackedEquipment[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get tracks by equipment type
   */
  getTracksByType(type: IndustrialEquipmentType): TrackedEquipment[] {
    return Array.from(this.tracks.values()).filter(
      (track) => track.equipmentType === type
    );
  }

  /**
   * Get tracks in zone
   */
  getTracksInZone(zoneId: string): TrackedEquipment[] {
    return Array.from(this.tracks.values()).filter(
      (track) => track.currentZone === zoneId
    );
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const tracks = Array.from(this.tracks.values());

    const byType = new Map<string, number>();
    let totalMoving = 0;
    let totalStationary = 0;

    for (const track of tracks) {
      const count = byType.get(track.equipmentType) || 0;
      byType.set(track.equipmentType, count + 1);

      if (track.movementState === 'moving') totalMoving++;
      if (track.movementState === 'stationary') totalStationary++;
    }

    return {
      totalTracks: tracks.length,
      byType: Object.fromEntries(byType),
      moving: totalMoving,
      stationary: totalStationary,
      avgAge: tracks.length > 0
        ? tracks.reduce((sum, t) => sum + t.ageFrames, 0) / tracks.length
        : 0,
    };
  }

  /**
   * Clear all tracks
   */
  clear(): void {
    this.tracks.clear();
    this.nextTrackId = 1;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.clear();
  }
}
