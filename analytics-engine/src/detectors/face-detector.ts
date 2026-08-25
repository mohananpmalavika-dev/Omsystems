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
  shouldRunLocalSpecialtyInference,
} from "./base-detector.js";
import {
  loadFaceVectorInference,
  loadObjectInference,
  modelUnavailableReason,
  type FaceVectorInference,
  type ObjectFrameInference,
} from "../inference/configured-model-inference.js";

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

export interface FaceDetectorInference {
  detection?: ObjectFrameInference;
  embedding?: FaceVectorInference;
}

export class FaceDetector extends BaseDetector {
  private config: FaceDetectorConfig;
  private detectionModel: ObjectFrameInference | null;
  private recognitionModel: FaceVectorInference | null;
  private modelLoadError: string | null = null;
  private watchlists = new Map<string, Array<{ id: string; embedding: number[] }>>();
  private isInitialized = false;

  constructor(config: Partial<FaceDetectorConfig> = {}, inference: FaceDetectorInference = {}) {
    super("face", "1.0.0");
    this.detectionModel = inference.detection ?? null;
    this.recognitionModel = inference.embedding ?? null;
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
    try {
      this.detectionModel ??= await loadObjectInference("face-detector", this.config.detectionConfidence);
      if (this.config.recognitionEnabled) {
        try {
          this.recognitionModel ??= await loadFaceVectorInference("face-embedding");
        } catch (error) {
          console.warn(`Face recognition embeddings unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.modelLoadError = null;
      console.log("Face detector loaded local ONNX model");
    } catch (error) {
      this.detectionModel = null;
      this.modelLoadError = error instanceof Error ? error.message : modelUnavailableReason("face-detector");
      console.warn(`Face detector running in normalized-observation mode: ${this.modelLoadError}`);
    }
    this.isInitialized = true;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("FaceDetector not initialized");
    }

    const normalizedDetections = await this.readFaceObservations(frame);

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
   * Now uses real pgvector search service
   */
  private async matchAgainstWatchlists(
    embedding: number[],
    tenantId: string,
  ): Promise<WatchlistMatch | null> {
    // Use FaceSearchService if available (integrated with FaceRecognitionService)
    // Otherwise fall back to in-memory matching for backward compatibility
    
    if (this.recognitionModel && typeof (this.recognitionModel as any).searchPersons === 'function') {
      try {
        const embeddingVector = new Float32Array(embedding);
        const candidates = await (this.recognitionModel as any).searchPersons({
          tenantId,
          embedding: embeddingVector,
          limit: 1,
        });

        if (candidates.length > 0 && candidates[0].bestSimilarity >= this.config.recognitionThreshold) {
          const candidate = candidates[0];
          return {
            watchlistId: candidate.watchlistId,
            personId: candidate.personId,
            personName: candidate.displayName,
            similarity: candidate.bestSimilarity,
            metadata: {
              confidence: candidate.supportingEmbeddings,
              meanSimilarity: candidate.meanTopKSimilarity,
            },
          };
        }
      } catch (error) {
        console.error('Face search service error:', error);
      }
    }

    // Fallback: in-memory matching (legacy)
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
          personName: "Known Person", // Fallback name
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
  private async readFaceObservations(frame: DetectionFrame): Promise<Array<{
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    trackId?: string;
    features?: FaceFeatures;
  }>> {
    const runLocal = shouldRunLocalSpecialtyInference(frame) && this.detectionModel;
    const local = runLocal ? await this.detectionModel!.run(frame) : [];
    const observations = [
      ...getInferenceObjects(frame, ["face"]),
      ...local.filter((item) => item.label === "face"),
    ];
    return Promise.all(observations.map(async (item) => {
      const embedding = item.attributes?.embedding;
      const landmarks = readLandmarks(item.attributes?.landmarks);
      const landmarkPoints = landmarks
        ? [landmarks.leftEye, landmarks.rightEye, landmarks.nose, landmarks.leftMouth, landmarks.rightMouth]
        : undefined;
      const localEmbedding = runLocal && this.config.recognitionEnabled && this.recognitionModel
        ? await this.recognitionModel.run(frame, item.boundingBox, landmarkPoints)
        : undefined;
      return {
        confidence: item.confidence,
        boundingBox: {
          x: item.boundingBox.x * frame.width,
          y: item.boundingBox.y * frame.height,
          width: item.boundingBox.width * frame.width,
          height: item.boundingBox.height * frame.height,
        },
        trackId: item.trackId,
        ...(localEmbedding
          ? { features: { embedding: localEmbedding, landmarks, quality: item.confidence } }
          : Array.isArray(embedding) && embedding.every((value) => typeof value === "number")
          ? { features: { embedding: embedding as number[], landmarks, quality: typeof item.attributes?.quality === "number" ? item.attributes.quality : undefined } }
          : {}),
      };
    }));
  }

  /**
   * Enroll a person into the watchlist
   * Use FaceEnrollmentService for production enrollment
   */
  async enrollPerson(
    personId: string,
    faceImages: Buffer[],
  ): Promise<{ embedding: number[]; quality: number }> {
    // This method is deprecated - use FaceEnrollmentService directly
    // It provides proper multi-image enrollment, quality validation, and transaction support
    
    throw new Error(
      'Face enrollment should use FaceEnrollmentService. ' +
      'Use POST /api/face-watchlists/:watchlistId/persons with image uploads.'
    );
  }

  /**
   * Search for similar faces in the database
   * Now uses real pgvector search
   */
  async searchSimilarFaces(
    embedding: number[],
    tenantId: string,
    limit = 10,
  ): Promise<Array<{ personId: string; similarity: number }>> {
    // Use FaceSearchService if available
    if (this.recognitionModel && typeof (this.recognitionModel as any).searchPersons === 'function') {
      try {
        const embeddingVector = new Float32Array(embedding);
        const candidates = await (this.recognitionModel as any).searchPersons({
          tenantId,
          embedding: embeddingVector,
          limit,
        });

        return candidates.map((c: any) => ({
          personId: c.personId,
          similarity: c.bestSimilarity,
        }));
      } catch (error) {
        console.error('Face search service error:', error);
      }
    }

    // Fallback: return empty for now
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
      status: this.isInitialized && this.detectionModel
        ? ("healthy" as const)
        : this.isInitialized ? ("degraded" as const) : ("unhealthy" as const),
      details: this.isInitialized && this.detectionModel
        ? `Local face ONNX inference active (recognition ${this.recognitionModel ? "local" : this.config.recognitionEnabled ? "unavailable" : "disabled"})`
        : this.isInitialized
          ? `Normalized face observations only. ${this.modelLoadError ?? "Local model unavailable"}`
        : "Face detector not initialized",
      metadata: {
        recognitionEnabled: this.config.recognitionEnabled,
        localDetection: Boolean(this.detectionModel),
        localEmbedding: Boolean(this.recognitionModel),
        watchlistsLoaded: this.watchlists.size,
      },
    };
  }
}

function readLandmarks(value: unknown): FaceFeatures["landmarks"] | undefined {
  if (!Array.isArray(value) || value.length !== 5) return undefined;
  const points = value.map((point) => {
    if (!point || typeof point !== "object") return null;
    const item = point as Record<string, unknown>;
    return typeof item.x === "number" && typeof item.y === "number"
      ? { x: item.x, y: item.y }
      : null;
  });
  if (points.some((point) => point === null)) return undefined;
  const [leftEye, rightEye, nose, leftMouth, rightMouth] = points as Array<{ x: number; y: number }>;
  return { leftEye, rightEye, nose, leftMouth, rightMouth };
}
