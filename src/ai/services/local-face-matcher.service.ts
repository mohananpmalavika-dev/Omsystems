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

  enrollFace(record: WatchlistFaceRecord) {
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
    const threshold = options.minThreshold ?? 0.75;
    const inputVec = options.embeddingVector;

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
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    const len = Math.min(vecA.length, vecB.length);

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

}

export const localFaceMatcherService = new LocalFaceMatcherService();
