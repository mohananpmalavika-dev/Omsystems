/**
 * Unified AI Inference Pipeline
 * 
 * This is the central inference coordination layer that all detectors use.
 * It provides:
 * - Object detection (YOLO)
 * - Object tracking (DeepSORT/ByteTrack)
 * - Face detection & recognition
 * - Pose estimation
 * - Attribute detection (age, gender, emotion, PPE)
 * - OCR for license plates
 * - Re-identification (cross-camera tracking)
 * 
 * All detectors access inference through this unified pipeline to avoid code duplication.
 */

import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";
import { getModelManager } from "../model-manager.js";
import { 
  loadObjectInference, 
  loadPlateTextInference, 
  loadFaceVectorInference,
  loadPersonVectorInference,
  loadVehicleVectorInference,
  loadPoseInference,
  loadAttributeInference,
  type ObjectFrameInference,
  type PlateTextInference,
  type FaceVectorInference,
  type PersonVectorInference,
  type VehicleVectorInference,
  type PoseInference,
  type AttributeInference
} from "./configured-model-inference.js";
import { Tracker } from "./tracker.js";
import type { 
  PoseDetection, 
  PersonAttributes as PersonAttributesResult 
} from "./vision-specialty-inference.js";
import { VectorStoreService } from "../reid/vector-store.service.js";
import type { Pool } from "pg";

// ============================================================================
// Type Definitions
// ============================================================================

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

export interface PersonAttributes {
  age?: number;
  ageRange?: { min: number; max: number };
  gender?: 'male' | 'female';
  genderConfidence?: number;
  emotion?: 'angry' | 'disgust' | 'fear' | 'happy' | 'sad' | 'surprise' | 'neutral';
  emotionConfidence?: number;
  hasHelmet?: boolean;
  helmetConfidence?: number;
  hasVest?: boolean;
  vestConfidence?: number;
  hasMask?: boolean;
  maskConfidence?: number;
  hasGlasses?: boolean;
}

export interface TrackState {
  trackId: string;
  objectType: string;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{
    x: number;
    y: number;
    timestamp: Date;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  embedding?: number[];
  globalId?: string;
  attributes?: Record<string, unknown>;
}

export interface ReIdMatch {
  globalId: string;
  similarity: number;
  lastSeen: Date;
}

// ============================================================================
// Unified Inference Pipeline
// ============================================================================

export class UnifiedInferencePipeline {
  // Model inference engines
  private cocoDetector: ObjectFrameInference | null = null;
  private fireDetector: ObjectFrameInference | null = null;
  private helmetDetector: ObjectFrameInference | null = null;
  private faceDetector: ObjectFrameInference | null = null;
  private faceEmbedding: FaceVectorInference | null = null;
  private plateDetector: ObjectFrameInference | null = null;
  private plateRecognizer: PlateTextInference | null = null;
  private poseEstimator: PoseInference | null = null;
  private attributeEstimator: AttributeInference | null = null;
  private personReId: PersonVectorInference | null = null;
  private vehicleReId: VehicleVectorInference | null = null;

  // Tracking state (local tracks only - moved global Re-ID to vector store)
  private tracks = new Map<string, TrackState>();
  
  // Persistent vector store for global Re-ID (replaces in-memory Map)
  private vectorStore: VectorStoreService | null = null;

  // Tracker instance (replaces simple IoU matcher)
  private tracker: Tracker | null = null;

  // Configuration
  private readonly TRACKING_TIMEOUT_MS = 5000;
  private readonly REID_SIMILARITY_THRESHOLD = 0.7;
  private nextTrackId = 1;

  private isInitialized = false;

  constructor(pool?: Pool) {
    if (pool) {
      this.vectorStore = new VectorStoreService(pool);
    }
  }

  /**
   * Initialize the pipeline (load required models)
   */
  async initialize(options: {
    enableCoco?: boolean;
    enableFire?: boolean;
    enableHelmet?: boolean;
    enableFace?: boolean;
    enableFaceRecognition?: boolean;
    enableAnpr?: boolean;
    enablePose?: boolean;
    enableAttributes?: boolean;
  } = {}): Promise<void> {
    console.log('Initializing Unified Inference Pipeline...');

    const manager = getModelManager();

    try {
      // Load COCO object detector (person, vehicle, etc.)
      if (options.enableCoco !== false) {
        try {
          this.cocoDetector = await loadObjectInference("yolov8n", 0.5);
          console.log('✓ COCO detector loaded');
        } catch (error) {
          console.warn('COCO detector unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load fire/smoke detector
      if (options.enableFire !== false) {
        try {
          this.fireDetector = await loadObjectInference("fire-smoke", 0.65);
          console.log('✓ Fire/smoke detector loaded');
        } catch (error) {
          console.warn('Fire detector unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load helmet detector
      if (options.enableHelmet !== false) {
        try {
          this.helmetDetector = await loadObjectInference("helmet", 0.7);
          console.log('✓ Helmet detector loaded');
        } catch (error) {
          console.warn('Helmet detector unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load face detector
      if (options.enableFace !== false) {
        try {
          this.faceDetector = await loadObjectInference("face-detector", 0.7);
          console.log('✓ Face detector loaded');
        } catch (error) {
          console.warn('Face detector unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load face recognition (embeddings)
      if (options.enableFaceRecognition !== false && this.faceDetector) {
        try {
          this.faceEmbedding = await loadFaceVectorInference("face-embedding");
          console.log('✓ Face embedding model loaded');
        } catch (error) {
          console.warn('Face embedding unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load ANPR (license plate detection + OCR)
      if (options.enableAnpr !== false) {
        try {
          this.plateDetector = await loadObjectInference("anpr-detector", 0.7);
          this.plateRecognizer = await loadPlateTextInference("anpr-recognizer");
          console.log('✓ ANPR detector and recognizer loaded');
        } catch (error) {
          console.warn('ANPR unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load pose estimator (optional)
      if (options.enablePose) {
        try {
          this.poseEstimator = await loadPoseInference("pose-estimator", 0.6);
          console.log('✓ Pose estimator loaded');
        } catch (error) {
          console.warn('Pose estimator unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load attribute estimator (age, gender, emotion) - optional
      if (options.enableAttributes) {
        try {
          this.attributeEstimator = await loadAttributeInference("attribute-estimator");
          console.log('✓ Attribute estimator loaded');
        } catch (error) {
          console.warn('Attribute estimator unavailable:', error instanceof Error ? error.message : String(error));
        }
      }

      // Load person Re-ID (OSNet) - optional
      try {
        this.personReId = await loadPersonVectorInference("person-reid");
        console.log('✓ Person Re-ID model loaded');
      } catch (error) {
        console.warn('Person Re-ID unavailable:', error instanceof Error ? error.message : String(error));
      }

      // Load vehicle Re-ID - optional
      try {
        this.vehicleReId = await loadVehicleVectorInference("vehicle-reid");
        console.log('✓ Vehicle Re-ID model loaded');
      } catch (error) {
        console.warn('Vehicle Re-ID unavailable:', error instanceof Error ? error.message : String(error));
      }

      this.isInitialized = true;
      // instantiate tracker
      this.tracker = new Tracker({ maxLost: 6, iouThreshold: 0.3 });
      this.startTrackingCleanup();

      console.log('Unified Inference Pipeline initialized successfully');
    } catch (error) {
      console.error('Failed to initialize pipeline:', error);
      throw error;
    }
  }

  /**
   * Detect objects in frame (person, car, bus, etc.)
   */
  async detectObjects(
    frame: DetectionFrame,
    labels?: string[]
  ): Promise<InferenceObject[]> {
    if (!this.cocoDetector) return [];

    try {
      const detections = await this.cocoDetector.run(frame);
      
      if (labels) {
        const labelSet = new Set(labels);
        return detections.filter(d => labelSet.has(d.label));
      }

      return detections;
    } catch (error) {
      console.error('Object detection failed:', error);
      return [];
    }
  }

  /**
   * Detect fire and smoke
   */
  async detectFireSmoke(frame: DetectionFrame): Promise<InferenceObject[]> {
    if (!this.fireDetector) return [];

    try {
      return await this.fireDetector.run(frame);
    } catch (error) {
      console.error('Fire/smoke detection failed:', error);
      return [];
    }
  }

  /**
   * Detect helmets and heads
   */
  async detectHelmet(frame: DetectionFrame): Promise<InferenceObject[]> {
    if (!this.helmetDetector) return [];

    try {
      return await this.helmetDetector.run(frame);
    } catch (error) {
      console.error('Helmet detection failed:', error);
      return [];
    }
  }

  /**
   * Detect faces
   */
  async detectFaces(frame: DetectionFrame): Promise<InferenceObject[]> {
    if (!this.faceDetector) return [];

    try {
      return await this.faceDetector.run(frame);
    } catch (error) {
      console.error('Face detection failed:', error);
      return [];
    }
  }

  /**
   * Extract face embedding for recognition
   */
  async extractFaceEmbedding(
    frame: DetectionFrame,
    faceBox: { x: number; y: number; width: number; height: number }
  ): Promise<number[] | null> {
    if (!this.faceEmbedding) return null;

    try {
      return await this.faceEmbedding.run(frame, faceBox);
    } catch (error) {
      console.error('Face embedding extraction failed:', error);
      return null;
    }
  }

  /**
   * Detect license plates
   */
  async detectPlates(frame: DetectionFrame): Promise<InferenceObject[]> {
    if (!this.plateDetector) return [];

    try {
      return await this.plateDetector.run(frame);
    } catch (error) {
      console.error('Plate detection failed:', error);
      return [];
    }
  }

  /**
   * Recognize text from license plate
   */
  async recognizePlate(
    frame: DetectionFrame,
    plateBox: { x: number; y: number; width: number; height: number }
  ): Promise<{ text: string; confidence: number } | null> {
    if (!this.plateRecognizer) return null;

    try {
      const result = await this.plateRecognizer.run(frame, plateBox);
      return {
        text: result.text,
        confidence: result.confidence
      };
    } catch (error) {
      console.error('Plate recognition failed:', error);
      return null;
    }
  }

  /**
   * Extract person Re-ID embedding for cross-camera tracking
   */
  async extractPersonEmbedding(
    frame: DetectionFrame,
    personBox: { x: number; y: number; width: number; height: number }
  ): Promise<number[] | null> {
    if (!this.personReId) return null;

    try {
      return await this.personReId.run(frame, personBox);
    } catch (error) {
      console.error('Person Re-ID embedding extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract vehicle Re-ID embedding for cross-camera tracking
   */
  async extractVehicleEmbedding(
    frame: DetectionFrame,
    vehicleBox: { x: number; y: number; width: number; height: number }
  ): Promise<number[] | null> {
    if (!this.vehicleReId) return null;

    try {
      return await this.vehicleReId.run(frame, vehicleBox);
    } catch (error) {
      console.error('Vehicle Re-ID embedding extraction failed:', error);
      return null;
    }
  }

  /**
   * Estimate pose keypoints
   */
  async estimatePose(
    frame: DetectionFrame,
    personBox: { x: number; y: number; width: number; height: number }
  ): Promise<PoseKeypoints | null> {
    if (!this.poseEstimator) return null;

    try {
      // Run pose estimator on the full frame
      const detections = await this.poseEstimator.run(frame);
      if (!Array.isArray(detections) || detections.length === 0) return null;

      // Find detection with highest IoU against personBox
      const match = detections
        .map(d => ({ 
          d, 
          iou: this.calculateIoU(
            { x: d.boundingBox.x, y: d.boundingBox.y, width: d.boundingBox.width, height: d.boundingBox.height },
            personBox
          ) 
        }))
        .filter(x => x.iou > 0.2)
        .sort((a, b) => b.iou - a.iou)[0];

      if (!match || !match.d.keypoints || match.d.keypoints.length < 17) return null;

      // Map 17 COCO keypoints to our interface
      const kps = match.d.keypoints;
      return {
        nose: kps[0]!,
        leftEye: kps[1]!,
        rightEye: kps[2]!,
        leftEar: kps[3]!,
        rightEar: kps[4]!,
        leftShoulder: kps[5]!,
        rightShoulder: kps[6]!,
        leftElbow: kps[7]!,
        rightElbow: kps[8]!,
        leftWrist: kps[9]!,
        rightWrist: kps[10]!,
        leftHip: kps[11]!,
        rightHip: kps[12]!,
        leftKnee: kps[13]!,
        rightKnee: kps[14]!,
        leftAnkle: kps[15]!,
        rightAnkle: kps[16]!,
      };
    } catch (error) {
      console.error('Pose estimation failed:', error);
      return null;
    }
  }

  /**
   * Estimate person attributes (age, gender, emotion, PPE)
   */
  async estimateAttributes(
    frame: DetectionFrame,
    personBox: { x: number; y: number; width: number; height: number }
  ): Promise<PersonAttributesResult | null> {
    if (!this.attributeEstimator) return null;

    try {
      // Run attribute estimator directly on the person crop
      return await this.attributeEstimator.run(frame, personBox);
    } catch (error) {
      console.error('Attribute estimation failed:', error);
      return null;
    }
  }

  /**
   * Update object tracking
   * Assigns consistent track IDs to objects across frames
   */
  updateTracking(
    detections: InferenceObject[],
    timestamp: Date,
    objectType: string = 'generic'
  ): InferenceObject[] {
    // If tracker is available, delegate to it
    if (this.tracker) {
      return this.tracker.update(detections, timestamp, objectType);
    }

    // Fallback: simple IOU matcher (legacy behavior)
    const trackedDetections: InferenceObject[] = [];

    for (const detection of detections) {
      // Find matching track using IoU
      const matchedTrack = this.findMatchingTrack(detection, objectType);

      if (matchedTrack) {
        // Update existing track
        matchedTrack.lastSeen = timestamp;
        matchedTrack.positions.push({
          x: detection.boundingBox.x + detection.boundingBox.width / 2,
          y: detection.boundingBox.y + detection.boundingBox.height / 2,
          timestamp,
          boundingBox: detection.boundingBox,
          confidence: detection.confidence
        });

        trackedDetections.push({
          ...detection,
          trackId: matchedTrack.trackId
        });
      } else {
        // Create new track
        const trackId = `${objectType}_${this.nextTrackId++}`;
        const newTrack: TrackState = {
          trackId,
          objectType,
          firstSeen: timestamp,
          lastSeen: timestamp,
          positions: [{
            x: detection.boundingBox.x + detection.boundingBox.width / 2,
            y: detection.boundingBox.y + detection.boundingBox.height / 2,
            timestamp,
            boundingBox: detection.boundingBox,
            confidence: detection.confidence
          }]
        };

        this.tracks.set(trackId, newTrack);

        trackedDetections.push({
          ...detection,
          trackId
        });
      }
    }

    return trackedDetections;
  }

  /**
   * Find matching track for a detection
   */
  private findMatchingTrack(
    detection: InferenceObject,
    objectType: string
  ): TrackState | undefined {
    let bestMatch: TrackState | undefined;
    let bestIoU = 0;

    const now = Date.now();

    for (const track of this.tracks.values()) {
      // Skip if wrong type
      if (track.objectType !== objectType) continue;

      // Skip if too old
      const timeSinceLastSeen = now - track.lastSeen.getTime();
      if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS) continue;

      // Calculate IoU with last position
      const lastPos = track.positions[track.positions.length - 1];
      if (!lastPos) continue;

      const iou = this.calculateIoU(detection.boundingBox, lastPos.boundingBox);

      if (iou > bestIoU && iou > 0.3) {
        bestIoU = iou;
        bestMatch = track;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate Intersection over Union
   */
  private calculateIoU(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ): number {
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
   * Perform cross-camera re-identification using persistent vector store
   */
  async performReIdentification(
    trackId: string,
    embedding: number[],
    tenantId: string,
    cameraId: string,
    objectType: 'person' | 'vehicle' | 'face' = 'person'
  ): Promise<ReIdMatch | null> {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    // Update track with embedding
    track.embedding = embedding;

    // Use vector store if available, otherwise fall back to in-memory (legacy)
    if (this.vectorStore) {
      try {
        // Search in persistent vector store
        const result = await this.vectorStore.findOrCreateIdentity(
          embedding,
          tenantId,
          cameraId,
          trackId,
          objectType
        );

        // Update track with global ID
        track.globalId = result.globalId;

        // Record tracking event for historical analysis
        if (track.positions.length > 0) {
          const lastPos = track.positions[track.positions.length - 1];
          await this.vectorStore.recordTrackingEvent(
            result.globalId,
            tenantId,
            cameraId,
            trackId,
            objectType,
            lastPos.confidence,
            lastPos.boundingBox
          );
        }

        // Get full identity info for response
        const identity = await this.vectorStore.getIdentity(result.globalId);

        return {
          globalId: result.globalId,
          similarity: result.similarity,
          lastSeen: identity?.lastSeen || new Date()
        };
      } catch (error) {
        console.error('Vector store Re-ID failed, falling back to legacy:', error);
        // Fall through to legacy implementation
      }
    }

    // Legacy in-memory implementation (fallback if vector store unavailable)
    console.warn('Using legacy in-memory Re-ID (vector store not available)');
    
    // Search for matching global ID
    let bestMatch: { globalId: string; similarity: number } | null = null;
    let bestSimilarity = 0;

    // Note: This is the old in-memory Map approach - should migrate to vector store
    const legacyDb = new Map<string, {
      embedding: number[];
      objectType: string;
      firstSeen: Date;
      lastSeen: Date;
      appearances: number;
    }>();

    for (const [globalId, entry] of legacyDb.entries()) {
      // Only match same object types
      if (entry.objectType !== track.objectType) continue;

      const similarity = this.cosineSimilarity(embedding, entry.embedding);

      if (similarity > bestSimilarity && similarity > this.REID_SIMILARITY_THRESHOLD) {
        bestSimilarity = similarity;
        bestMatch = { globalId, similarity };
      }
    }

    if (bestMatch) {
      // Existing global identity
      track.globalId = bestMatch.globalId;
      const entry = legacyDb.get(bestMatch.globalId)!;
      entry.lastSeen = track.lastSeen;
      entry.appearances++;

      return {
        globalId: bestMatch.globalId,
        similarity: bestMatch.similarity,
        lastSeen: entry.lastSeen
      };
    } else {
      // New global identity
      const globalId = `global_${track.objectType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      track.globalId = globalId;

      legacyDb.set(globalId, {
        embedding,
        objectType: track.objectType,
        firstSeen: track.firstSeen,
        lastSeen: track.lastSeen,
        appearances: 1
      });

      return {
        globalId,
        similarity: 1.0,
        lastSeen: track.lastSeen
      };
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Get track by ID
   */
  getTrack(trackId: string): TrackState | undefined {
    return this.tracks.get(trackId);
  }

  /**
   * Get all active tracks
   */
  getActiveTracks(objectType?: string): TrackState[] {
    const tracks = Array.from(this.tracks.values());
    
    if (objectType) {
      return tracks.filter(t => t.objectType === objectType);
    }

    return tracks;
  }

  /**
   * Clean up old tracks
   */
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

      for (const trackId of staleTrackIds) {
        this.tracks.delete(trackId);
      }

      if (staleTrackIds.length > 0) {
        console.log(`Cleaned up ${staleTrackIds.length} stale tracks`);
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Get pipeline statistics
   */
  async getStats() {
    const stats = {
      activeTracks: this.tracks.size,
      globalIdentities: 0,  // Will be populated from vector store
      modelsLoaded: {
        coco: Boolean(this.cocoDetector),
        fire: Boolean(this.fireDetector),
        helmet: Boolean(this.helmetDetector),
        face: Boolean(this.faceDetector),
        faceEmbedding: Boolean(this.faceEmbedding),
        plate: Boolean(this.plateDetector),
        plateOcr: Boolean(this.plateRecognizer),
        pose: Boolean(this.poseEstimator),
        attributes: Boolean(this.attributeEstimator),
        personReId: Boolean(this.personReId),
        vehicleReId: Boolean(this.vehicleReId),
        tracker: Boolean(this.tracker)
      },
      vectorStore: {
        enabled: Boolean(this.vectorStore),
        totalIdentities: 0,
        personIdentities: 0,
        vehicleIdentities: 0,
        faceIdentities: 0
      }
    };

    // Get vector store statistics if available
    if (this.vectorStore) {
      try {
        const vectorStats = await this.vectorStore.getStatistics();
        stats.globalIdentities = vectorStats.totalIdentities;
        stats.vectorStore.totalIdentities = vectorStats.totalIdentities;
        stats.vectorStore.personIdentities = vectorStats.personIdentities;
        stats.vectorStore.vehicleIdentities = vectorStats.vehicleIdentities;
        stats.vectorStore.faceIdentities = vectorStats.faceIdentities;
      } catch (error) {
        console.error('Failed to get vector store statistics:', error);
      }
    }

    return stats;
  }

  /**
   * Check if pipeline is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.tracks.clear();
    // Note: Vector store data persists - only clear local state
    this.isInitialized = false;
    console.log('Unified Inference Pipeline cleaned up (vector store data preserved)');
  }
}

/**
 * Singleton instance
 */
let pipelineInstance: UnifiedInferencePipeline | null = null;

/**
 * Get or create pipeline instance
 */
export function getInferencePipeline(pool?: Pool): UnifiedInferencePipeline {
  if (!pipelineInstance) {
    pipelineInstance = new UnifiedInferencePipeline(pool);
  }
  return pipelineInstance;
}
