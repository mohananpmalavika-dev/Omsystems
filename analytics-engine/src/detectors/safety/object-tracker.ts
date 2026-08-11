/**
 * Object Tracker
 * Persistent object tracking with ByteTrack-inspired algorithm
 * Maintains stable IDs across frames for persons, vehicles, and objects
 */

import { randomUUID } from 'node:crypto';

// ============================================================================
// Type Definitions
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  features?: number[]; // Optional appearance features
}

export interface TrackedObject {
  trackId: string;
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  position: { x: number; y: number };
  velocity: { dx: number; dy: number };
  acceleration: { ddx: number; ddy: number };
  age: number; // Frames since first detection
  hits: number; // Number of successful matches
  misses: number; // Number of consecutive missed detections
  state: 'tentative' | 'confirmed' | 'lost';
  features?: number[];
  history: Array<{
    boundingBox: BoundingBox;
    timestamp: Date;
    position: { x: number; y: number };
  }>;
  firstSeen: Date;
  lastSeen: Date;
  metadata?: Record<string, unknown>;
}

export interface TrackingConfig {
  maxAge: number; // Max frames to keep lost tracks
  minHits: number; // Min hits before confirming track
  iouThreshold: number; // IoU threshold for matching
  featureThreshold: number; // Feature similarity threshold
  maxHistoryLength: number; // Max history entries per track
  velocitySmoothing: number; // Velocity smoothing factor (0-1)
}

export interface TrackingStatistics {
  totalTracks: number;
  activeTracks: number;
  confirmedTracks: number;
  tentativeTracks: number;
  lostTracks: number;
  byLabel: Record<string, number>;
  averageAge: number;
  averageConfidence: number;
}

// ============================================================================
// Object Tracker
// ============================================================================

export class ObjectTracker {
  private tracks = new Map<string, TrackedObject>();
  private nextTrackId = 1;
  private frameCount = 0;
  
  private config: TrackingConfig = {
    maxAge: 30, // Keep tracks for 30 frames after last detection
    minHits: 3, // Require 3 hits before confirming
    iouThreshold: 0.3, // IoU threshold for matching
    featureThreshold: 0.7, // Cosine similarity threshold
    maxHistoryLength: 100, // Keep 100 history entries
    velocitySmoothing: 0.7, // Smooth velocity with 70% weight on previous
  };

  constructor(config?: Partial<TrackingConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // ============================================================================
  // Tracking Methods
  // ============================================================================

  /**
   * Update tracks with new detections
   */
  update(detections: Detection[], timestamp: Date = new Date()): TrackedObject[] {
    this.frameCount++;

    // Step 1: Predict track positions based on velocity
    this.predictTracks();

    // Step 2: Match detections to existing tracks
    const { matched, unmatchedDetections, unmatchedTracks } = this.matchDetections(detections);

    // Step 3: Update matched tracks
    for (const { detection, track } of matched) {
      this.updateTrack(track, detection, timestamp);
    }

    // Step 4: Create new tracks for unmatched detections
    for (const detection of unmatchedDetections) {
      this.createTrack(detection, timestamp);
    }

    // Step 5: Mark unmatched tracks as missed
    for (const track of unmatchedTracks) {
      this.markMissed(track);
    }

    // Step 6: Remove old tracks
    this.removeOldTracks();

    // Return confirmed tracks
    return this.getActiveTracks();
  }

  /**
   * Predict track positions using velocity
   */
  private predictTracks(): void {
    for (const track of this.tracks.values()) {
      if (track.state === 'lost') continue;

      // Predict next position based on velocity
      const predictedX = track.position.x + track.velocity.dx;
      const predictedY = track.position.y + track.velocity.dy;

      // Update predicted bounding box
      track.boundingBox.x += track.velocity.dx;
      track.boundingBox.y += track.velocity.dy;

      track.position = { x: predictedX, y: predictedY };
    }
  }

  /**
   * Match detections to tracks using IoU and appearance features
   */
  private matchDetections(detections: Detection[]): {
    matched: Array<{ detection: Detection; track: TrackedObject }>;
    unmatchedDetections: Detection[];
    unmatchedTracks: TrackedObject[];
  } {
    const matched: Array<{ detection: Detection; track: TrackedObject }> = [];
    const unmatchedDetections: Detection[] = [];
    const activeTracks = Array.from(this.tracks.values())
      .filter(t => t.state !== 'lost');

    if (activeTracks.length === 0) {
      return {
        matched: [],
        unmatchedDetections: detections,
        unmatchedTracks: [],
      };
    }

    if (detections.length === 0) {
      return {
        matched: [],
        unmatchedDetections: [],
        unmatchedTracks: activeTracks,
      };
    }

    // Build cost matrix
    const costMatrix: number[][] = [];
    for (let i = 0; i < detections.length; i++) {
      costMatrix[i] = [];
      for (let j = 0; j < activeTracks.length; j++) {
        const detection = detections[i];
        const track = activeTracks[j];

        // Only match same labels
        if (detection.label !== track.label) {
          costMatrix[i][j] = Infinity;
          continue;
        }

        // Calculate IoU
        const iou = this.calculateIoU(detection.boundingBox, track.boundingBox);

        // Calculate feature similarity if available
        let featureSimilarity = 0;
        if (detection.features && track.features) {
          featureSimilarity = this.cosineSimilarity(detection.features, track.features);
        }

        // Combined cost (lower is better)
        // Use IoU as primary metric, features as secondary
        const cost = 1 - iou - (featureSimilarity * 0.3);
        costMatrix[i][j] = cost;
      }
    }

    // Hungarian algorithm (simplified greedy matching for efficiency)
    const matchedDetectionIndices = new Set<number>();
    const matchedTrackIndices = new Set<number>();

    // Sort by cost and match greedily
    const pairs: Array<{ detectionIdx: number; trackIdx: number; cost: number }> = [];
    for (let i = 0; i < costMatrix.length; i++) {
      for (let j = 0; j < costMatrix[i].length; j++) {
        if (costMatrix[i][j] < Infinity) {
          pairs.push({ detectionIdx: i, trackIdx: j, cost: costMatrix[i][j] });
        }
      }
    }

    pairs.sort((a, b) => a.cost - b.cost);

    for (const pair of pairs) {
      if (matchedDetectionIndices.has(pair.detectionIdx)) continue;
      if (matchedTrackIndices.has(pair.trackIdx)) continue;

      // Check if cost is below threshold
      const detection = detections[pair.detectionIdx];
      const track = activeTracks[pair.trackIdx];
      const iou = this.calculateIoU(detection.boundingBox, track.boundingBox);

      if (iou >= this.config.iouThreshold) {
        matched.push({ detection, track });
        matchedDetectionIndices.add(pair.detectionIdx);
        matchedTrackIndices.add(pair.trackIdx);
      }
    }

    // Collect unmatched
    for (let i = 0; i < detections.length; i++) {
      if (!matchedDetectionIndices.has(i)) {
        unmatchedDetections.push(detections[i]);
      }
    }

    const unmatchedTracks = activeTracks.filter(
      (_, idx) => !matchedTrackIndices.has(idx)
    );

    return { matched, unmatchedDetections, unmatchedTracks };
  }

  /**
   * Update existing track with matched detection
   */
  private updateTrack(track: TrackedObject, detection: Detection, timestamp: Date): void {
    // Calculate velocity and acceleration
    const oldPosition = track.position;
    const newPosition = {
      x: detection.boundingBox.x + detection.boundingBox.width / 2,
      y: detection.boundingBox.y + detection.boundingBox.height / 2,
    };

    const dx = newPosition.x - oldPosition.x;
    const dy = newPosition.y - oldPosition.y;

    // Smooth velocity
    const smoothing = this.config.velocitySmoothing;
    const newVelocity = {
      dx: smoothing * track.velocity.dx + (1 - smoothing) * dx,
      dy: smoothing * track.velocity.dy + (1 - smoothing) * dy,
    };

    // Calculate acceleration
    const ddx = newVelocity.dx - track.velocity.dx;
    const ddy = newVelocity.dy - track.velocity.dy;

    // Update track
    track.boundingBox = detection.boundingBox;
    track.position = newPosition;
    track.velocity = newVelocity;
    track.acceleration = { ddx, ddy };
    track.confidence = (track.confidence * 0.7) + (detection.confidence * 0.3); // Exponential smoothing
    track.hits++;
    track.misses = 0;
    track.age++;
    track.lastSeen = timestamp;

    // Update features if available
    if (detection.features) {
      track.features = detection.features;
    }

    // Add to history
    track.history.push({
      boundingBox: { ...detection.boundingBox },
      timestamp,
      position: { ...newPosition },
    });

    // Limit history length
    if (track.history.length > this.config.maxHistoryLength) {
      track.history.shift();
    }

    // Confirm track if enough hits
    if (track.state === 'tentative' && track.hits >= this.config.minHits) {
      track.state = 'confirmed';
    }
  }

  /**
   * Create new track from detection
   */
  private createTrack(detection: Detection, timestamp: Date): TrackedObject {
    const trackId = `track_${String(this.nextTrackId++).padStart(6, '0')}`;
    const position = {
      x: detection.boundingBox.x + detection.boundingBox.width / 2,
      y: detection.boundingBox.y + detection.boundingBox.height / 2,
    };

    const track: TrackedObject = {
      trackId,
      label: detection.label,
      confidence: detection.confidence,
      boundingBox: { ...detection.boundingBox },
      position,
      velocity: { dx: 0, dy: 0 },
      acceleration: { ddx: 0, ddy: 0 },
      age: 1,
      hits: 1,
      misses: 0,
      state: 'tentative',
      features: detection.features,
      history: [{
        boundingBox: { ...detection.boundingBox },
        timestamp,
        position: { ...position },
      }],
      firstSeen: timestamp,
      lastSeen: timestamp,
    };

    this.tracks.set(trackId, track);
    return track;
  }

  /**
   * Mark track as missed
   */
  private markMissed(track: TrackedObject): void {
    track.misses++;
    track.age++;

    if (track.misses >= this.config.maxAge) {
      track.state = 'lost';
    }
  }

  /**
   * Remove old lost tracks
   */
  private removeOldTracks(): void {
    const toRemove: string[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.state === 'lost' && track.misses > this.config.maxAge) {
        toRemove.push(trackId);
      }
    }

    for (const trackId of toRemove) {
      this.tracks.delete(trackId);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate Intersection over Union (IoU)
   */
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
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
   * Calculate cosine similarity between feature vectors
   */
  private cosineSimilarity(features1: number[], features2: number[]): number {
    if (features1.length !== features2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < features1.length; i++) {
      dotProduct += features1[i] * features2[i];
      norm1 += features1[i] * features1[i];
      norm2 += features2[i] * features2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    return norm1 > 0 && norm2 > 0 ? dotProduct / (norm1 * norm2) : 0;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all active tracks (confirmed and tentative)
   */
  getActiveTracks(): TrackedObject[] {
    return Array.from(this.tracks.values())
      .filter(t => t.state !== 'lost');
  }

  /**
   * Get confirmed tracks only
   */
  getConfirmedTracks(): TrackedObject[] {
    return Array.from(this.tracks.values())
      .filter(t => t.state === 'confirmed');
  }

  /**
   * Get track by ID
   */
  getTrack(trackId: string): TrackedObject | undefined {
    return this.tracks.get(trackId);
  }

  /**
   * Get tracks by label
   */
  getTracksByLabel(label: string): TrackedObject[] {
    return Array.from(this.tracks.values())
      .filter(t => t.label === label && t.state !== 'lost');
  }

  /**
   * Get all tracks (including lost)
   */
  getAllTracks(): TrackedObject[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get tracking statistics
   */
  getStatistics(): TrackingStatistics {
    const allTracks = this.getAllTracks();
    const activeTracks = allTracks.filter(t => t.state !== 'lost');
    const confirmedTracks = allTracks.filter(t => t.state === 'confirmed');
    const tentativeTracks = allTracks.filter(t => t.state === 'tentative');
    const lostTracks = allTracks.filter(t => t.state === 'lost');

    const byLabel: Record<string, number> = {};
    let totalAge = 0;
    let totalConfidence = 0;

    for (const track of activeTracks) {
      byLabel[track.label] = (byLabel[track.label] || 0) + 1;
      totalAge += track.age;
      totalConfidence += track.confidence;
    }

    return {
      totalTracks: allTracks.length,
      activeTracks: activeTracks.length,
      confirmedTracks: confirmedTracks.length,
      tentativeTracks: tentativeTracks.length,
      lostTracks: lostTracks.length,
      byLabel,
      averageAge: activeTracks.length > 0 ? totalAge / activeTracks.length : 0,
      averageConfidence: activeTracks.length > 0 ? totalConfidence / activeTracks.length : 0,
    };
  }

  /**
   * Get track trajectory (position history)
   */
  getTrackTrajectory(trackId: string, maxPoints = 50): Array<{ x: number; y: number; timestamp: Date }> {
    const track = this.tracks.get(trackId);
    if (!track) return [];

    return track.history
      .slice(-maxPoints)
      .map(h => ({ x: h.position.x, y: h.position.y, timestamp: h.timestamp }));
  }

  /**
   * Estimate future position
   */
  predictFuturePosition(trackId: string, framesAhead: number): { x: number; y: number } | null {
    const track = this.tracks.get(trackId);
    if (!track || track.state === 'lost') return null;

    return {
      x: track.position.x + track.velocity.dx * framesAhead,
      y: track.position.y + track.velocity.dy * framesAhead,
    };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): TrackingConfig {
    return { ...this.config };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.tracks.clear();
    this.nextTrackId = 1;
    this.frameCount = 0;
  }

  /**
   * Remove track by ID
   */
  removeTrack(trackId: string): boolean {
    return this.tracks.delete(trackId);
  }

  /**
   * Force confirm track
   */
  confirmTrack(trackId: string): boolean {
    const track = this.tracks.get(trackId);
    if (!track) return false;

    track.state = 'confirmed';
    return true;
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Export tracks to JSON
   */
  exportTracks(): Array<{
    trackId: string;
    label: string;
    state: string;
    age: number;
    confidence: number;
  }> {
    return Array.from(this.tracks.values()).map(t => ({
      trackId: t.trackId,
      label: t.label,
      state: t.state,
      age: t.age,
      confidence: Math.round(t.confidence * 100) / 100,
    }));
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    frameCount: number;
    totalTracks: number;
    activeTracks: number;
    averageAge: number;
  } {
    const stats = this.getStatistics();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (stats.activeTracks > 500) status = 'degraded';
    if (stats.activeTracks > 1000) status = 'unhealthy';

    return {
      status,
      frameCount: this.frameCount,
      totalTracks: stats.totalTracks,
      activeTracks: stats.activeTracks,
      averageAge: Math.round(stats.averageAge * 10) / 10,
    };
  }
}

// ============================================================================
// Multi-Object Tracker Manager
// ============================================================================

/**
 * Manages multiple trackers for different object types
 */
export class MultiObjectTracker {
  private trackers = new Map<string, ObjectTracker>();
  private defaultConfig: TrackingConfig;

  constructor(config?: Partial<TrackingConfig>) {
    this.defaultConfig = {
      maxAge: 30,
      minHits: 3,
      iouThreshold: 0.3,
      featureThreshold: 0.7,
      maxHistoryLength: 100,
      velocitySmoothing: 0.7,
      ...config,
    };
  }

  /**
   * Get or create tracker for a label
   */
  private getTracker(label: string): ObjectTracker {
    if (!this.trackers.has(label)) {
      this.trackers.set(label, new ObjectTracker(this.defaultConfig));
    }
    return this.trackers.get(label)!;
  }

  /**
   * Update all trackers with detections
   */
  update(detections: Detection[], timestamp: Date = new Date()): TrackedObject[] {
    // Group detections by label
    const detectionsByLabel = new Map<string, Detection[]>();
    for (const detection of detections) {
      if (!detectionsByLabel.has(detection.label)) {
        detectionsByLabel.set(detection.label, []);
      }
      detectionsByLabel.get(detection.label)!.push(detection);
    }

    // Update each tracker
    const allTracks: TrackedObject[] = [];
    for (const [label, labelDetections] of detectionsByLabel.entries()) {
      const tracker = this.getTracker(label);
      const tracks = tracker.update(labelDetections, timestamp);
      allTracks.push(...tracks);
    }

    // Update trackers with no detections (mark as missed)
    for (const [label, tracker] of this.trackers.entries()) {
      if (!detectionsByLabel.has(label)) {
        tracker.update([], timestamp);
      }
    }

    return allTracks;
  }

  /**
   * Get all active tracks
   */
  getAllTracks(): TrackedObject[] {
    const tracks: TrackedObject[] = [];
    for (const tracker of this.trackers.values()) {
      tracks.push(...tracker.getActiveTracks());
    }
    return tracks;
  }

  /**
   * Get tracks by label
   */
  getTracksByLabel(label: string): TrackedObject[] {
    const tracker = this.trackers.get(label);
    return tracker ? tracker.getActiveTracks() : [];
  }

  /**
   * Get combined statistics
   */
  getStatistics(): TrackingStatistics & { byTracker: Record<string, TrackingStatistics> } {
    const byTracker: Record<string, TrackingStatistics> = {};
    let totalTracks = 0;
    let activeTracks = 0;
    let confirmedTracks = 0;
    let tentativeTracks = 0;
    let lostTracks = 0;
    const byLabel: Record<string, number> = {};
    let totalAge = 0;
    let totalConfidence = 0;
    let trackCount = 0;

    for (const [label, tracker] of this.trackers.entries()) {
      const stats = tracker.getStatistics();
      byTracker[label] = stats;

      totalTracks += stats.totalTracks;
      activeTracks += stats.activeTracks;
      confirmedTracks += stats.confirmedTracks;
      tentativeTracks += stats.tentativeTracks;
      lostTracks += stats.lostTracks;

      for (const [lbl, count] of Object.entries(stats.byLabel)) {
        byLabel[lbl] = (byLabel[lbl] || 0) + count;
      }

      totalAge += stats.averageAge * stats.activeTracks;
      totalConfidence += stats.averageConfidence * stats.activeTracks;
      trackCount += stats.activeTracks;
    }

    return {
      totalTracks,
      activeTracks,
      confirmedTracks,
      tentativeTracks,
      lostTracks,
      byLabel,
      averageAge: trackCount > 0 ? totalAge / trackCount : 0,
      averageConfidence: trackCount > 0 ? totalConfidence / trackCount : 0,
      byTracker,
    };
  }

  /**
   * Reset all trackers
   */
  reset(): void {
    for (const tracker of this.trackers.values()) {
      tracker.reset();
    }
  }

  /**
   * Reset specific tracker
   */
  resetTracker(label: string): void {
    const tracker = this.trackers.get(label);
    if (tracker) {
      tracker.reset();
    }
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    trackers: number;
    totalTracks: number;
    trackerHealth: Record<string, ReturnType<ObjectTracker['getHealth']>>;
  } {
    const trackerHealth: Record<string, ReturnType<ObjectTracker['getHealth']>> = {};
    let totalTracks = 0;
    let unhealthyCount = 0;
    let degradedCount = 0;

    for (const [label, tracker] of this.trackers.entries()) {
      const health = tracker.getHealth();
      trackerHealth[label] = health;
      totalTracks += health.activeTracks;

      if (health.status === 'unhealthy') unhealthyCount++;
      if (health.status === 'degraded') degradedCount++;
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) status = 'unhealthy';
    else if (degradedCount > 0) status = 'degraded';

    return {
      status,
      trackers: this.trackers.size,
      totalTracks,
      trackerHealth,
    };
  }
}
