/**
 * Local Open-Source Face Watchlist & Feature Matching Service
 * 
 * Performs 512-dimension vector embedding similarity matching against local
 * watchlists using Cosine Similarity with zero external biometric cloud APIs.
 */

import { randomUUID } from "node:crypto";
import { FACE_MATCH_MARGIN, FACE_MATCH_MINIMUM, selectFaceIdentity } from "../../../packages/contracts/src/face-match-policy.js";
import type { FaceMatchResult, FaceMatchCandidate } from "../domain/local-ai.types.js";
import { activeFaceRegistryMatches } from "../../analytics/identity-registry.js";
import type { ControlPlaneStore } from "../../control-plane-store.js";

export interface WatchlistFaceRecord {
  tenantId?: string;
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
    this.assertEmbedding(record.embeddingVector);
    this.watchlist.set(`${record.tenantId || ""}:${record.personId}`, {...record,embeddingVector:[...record.embeddingVector]});
  }

  removeFace(personId: string, tenantId?: string) {
    this.watchlist.delete(`${tenantId || ""}:${personId}`);
  }

  /**
   * Compare incoming face embedding against local watchlist records
   */
  async matchFace(options: {
    cameraId: string;
    branchId: string;
    embeddingVector: number[];
    minThreshold?: number;
    store?: ControlPlaneStore;
    tenantId?: string;
  }): Promise<FaceMatchResult> {
    const threshold = options.minThreshold ?? 0.82;
    if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 0.99) {
      throw new Error("Face-match threshold must be between 0.50 and 0.99");
    }
    const inputVec = options.embeddingVector;
    this.assertEmbedding(inputVec);

    const candidates: FaceMatchCandidate[] = [];
    if (options.store && options.tenantId) {
      const matches = await activeFaceRegistryMatches(options.store, options.tenantId, inputVec, {
        minSimilarity: Math.max(0,Math.min(threshold,FACE_MATCH_MINIMUM)-FACE_MATCH_MARGIN), limit: 50,
      });
      for (const top of matches) candidates.push({
        personId:top.personId,name:top.personName,
        watchlistType:(top.listType?.toUpperCase() as FaceMatchCandidate['watchlistType']) || 'SUSPECT',
        similarity:top.similarity,watchlistId:top.watchlistId,
        notes:top.metadata ? JSON.stringify(top.metadata) : undefined,
      });
    }
    // Production requests use the governed registry only. Never replace an
    // empty/failed/disabled registry result with a process-global identity.
    if (!options.store) {
      for (const record of this.watchlist.values()) {
        if (record.tenantId !== options.tenantId) continue;
        candidates.push({personId:record.personId,name:record.name,watchlistType:record.watchlistType,
          similarity:this.calculateCosineSimilarity(inputVec,record.embeddingVector),
          watchlistId:`wl-${record.watchlistType.toLowerCase()}`,notes:record.notes});
      }
    }
    const bestMatch = selectFaceIdentity(candidates,row=>row.personId,row=>row.similarity,threshold) || undefined;
    const highestSimilarity = candidates.reduce((best,row)=>Math.max(best,row.similarity),0);

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
