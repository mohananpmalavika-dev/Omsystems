/**
 * Face Detection and Recognition (Phase 2)
 * Detects faces and optionally matches against watchlists
 */

import {
  BaseDetector,
  type DetectedObject,
  type DetectionFrame,
  type DetectionResult,
  getInferenceObjects,
  normalizeBoundingBox,
} from "./base-detector.js";

export interface FaceDetectorConfig {
  modelPath?: string;
  detectionConfidence: number;
  recognitionEnabled: boolean;
  recognitionThreshold: number;
  landmarksEnabled: boolean;
  ageGenderEnabled: boolean;
  maskDetectionEnabled: boolean;
}

export interface FaceFeatures {
  embedding: number[]; // 128 or 512-dimensional face embedding
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    leftMouth: { x: number; y: number };
    rightMouth: { x: number; y: number };
  };
  age?: number;
  gender?: "male" | "female";
  wearingMask?: boolean;
  quality?: number; // Face quality score (0-1)
}

export interface WatchlistMatch {
  watchlistId: string;
  personId: string;
  personName: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export class FaceDetector extends BaseDetector {
  private config: FaceDetectorConfig;
  private detectionModel: any = null;
  private recognitionModel: any = null;
  private watchlists = new Map<string, Array<{ id: string; embedding: number[] }>>();
  private isInitialized = false;

  constructor(config: Partial<FaceDetectorConfig> = {}) {
    super("face", "1.0.0");
    this.config = {
      detectionConfidence: config.detectionConfidence ?? 0.8,
      recognitionEnabled: config.recognitionEnabled ?? false,
      recognitionThreshold: config.recognitionThreshold ?? 0.6,
      landmarksEnabled: config.landmarksEnabled ?? true,
      ageGenderEnabled: config.ageGenderEnabled ?? false,
      maskDetectionEnabled: config.maskDetectionEnabled ?? false,
      modelPath: config.modelPath,
    };
  }

  async initialize(): Promise<void> {
    // TODO: Load actual face detection models
    // Options:
    // 1. face-api.js (TensorFlow.js based)
    // 2. OpenCV DNN with pre-trained models
    // 3. ONNX Runtime with face models
    // 4. InsightFace (Python API, can be wrapped)

    // Example with face-api.js:
    // import * as faceapi from 'face-api.js';
    // await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.config.modelPath);
    // await faceapi.nets.faceLandmark68Net.loadFromDisk(this.config.modelPath);
    // await faceapi.nets.faceRecognitionNet.loadFromDisk(this.config.modelPath);
    // if (this.config.ageGenderEnabled) {
    //   await faceapi.nets.ageGenderNet.loadFromDisk(this.config.modelPath);
    // }

    // Face observations can be supplied by a dedicated face-model worker. A
    // local RetinaFace/ArcFace runtime is deliberately not faked here.
    console.warn("Face detector accepts normalized face observations; no local face model is provisioned");
    this.isInitialized = true;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("FaceDetector not initialized");
    }

    const normalizedDetections = this.readNormalizedFaceObservations(frame);

    const results: DetectionResult[] = [];
    const faceObjects: Array<DetectedObject & { features?: FaceFeatures; match?: WatchlistMatch }> = [];

    for (const detection of normalizedDetections) {
      if (detection.confidence < this.config.detectionConfidence) continue;

      const normalizedBox = normalizeBoundingBox(
        detection.boundingBox,
        frame.width,
        frame.height,
      );

      const faceObj: DetectedObject & { features?: FaceFeatures; match?: WatchlistMatch } = {
        label: "face",
        confidence: detection.confidence,
        boundingBox: normalizedBox,
        trackId: detection.trackId,
      };

      // Extract face features
      if (detection.features) {
        faceObj.features = detection.features;

        // Face recognition (if enabled)
        if (this.config.recognitionEnabled && detection.features.embedding) {
          const match = await this.matchAgainstWatchlists(
            detection.features.embedding,
            frame.tenantId,
          );
          if (match) {
            faceObj.match = match;
          }
        }
      }

      faceObjects.push(faceObj);
    }

    if (faceObjects.length > 0) {
      // Face detection event
      results.push({
        detectionType: "face",
        confidence: Math.max(...faceObjects.map((f) => f.confidence)),
        objects: faceObjects,
        metadata: {
          faceCount: faceObjects.length,
          recognitionEnabled: this.config.recognitionEnabled,
        },
        requiresAlert: false, // Face detection alone doesn't alert
      });

      // Face recognition matches (if any)
      const matchedFaces = faceObjects.filter((f) => f.match);
      if (matchedFaces.length > 0) {
        results.push({
          detectionType: "face-recognition",
          confidence: Math.max(...matchedFaces.map((f) => f.match!.similarity)),
          objects: matchedFaces,
          metadata: {
            matchCount: matchedFaces.length,
            watchlistMatches: matchedFaces.map((f) => ({
              personId: f.match!.personId,
              personName: f.match!.personName,
              similarity: f.match!.similarity,
            })),
          },
          requiresAlert: true, // Watchlist match requires alert
        });
      }
    }

    return results;
  }

  /**
   * Match face embedding against watchlists
   */
  private async matchAgainstWatchlists(
    embedding: number[],
    tenantId: string,
  ): Promise<WatchlistMatch | null> {
    // TODO: Implement actual watchlist matching
    // This should query the database for active watchlists and compare embeddings
    // using cosine similarity or Euclidean distance

    const watchlist = this.watchlists.get(tenantId);
    if (!watchlist) return null;

    let bestMatch: WatchlistMatch | null = null;
    let bestSimilarity = 0;

    for (const person of watchlist) {
      const similarity = this.calculateCosineSimilarity(
        embedding,
        person.embedding,
      );

      if (
        similarity > this.config.recognitionThreshold &&
        similarity > bestSimilarity
      ) {
        bestSimilarity = similarity;
        bestMatch = {
          watchlistId: "default",
          personId: person.id,
          personName: "Known Person", // Should come from database
          similarity,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Embeddings must have the same dimension");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return similarity;
  }

  /**
   * Load watchlist for a tenant
   */
  async loadWatchlist(
    tenantId: string,
    watchlistId: string,
    persons: Array<{ id: string; embedding: number[] }>,
  ): Promise<void> {
    this.watchlists.set(tenantId, persons);
    console.log(
      `Loaded watchlist ${watchlistId} for tenant ${tenantId} with ${persons.length} persons`,
    );
  }

  /**
   * Clear watchlist for a tenant
   */
  clearWatchlist(tenantId: string): void {
    this.watchlists.delete(tenantId);
  }

  /**
   * Normalize observations produced by a dedicated face model worker.
   */
  private readNormalizedFaceObservations(frame: DetectionFrame): Array<{
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    trackId?: string;
    features?: FaceFeatures;
  }> {
    return getInferenceObjects(frame, ["face"]).map((item) => {
      const embedding = item.attributes?.embedding;
      return {
        confidence: item.confidence,
        boundingBox: {
          x: item.boundingBox.x * frame.width,
          y: item.boundingBox.y * frame.height,
          width: item.boundingBox.width * frame.width,
          height: item.boundingBox.height * frame.height,
        },
        trackId: item.trackId,
        ...(Array.isArray(embedding) && embedding.every((value) => typeof value === "number")
          ? { features: { embedding: embedding as number[], quality: typeof item.attributes?.quality === "number" ? item.attributes.quality : undefined } }
          : {}),
      };
    });
  }

  /**
   * Enroll a person into the watchlist
   */
  async enrollPerson(
    personId: string,
    faceImages: Buffer[],
  ): Promise<{ embedding: number[]; quality: number }> {
    // TODO: Implement face enrollment
    // 1. Detect face in each image
    // 2. Extract face embeddings
    // 3. Average multiple embeddings for better accuracy
    // 4. Calculate quality score
    // 5. Store in database

    // Placeholder
    return {
      embedding: new Array(128).fill(0),
      quality: 0.8,
    };
  }

  /**
   * Search for similar faces in the database
   */
  async searchSimilarFaces(
    embedding: number[],
    tenantId: string,
    limit = 10,
  ): Promise<Array<{ personId: string; similarity: number }>> {
    // TODO: Implement face search
    // This should use vector similarity search (pgvector, FAISS, etc.)
    return [];
  }

  async cleanup(): Promise<void> {
    this.detectionModel = null;
    this.recognitionModel = null;
    this.watchlists.clear();
    this.isInitialized = false;
  }

  getHealth() {
    return {
      status: this.isInitialized ? ("degraded" as const) : ("unhealthy" as const),
      details: this.isInitialized
        ? `Normalized face observations required (recognition ${this.config.recognitionEnabled ? "enabled" : "disabled"})`
        : "Face detector not initialized",
      metadata: {
        recognitionEnabled: this.config.recognitionEnabled,
        watchlistsLoaded: this.watchlists.size,
      },
    };
  }
}
