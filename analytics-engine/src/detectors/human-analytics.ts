/**
 * Human Analytics Module
 * Advanced person detection with tracking, Re-ID, counting, and behavior analysis
 * Uses zero-cost open-source models: YOLOv8 + OSNet + Pose Estimation
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";
import { getInferencePipeline } from "../inference/unified-inference-pipeline.js";

// ============================================================================
// Type Definitions
// ============================================================================

export interface PersonTrack {
  trackId: string;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{
    x: number;
    y: number;
    timestamp: Date;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  isStationary: boolean;
  dwellTimeSeconds: number;
  avgConfidence: number;
  
  // Re-identification features (OSNet)
  reIdFeature?: number[];  // 512-dim feature vector
  reIdConfidence?: number;
  globalPersonId?: string;  // Cross-camera person ID
  
  // Behavior tracking
  currentActivity?: 'walking' | 'running' | 'sitting' | 'standing' | 'loitering' | 'crawling';
  speed?: number;  // meters per second
  trajectory?: Array<{ x: number; y: number; timestamp: Date }>;
  
  // Appearance features for AI search
  appearance?: {
    dominantColors?: string[];
    hasBackpack?: boolean;
    hasHat?: boolean;
    clothingType?: 'casual' | 'formal' | 'uniform';
  };
}

export interface PersonCount {
  total: number;
  unique: number;  // Based on Re-ID
  entering: number;
  exiting: number;
  occupancy: number;  // Current count in zone
  peakTime?: Date;
  peakCount?: number;
}

export interface BehaviorEvent {
  personTrackId: string;
  behavior: 'running' | 'fighting' | 'falling' | 'loitering' | 'hands_raised' | 
            'sitting' | 'crawling' | 'sleeping' | 'abnormal';
  confidence: number;
  startTime: Date;
  duration: number;
  location: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface PoseKeypoints {
  nose: { x: number; y: number; confidence: number };
  leftEye: { x: number; y: number; confidence: number };
  rightEye: { x: number; y: number; confidence: number };
  leftEar: { x: number; y: number; confidence: number };
  rightEar: { x: number; y: number; confidence: number };
  leftShoulder: { x: number; y: number; confidence: number };
  rightShoulder: { x: number; y: number; confidence: number };
  leftElbow: { x: number; y: number; confidence: number };
  rightElbow: { x: number; y: number; confidence: number };
  leftWrist: { x: number; y: number; confidence: number };
  rightWrist: { x: number; y: number; confidence: number };
  leftHip: { x: number; y: number; confidence: number };
  rightHip: { x: number; y: number; confidence: number };
  leftKnee: { x: number; y: number; confidence: number };
  rightKnee: { x: number; y: number; confidence: number };
  leftAnkle: { x: number; y: number; confidence: number };
  rightAnkle: { x: number; y: number; confidence: number };
}

export interface ReIdDatabase {
  features: Map<string, number[]>;  // globalPersonId -> feature vector
  lastSeen: Map<string, Date>;
  metadata: Map<string, Record<string, unknown>>;
}

// ============================================================================
// Human Analytics Detector
// ============================================================================

export class HumanAnalyticsDetector extends BaseDetector {
  private tracks = new Map<string, PersonTrack>();
  private reIdDatabase: ReIdDatabase = {
    features: new Map(),
    lastSeen: new Map(),
    metadata: new Map(),
  };
  private behaviorEvents = new Map<string, BehaviorEvent>();
  private countingZones = new Map<string, PersonCount>();
  
  private isModelLoaded = false;
  private yoloModel: any;  // ONNX Runtime session
  private osnetModel: any;  // Re-ID model
  private poseModel: any;   // Pose estimation model
  
  // Configuration
  private readonly TRACKING_TIMEOUT_MS = 5000;
  private readonly STATIONARY_THRESHOLD = 20;  // pixels
  private readonly LOITERING_THRESHOLD_S = 60;  // 1 minute
  private readonly REID_SIMILARITY_THRESHOLD = 0.7;
  private readonly MIN_CONFIDENCE = 0.5;

  constructor() {
    super("human-analytics", "3.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing Human Analytics detector...");
    
    try {
      // Use the unified inference pipeline to determine model availability
      const pipeline = getInferencePipeline();
      // Ensure pipeline is initialized elsewhere; if not, this detector is still useful as a consumer
      this.isModelLoaded = pipeline.isReady();

      this.startTrackingCleanup();
      this.startBehaviorAnalysis();

      console.log("Human Analytics detector initialized successfully");
      console.log("- Person detection: YOLOv8 (via unified pipeline)");
      console.log("- Re-ID: OSNet (via unified pipeline)");
      console.log("- Pose estimation: YOLOv8-Pose (via unified pipeline)");
    } catch (error) {
      console.error("Failed to initialize Human Analytics:", error);
      throw error;
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    const results: DetectionResult[] = [];

    // Step 1: Detect persons in frame using YOLOv8
    const persons = await this.detectPersons(frame);

    // Step 2: Update tracking with DeepSORT-style algorithm
    await this.updateTracking(persons, frame);

    // Step 3: Extract Re-ID features for cross-camera tracking
    await this.extractReIdFeatures(persons, frame);

    // Step 4: Match with global Re-ID database
    await this.performReIdentification();

    // Step 5: Analyze behavior and activities
    const behaviors = await this.analyzeBehaviors(frame);

    // Step 6: Count persons per zone
    const counts = this.updatePersonCounts(frame.timestamp);

    // Generate detection results
    if (persons.length > 0) {
      results.push(this.createPersonDetectionResult(persons));
    }

    if (behaviors.length > 0) {
      results.push(...this.createBehaviorResults(behaviors));
    }

    if (counts.size > 0) {
      results.push(this.createCountingResult(counts));
    }

    return results;
  }

  // ============================================================================
  // Person Detection (YOLOv8)
  // ============================================================================

  private async detectPersons(frame: DetectionFrame): Promise<any[]> {
    // Delegate to unified pipeline object detector for 'person' labels
    try {
      const pipeline = getInferencePipeline();
      const detections = await pipeline.detectObjects(frame, ['person']);
      // Keep only high-confidence detections
      const filtered = detections.filter(d => d.confidence >= this.MIN_CONFIDENCE).map(d => ({
        boundingBox: d.boundingBox, // normalized coordinates
        confidence: d.confidence,
        label: d.label,
        trackId: d.trackId,
        attributes: d.attributes ?? {},
      }));
      return filtered;
    } catch (error) {
      console.warn('detectPersons failed:', error);
      return [];
    }
  }

  // ============================================================================
  // Tracking (DeepSORT Algorithm)
  // ============================================================================

  private async updateTracking(detections: any[], frame: DetectionFrame): Promise<void> {
    try {
      const pipeline = getInferencePipeline();
      // Let the pipeline tracker assign track IDs
      const timestamp = frame.timestamp || new Date();
      const tracked = pipeline.updateTracking(detections as any, timestamp, 'person');

      const now = timestamp;
      const activeTrackIds = new Set<string>();

      for (const det of tracked) {
        const trackId: string = (det as any).trackId ?? `person_${randomUUID().substring(0,8)}`;
        activeTrackIds.add(trackId);

        const existing = this.tracks.get(trackId);
        const bbox = (det as any).boundingBox;
        if (existing) {
          this.updateTrack(existing, { boundingBox: bbox, confidence: det.confidence }, now);
        } else {
          const newTrack = this.createNewTrack({ boundingBox: bbox, confidence: det.confidence, trackId }, now);
          newTrack.trackId = trackId;
          this.tracks.set(trackId, newTrack);
        }
      }

      // Mark inactive tracks
      for (const [trackId, track] of this.tracks.entries()) {
        if (!activeTrackIds.has(trackId)) {
          track.lastSeen = now;
        }
      }
    } catch (error) {
      console.warn('updateTracking pipeline failed:', error);
      // Fallback: keep existing logic
      const now = frame.timestamp;
      const activeTrackIds = new Set<string>();

      for (const detection of detections) {
        const matchedTrack = this.findMatchingTrack(detection);

        if (matchedTrack) {
          this.updateTrack(matchedTrack, detection, now);
          activeTrackIds.add(matchedTrack.trackId);
        } else {
          const newTrack = this.createNewTrack(detection, now);
          this.tracks.set(newTrack.trackId, newTrack);
          activeTrackIds.add(newTrack.trackId);
        }
      }

      for (const [trackId, track] of this.tracks.entries()) {
        if (!activeTrackIds.has(trackId)) {
          track.lastSeen = now;
        }
      }
    }
  }

  private findMatchingTrack(detection: any): PersonTrack | undefined {
    let bestMatch: PersonTrack | undefined;
    let bestScore = 0;

    for (const track of this.tracks.values()) {
      const timeSinceLastSeen = Date.now() - track.lastSeen.getTime();
      if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS) continue;

      // Calculate IoU (Intersection over Union)
      const iou = this.calculateIoU(
        detection.boundingBox,
        track.positions[track.positions.length - 1].boundingBox
      );

      // Combine IoU with appearance similarity if available
      let score = iou;
      if (track.reIdFeature && detection.reIdFeature) {
        const cosineSim = this.cosineSimilarity(track.reIdFeature, detection.reIdFeature);
        score = 0.6 * iou + 0.4 * cosineSim;
      }

      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = track;
      }
    }

    return bestMatch;
  }

  private updateTrack(track: PersonTrack, detection: any, timestamp: Date): void {
    track.lastSeen = timestamp;
    track.positions.push({
      x: detection.boundingBox.x + detection.boundingBox.width / 2,
      y: detection.boundingBox.y + detection.boundingBox.height / 2,
      timestamp,
      boundingBox: detection.boundingBox,
    });

    // Update dwell time
    track.dwellTimeSeconds = (timestamp.getTime() - track.firstSeen.getTime()) / 1000;

    // Check if stationary
    if (track.positions.length >= 5) {
      const recent = track.positions.slice(-5);
      const movement = this.calculateMovement(recent);
      track.isStationary = movement < this.STATIONARY_THRESHOLD;
    }

    // Calculate speed
    if (track.positions.length >= 2) {
      track.speed = this.calculateSpeed(track.positions.slice(-2));
    }

    // Update confidence
    const confidences = track.positions.map(p => detection.confidence || 0.8);
    track.avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  private createNewTrack(detection: any, timestamp: Date): PersonTrack {
    return {
      trackId: `person_${randomUUID().substring(0, 8)}`,
      firstSeen: timestamp,
      lastSeen: timestamp,
      positions: [{
        x: detection.boundingBox.x + detection.boundingBox.width / 2,
        y: detection.boundingBox.y + detection.boundingBox.height / 2,
        timestamp,
        boundingBox: detection.boundingBox,
      }],
      isStationary: false,
      dwellTimeSeconds: 0,
      avgConfidence: detection.confidence || 0.8,
      currentActivity: 'standing',
      speed: 0,
      trajectory: [],
    };
  }

  // ============================================================================
  // Re-Identification (OSNet)
  // ============================================================================

  private async extractReIdFeatures(persons: any[], frame: DetectionFrame): Promise<void> {
    try {
      const pipeline = getInferencePipeline();
      for (const person of persons) {
        // Use pipeline to extract person embedding (if available)
        try {
          const embedding = await pipeline.extractPersonEmbedding(frame, person.boundingBox);
          if (!embedding) continue;
          const trackId = person.trackId;
          let track: PersonTrack | undefined;
          if (trackId) track = this.tracks.get(trackId);
          if (!track) {
            // fallback: find by IoU
            track = this.findMatchingTrack(person);
          }
          if (track) {
            track.reIdFeature = embedding;
            track.reIdConfidence = person.confidence ?? 1;
          }
        } catch (inner) {
          // ignore per-person failures
        }
      }
    } catch (error) {
      console.warn('extractReIdFeatures failed:', error);
    }
  }

  private async performReIdentification(): Promise<void> {
    // Match current tracks with global Re-ID database
    for (const track of this.tracks.values()) {
      if (!track.reIdFeature) continue;

      // Find best match in database
      let bestMatch: string | undefined;
      let bestSimilarity = 0;

      for (const [globalId, storedFeature] of this.reIdDatabase.features.entries()) {
        const similarity = this.cosineSimilarity(track.reIdFeature, storedFeature);
        
        if (similarity > bestSimilarity && similarity > this.REID_SIMILARITY_THRESHOLD) {
          bestSimilarity = similarity;
          bestMatch = globalId;
        }
      }

      if (bestMatch) {
        // Existing person re-appeared
        track.globalPersonId = bestMatch;
        this.reIdDatabase.lastSeen.set(bestMatch, track.lastSeen);
      } else {
        // New unique person
        const globalId = `global_person_${randomUUID().substring(0, 8)}`;
        track.globalPersonId = globalId;
        this.reIdDatabase.features.set(globalId, track.reIdFeature);
        this.reIdDatabase.lastSeen.set(globalId, track.lastSeen);
      }
    }
  }

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
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============================================================================
  // Behavior Analysis
  // ============================================================================

  private async analyzeBehaviors(frame: DetectionFrame): Promise<BehaviorEvent[]> {
    const events: BehaviorEvent[] = [];

    for (const track of this.tracks.values()) {
      // Running detection (high speed)
      if (track.speed && track.speed > 2.0) {
        events.push(this.createBehaviorEvent(track, 'running', 0.85));
      }

      // Loitering detection (stationary for extended period)
      if (track.isStationary && track.dwellTimeSeconds > this.LOITERING_THRESHOLD_S) {
        events.push(this.createBehaviorEvent(track, 'loitering', 0.90));
      }

      // Sitting/Standing detection (requires pose estimation)
      const pose = await this.estimatePose(track, frame);
      if (pose) {
        const activity = this.classifyActivity(pose);
        if (activity) {
          events.push(this.createBehaviorEvent(track, activity, 0.80));
        }
      }

      // Fighting detection (requires multi-person interaction analysis)
      const fighting = await this.detectFighting(track, frame);
      if (fighting) {
        events.push(this.createBehaviorEvent(track, 'fighting', fighting.confidence));
      }

      // Hands raised detection
      if (pose && this.areHandsRaised(pose)) {
        events.push(this.createBehaviorEvent(track, 'hands_raised', 0.88));
      }
    }

    return events;
  }

  private async estimatePose(track: PersonTrack, frame: DetectionFrame): Promise<PoseKeypoints | null> {
    try {
      const pipeline = getInferencePipeline();
      const lastPos = track.positions[track.positions.length - 1];
      if (!lastPos || !lastPos.boundingBox) return null;
      // Assume boundingBox stored in normalized coordinates
      const pose = await pipeline.estimatePose(frame, lastPos.boundingBox as any);
      return pose;
    } catch (error) {
      console.warn('estimatePose failed:', error);
      return null;
    }
  }

  private classifyActivity(pose: PoseKeypoints): BehaviorEvent['behavior'] | null {
    // Analyze pose keypoints to determine activity
    
    // Sitting: Hips lower than knees, knees bent
    const hipY = (pose.leftHip.y + pose.rightHip.y) / 2;
    const kneeY = (pose.leftKnee.y + pose.rightKnee.y) / 2;
    if (hipY > kneeY && Math.abs(hipY - kneeY) > 0.1) {
      return 'sitting';
    }

    // Crawling: All keypoints near same Y level, hands on ground
    const avgY = (pose.nose.y + pose.leftWrist.y + pose.rightWrist.y + pose.leftAnkle.y + pose.rightAnkle.y) / 5;
    const variance = this.calculateVariance([pose.nose.y, pose.leftWrist.y, pose.rightWrist.y, pose.leftAnkle.y, pose.rightAnkle.y]);
    if (variance < 0.05 && avgY > 0.7) {
      return 'crawling';
    }

    // Sleeping: Person horizontal, no movement
    if (this.isPoseHorizontal(pose)) {
      return 'sleeping';
    }

    return null;
  }

  private areHandsRaised(pose: PoseKeypoints): boolean {
    const leftWristY = pose.leftWrist.y;
    const rightWristY = pose.rightWrist.y;
    const shoulderY = (pose.leftShoulder.y + pose.rightShoulder.y) / 2;
    
    // Both hands above shoulders
    return leftWristY < shoulderY && rightWristY < shoulderY;
  }

  private isPoseHorizontal(pose: PoseKeypoints): boolean {
    const noseY = pose.nose.y;
    const ankleY = (pose.leftAnkle.y + pose.rightAnkle.y) / 2;
    
    // If vertical difference is small, person is likely horizontal
    return Math.abs(noseY - ankleY) < 0.15;
  }

  private async detectFighting(track: PersonTrack, frame: DetectionFrame): Promise<{ confidence: number } | null> {
    // TODO: Implement fighting detection
    // Requires multi-person interaction analysis:
    // 1. Two or more people in close proximity
    // 2. Rapid, aggressive movements
    // 3. Unusual pose patterns
    // 4. High velocity changes
    
    return null;
  }

  private createBehaviorEvent(track: PersonTrack, behavior: BehaviorEvent['behavior'], confidence: number): BehaviorEvent {
    const lastPos = track.positions[track.positions.length - 1];
    
    return {
      personTrackId: track.trackId,
      behavior,
      confidence,
      startTime: track.firstSeen,
      duration: track.dwellTimeSeconds,
      location: { x: lastPos.x, y: lastPos.y },
      metadata: {
        globalPersonId: track.globalPersonId,
        speed: track.speed,
        isStationary: track.isStationary,
      },
    };
  }

  // ============================================================================
  // Person Counting
  // ============================================================================

  private updatePersonCounts(timestamp: Date): Map<string, PersonCount> {
    const counts = new Map<string, PersonCount>();
    
    // Count unique persons based on Re-ID
    const uniquePersons = new Set<string>();
    let totalDetections = 0;
    
    for (const track of this.tracks.values()) {
      totalDetections++;
      if (track.globalPersonId) {
        uniquePersons.add(track.globalPersonId);
      }
    }
    
    counts.set('global', {
      total: totalDetections,
      unique: uniquePersons.size,
      entering: 0,  // TODO: Implement zone entry/exit tracking
      exiting: 0,
      occupancy: totalDetections,
    });
    
    return counts;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private calculateSpeed(positions: any[]): number {
    if (positions.length < 2) return 0;
    
    const [p1, p2] = positions;
    const distance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
    const timeDelta = (p2.timestamp.getTime() - p1.timestamp.getTime()) / 1000;
    
    return timeDelta > 0 ? distance / timeDelta : 0;
  }

  private calculateMovement(positions: any[]): number {
    if (positions.length < 2) return 0;
    
    let totalMovement = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
    
    return totalMovement;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  // ============================================================================
  // Result Formatting
  // ============================================================================

  private createPersonDetectionResult(persons: any[]): DetectionResult {
    return {
      detectionType: "person",
      confidence: persons.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / persons.length,
      objects: persons.map(p => ({
        label: "person",
        confidence: p.confidence || 0.8,
        trackId: p.trackId,
        boundingBox: p.boundingBox,
      })),
      metadata: {
        totalPersons: persons.length,
        trackedPersons: Array.from(this.tracks.values()).map(t => ({
          trackId: t.trackId,
          globalPersonId: t.globalPersonId,
          dwellTime: t.dwellTimeSeconds,
          isStationary: t.isStationary,
          currentActivity: t.currentActivity,
          speed: t.speed,
        })),
      },
      requiresAlert: false,
    };
  }

  private createBehaviorResults(behaviors: BehaviorEvent[]): DetectionResult[] {
    return behaviors.map(behavior => ({
      detectionType: this.mapBehaviorToDetectionType(behavior.behavior),
      confidence: behavior.confidence,
      objects: [{
        label: behavior.behavior,
        confidence: behavior.confidence,
        trackId: behavior.personTrackId,
        boundingBox: { 
          x: behavior.location.x - 0.05, 
          y: behavior.location.y - 0.05, 
          width: 0.1, 
          height: 0.1 
        },
      }],
      metadata: {
        behavior: behavior.behavior,
        duration: behavior.duration,
        personTrackId: behavior.personTrackId,
        globalPersonId: behavior.metadata?.globalPersonId,
      },
      requiresAlert: this.shouldAlertOnBehavior(behavior.behavior),
    }));
  }

  private createCountingResult(counts: Map<string, PersonCount>): DetectionResult {
    const globalCount = counts.get('global')!;
    
    return {
      detectionType: "person-count",
      confidence: 0.95,
      objects: [],
      metadata: {
        total: globalCount.total,
        unique: globalCount.unique,
        occupancy: globalCount.occupancy,
        timestamp: new Date().toISOString(),
      },
      requiresAlert: false,
    };
  }

  private mapBehaviorToDetectionType(behavior: string): string {
    const mapping: Record<string, string> = {
      'running': 'person-running',
      'fighting': 'fighting-detected',
      'falling': 'fall',
      'loitering': 'loitering',
      'hands_raised': 'hands-raised',
      'sitting': 'person-sitting',
      'crawling': 'person-crawling',
      'sleeping': 'sleeping-person',
    };
    return mapping[behavior] || 'abnormal-behavior';
  }

  private shouldAlertOnBehavior(behavior: string): boolean {
    const alertBehaviors = ['fighting', 'falling', 'hands_raised', 'abnormal'];
    return alertBehaviors.includes(behavior);
  }

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  private startTrackingCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const staleTrackIds: string[] = [];

      for (const [trackId, track] of this.tracks.entries()) {
        const timeSinceLastSeen = now - track.lastSeen.getTime();
        if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS * 2) {
          staleTrackIds.push(trackId);
        }
      }

      // Remove stale tracks
      for (const trackId of staleTrackIds) {
        this.tracks.delete(trackId);
      }

      if (staleTrackIds.length > 0) {
        console.log(`Cleaned up ${staleTrackIds.length} stale person tracks`);
      }
    }, 10000); // Run every 10 seconds
  }

  private startBehaviorAnalysis(): void {
    setInterval(() => {
      // Cleanup old behavior events
      const now = Date.now();
      for (const [key, event] of this.behaviorEvents.entries()) {
        if (now - event.startTime.getTime() > 300000) { // 5 minutes
          this.behaviorEvents.delete(key);
        }
      }
    }, 30000); // Run every 30 seconds
  }

  async cleanup(): Promise<void> {
    this.tracks.clear();
    this.behaviorEvents.clear();
    this.reIdDatabase.features.clear();
    this.reIdDatabase.lastSeen.clear();
    this.reIdDatabase.metadata.clear();
    console.log("Human Analytics detector cleaned up");
  }

  getHealth() {
    return {
      status: 'healthy' as const,
      details: 'Human analytics detector is available'
    };
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Get all active person tracks
   */
  getActiveTracks(): PersonTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get unique person count (based on Re-ID)
   */
  getUniquePersonCount(): number {
    return this.reIdDatabase.features.size;
  }

  /**
   * Search persons by Re-ID feature
   */
  searchPersonByFeature(feature: number[], threshold = 0.7): string | null {
    let bestMatch: string | null = null;
    let bestSimilarity = 0;

    for (const [globalId, storedFeature] of this.reIdDatabase.features.entries()) {
      const similarity = this.cosineSimilarity(feature, storedFeature);
      if (similarity > bestSimilarity && similarity > threshold) {
        bestSimilarity = similarity;
        bestMatch = globalId;
      }
    }

    return bestMatch;
  }

  /**
   * Get person journey (all appearances across cameras)
   */
  getPersonJourney(globalPersonId: string): any {
    // TODO: Implement cross-camera journey tracking
    return {
      globalPersonId,
      appearances: [],
      firstSeen: this.reIdDatabase.lastSeen.get(globalPersonId),
      lastSeen: this.reIdDatabase.lastSeen.get(globalPersonId),
    };
  }
}
