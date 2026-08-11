/**
 * Vehicle Tracking System
 * Implements SORT-style tracking with IoU + Re-ID feature matching
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VehicleDetection {
  boundingBox: BoundingBox;
  confidence: number;
  className: string;
  embedding?: number[];
}

export interface VehicleTrackState {
  trackId: string;
  cameraId: string;
  
  firstSeenAt: Date;
  lastSeenAt: Date;
  
  vehicleType: string;
  detectionConfidence: number;
  
  positions: Array<{
    boundingBox: BoundingBox;
    timestamp: Date;
    confidence: number;
  }>;
  
  reIdFeature?: number[];
  colorObservations: Array<{
    color: string;
    confidence: number;
    timestamp: Date;
  }>;
  
  plateObservations: Array<{
    rawText: string;
    normalizedText: string;
    ocrConfidence: number;
    detectionConfidence: number;
    cropQuality: number;
    timestamp: Date;
  }>;
  
  finalized: boolean;
  finalizedAt?: Date;
}

export interface TrackingConfig {
  maxAge: number; // frames
  minHits: number;
  iouThreshold: number;
  reIdWeight: number;
  maxDistance: number;
}

export class VehicleTracker {
  private tracks = new Map<string, VehicleTrackState>();
  private nextTrackId = 1;
  private frameCount = 0;
  
  constructor(
    private readonly cameraId: string,
    private readonly config: TrackingConfig = {
      maxAge: 30,
      minHits: 3,
      iouThreshold: 0.3,
      reIdWeight: 0.4,
      maxDistance: 0.5,
    }
  ) {}
  
  /**
   * Update tracks with new detections
   */
  update(
    detections: VehicleDetection[],
    timestamp: Date
  ): VehicleTrackState[] {
    this.frameCount++;
    
    // Match detections to existing tracks
    const matched = new Set<string>();
    const assigned = new Set<number>();
    
    // Calculate cost matrix
    const tracks = Array.from(this.tracks.values()).filter(t => !t.finalized);
    const costMatrix: number[][] = [];
    
    for (let i = 0; i < tracks.length; i++) {
      costMatrix[i] = [];
      const track = tracks[i];
      const lastPos = track.positions[track.positions.length - 1];
      
      for (let j = 0; j < detections.length; j++) {
        const detection = detections[j];
        
        // Calculate IoU
        const iou = this.calculateIoU(lastPos.boundingBox, detection.boundingBox);
        
        // Calculate Re-ID similarity if available
        let reIdSim = 0;
        if (track.reIdFeature && detection.embedding) {
          reIdSim = this.cosineSimilarity(track.reIdFeature, detection.embedding);
        }
        
        // Combined score (lower is better for Hungarian algorithm)
        const score = 1 - (
          iou * (1 - this.config.reIdWeight) +
          reIdSim * this.config.reIdWeight
        );
        
        costMatrix[i][j] = score;
      }
    }
    
    // Simple greedy matching (for production, use Hungarian algorithm)
    const matches = this.greedyMatching(costMatrix, this.config.maxDistance);
    
    // Update matched tracks
    for (const [trackIdx, detIdx] of matches) {
      const track = tracks[trackIdx];
      const detection = detections[detIdx];
      
      this.updateTrack(track, detection, timestamp);
      matched.add(track.trackId);
      assigned.add(detIdx);
    }
    
    // Create new tracks for unmatched detections
    for (let i = 0; i < detections.length; i++) {
      if (!assigned.has(i)) {
        const newTrack = this.createTrack(detections[i], timestamp);
        this.tracks.set(newTrack.trackId, newTrack);
      }
    }
    
    // Mark tracks without recent updates
    for (const track of tracks) {
      if (!matched.has(track.trackId)) {
        const age = this.frameCount - this.getTrackAge(track);
        if (age > this.config.maxAge) {
          this.finalizeTrack(track, timestamp);
        }
      }
    }
    
    return Array.from(this.tracks.values());
  }
  
  /**
   * Get active (non-finalized) tracks
   */
  getActiveTracks(): VehicleTrackState[] {
    return Array.from(this.tracks.values()).filter(t => !t.finalized);
  }
  
  /**
   * Get track by ID
   */
  getTrack(trackId: string): VehicleTrackState | undefined {
    return this.tracks.get(trackId);
  }
  
  /**
   * Finalize a track (vehicle left scene)
   */
  private finalizeTrack(track: VehicleTrackState, timestamp: Date): void {
    track.finalized = true;
    track.finalizedAt = timestamp;
  }
  
  /**
   * Create new track
   */
  private createTrack(
    detection: VehicleDetection,
    timestamp: Date
  ): VehicleTrackState {
    const trackId = `${this.cameraId}_vehicle_${String(this.nextTrackId++).padStart(6, '0')}`;
    
    return {
      trackId,
      cameraId: this.cameraId,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      vehicleType: detection.className,
      detectionConfidence: detection.confidence,
      positions: [{
        boundingBox: detection.boundingBox,
        timestamp,
        confidence: detection.confidence,
      }],
      reIdFeature: detection.embedding,
      colorObservations: [],
      plateObservations: [],
      finalized: false,
    };
  }
  
  /**
   * Update existing track
   */
  private updateTrack(
    track: VehicleTrackState,
    detection: VehicleDetection,
    timestamp: Date
  ): void {
    track.lastSeenAt = timestamp;
    track.positions.push({
      boundingBox: detection.boundingBox,
      timestamp,
      confidence: detection.confidence,
    });
    
    // Update Re-ID feature with exponential moving average
    if (detection.embedding) {
      if (track.reIdFeature) {
        track.reIdFeature = this.updateFeatureVector(
          track.reIdFeature,
          detection.embedding,
          0.7
        );
      } else {
        track.reIdFeature = detection.embedding;
      }
    }
    
    // Update detection confidence
    track.detectionConfidence = Math.max(track.detectionConfidence, detection.confidence);
  }
  
  /**
   * Calculate IoU between two bounding boxes
   */
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    if (x2 < x1 || y2 < y1) return 0;
    
    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;
    
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Calculate cosine similarity between feature vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }
  
  /**
   * Update feature vector with exponential moving average
   */
  private updateFeatureVector(
    current: number[],
    new_: number[],
    alpha: number
  ): number[] {
    return current.map((val, idx) => alpha * val + (1 - alpha) * new_[idx]);
  }
  
  /**
   * Greedy matching algorithm
   */
  private greedyMatching(
    costMatrix: number[][],
    maxCost: number
  ): Array<[number, number]> {
    const matches: Array<[number, number]> = [];
    const usedRows = new Set<number>();
    const usedCols = new Set<number>();
    
    // Flatten and sort by cost
    const entries: Array<{ row: number; col: number; cost: number }> = [];
    for (let i = 0; i < costMatrix.length; i++) {
      for (let j = 0; j < (costMatrix[i]?.length || 0); j++) {
        entries.push({ row: i, col: j, cost: costMatrix[i][j] });
      }
    }
    entries.sort((a, b) => a.cost - b.cost);
    
    // Greedily assign
    for (const entry of entries) {
      if (entry.cost > maxCost) break;
      if (usedRows.has(entry.row) || usedCols.has(entry.col)) continue;
      
      matches.push([entry.row, entry.col]);
      usedRows.add(entry.row);
      usedCols.add(entry.col);
    }
    
    return matches;
  }
  
  /**
   * Get track age in frames
   */
  private getTrackAge(track: VehicleTrackState): number {
    return track.positions.length;
  }
  
  /**
   * Clean up old finalized tracks
   */
  cleanup(olderThan: Date): number {
    let removed = 0;
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.finalized && track.finalizedAt && track.finalizedAt < olderThan) {
        this.tracks.delete(trackId);
        removed++;
      }
    }
    return removed;
  }
}
