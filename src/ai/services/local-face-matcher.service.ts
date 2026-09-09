/**
 * Local Open-Source Face Watchlist & Feature Matching Service
 * 
 * Performs 512-dimension vector embedding similarity matching against local
 * watchlists using Cosine Similarity with zero external biometric cloud APIs.
 */

import { randomUUID } from "node:crypto";
import type { FaceMatchResult, FaceMatchCandidate } from "../domain/local-ai.types.js";

export interface WatchlistFaceRecord {
  personId: string;
  name: string;
  watchlistType: "WANTED" | "BLACK_LIST" | "VIP" | "STAFF" | "SUSPECT";
  embeddingVector: number[]; // 512-d unit vector
  notes?: string;
  enrolledAt: Date;
}

export class LocalFaceMatcherService {
  private watchlist = new Map<string, WatchlistFaceRecord>();

  createSyntheticVector(seed: number): number[] {
    const vec: number[] = [];
    for (let i = 0; i < 512; i++) {
      vec.push(Math.sin(seed * (i + 1)));
    }
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map((v) => v / (norm || 1));
  }

  enrollFace(record: WatchlistFaceRecord) {
    this.assertEmbedding(record.embeddingVector);
    this.watchlist.set(record.personId, record);
  }

  removeFace(personId: string) {
    this.watchlist.delete(personId);
  }

  /**
   * Compare incoming face embedding against local watchlist records
   */
  async matchFace(options: {
    cameraId: string;
    branchId: string;
    embeddingVector: number[];
    minThreshold?: number;
  }): Promise<FaceMatchResult> {
    const threshold = options.minThreshold ?? 0.82;
    if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 0.99) {
      throw new Error("Face-match threshold must be between 0.50 and 0.99");
    }
    const inputVec = options.embeddingVector;
    this.assertEmbedding(inputVec);

    let bestMatch: FaceMatchCandidate | undefined;
    let highestSimilarity = 0;

    for (const record of this.watchlist.values()) {
      const sim = this.calculateCosineSimilarity(inputVec, record.embeddingVector);
      if (sim > highestSimilarity) {
        highestSimilarity = sim;
        if (sim >= threshold) {
          bestMatch = {
            personId: record.personId,
            name: record.name,
            watchlistType: record.watchlistType,
            similarity: Number(sim.toFixed(4)),
            watchlistId: `wl-${record.watchlistType.toLowerCase()}`,
            notes: record.notes,
          };
        }
      }
    }

    return {
      id: `fmatch-${randomUUID()}`,
      cameraId: options.cameraId,
      branchId: options.branchId,
      matchedAt: new Date(),
      matched: Boolean(bestMatch),
      candidate: bestMatch,
      confidence: highestSimilarity > 0 ? Number(highestSimilarity.toFixed(4)) : 0,
    };
  }

  /**
   * Calculate Cosine Similarity between two N-dimensional vectors:
   * sim(A, B) = (A · B) / (||A|| * ||B||)
   */
  calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== 512 || vecB.length !== 512) return 0;
    const len = 512;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      const a = vecA[i] ?? 0;
      const b = vecB[i] ?? 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return Math.max(0, Math.min(1, dotProduct / denominator));
  }

  private assertEmbedding(vector: number[]) {
    if (!Array.isArray(vector) || vector.length !== 512 || vector.some((value) => !Number.isFinite(value))) {
      throw new Error("Face embeddings must contain exactly 512 finite values");
    }
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude < 0.9 || magnitude > 1.1) {
      throw new Error("Face embeddings must be normalized before matching");
    }
  }

}

export const localFaceMatcherService = new LocalFaceMatcherService();
