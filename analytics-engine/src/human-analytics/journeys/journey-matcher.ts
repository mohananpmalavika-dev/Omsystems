/**
 * Journey Matcher
 * Matches camera appearances to reconstruct cross-camera journeys
 */

import { randomUUID } from "node:crypto";
import type {
  CameraAppearance,
  PersonJourney,
  CameraTransition,
  JourneyMatchFeatures,
  JourneyAppearanceLink,
} from "../types.js";

interface MatchCandidate {
  appearanceId: string;
  score: number;
  features: JourneyMatchFeatures;
}

export class JourneyMatcher {
  private transitions = new Map<string, CameraTransition>();

  constructor(
    private readonly tenantId: string,
  ) {}

  /**
   * Add camera transition to topology
   */
  addTransition(transition: CameraTransition): void {
    const key = `${transition.fromCameraId}_${transition.toCameraId}`;
    this.transitions.set(key, transition);
  }

  /**
   * Find matching appearances for journey continuation
   */
  async findMatches(
    sourceAppearance: CameraAppearance,
    candidateAppearances: CameraAppearance[],
  ): Promise<MatchCandidate[]> {
    const matches: MatchCandidate[] = [];

    for (const candidate of candidateAppearances) {
      // Skip if same tenant violated
      if (candidate.tenantId !== sourceAppearance.tenantId) {
        continue;
      }

      // Skip if same camera
      if (candidate.cameraId === sourceAppearance.cameraId) {
        continue;
      }

      // Get topology
      const transition = this.getTransition(
        sourceAppearance.cameraId,
        candidate.cameraId,
      );

      if (!transition) {
        continue; // No valid path
      }

      // Calculate travel time
      const travelTime =
        (candidate.enteredAt.getTime() - sourceAppearance.exitedAt.getTime()) / 1000;

      // Check if travel time is possible
      if (
        travelTime < transition.minimumTravelSeconds ||
        travelTime > transition.maximumTravelSeconds
      ) {
        continue; // Invalid travel time
      }

      // Extract match features
      const features = this.extractMatchFeatures(
        sourceAppearance,
        candidate,
        transition,
        travelTime,
      );

      // Calculate match score
      const score = this.calculateMatchScore(features);

      // Check minimum threshold
      if (score >= 0.5) {
        matches.push({
          appearanceId: candidate.id,
          score,
          features,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Match multiple source appearances to destinations using Hungarian assignment
   */
  async matchBatch(
    sourceAppearances: CameraAppearance[],
    candidateAppearances: CameraAppearance[],
  ): Promise<Map<string, string>> {
    // Build cost matrix
    const costMatrix: number[][] = [];

    for (const source of sourceAppearances) {
      const row: number[] = [];
      const matches = await this.findMatches(source, candidateAppearances);

      for (const candidate of candidateAppearances) {
        const match = matches.find((m) => m.appearanceId === candidate.id);
        // Cost = 1 - score (lower cost is better)
        row.push(match ? 1 - match.score : 1);
      }

      costMatrix.push(row);
    }

    // Apply Hungarian algorithm (simplified greedy approach for now)
    const assignments = this.hungarianAssignment(costMatrix);

    // Build result map
    const result = new Map<string, string>();
    for (let i = 0; i < assignments.length; i++) {
      const j = assignments[i];
      if (j !== -1) {
        const score = 1 - costMatrix[i][j];
        if (score >= 0.5) {
          result.set(sourceAppearances[i].id, candidateAppearances[j].id);
        }
      }
    }

    return result;
  }

  /**
   * Simplified Hungarian assignment (greedy approach)
   */
  private hungarianAssignment(costMatrix: number[][]): number[] {
    const n = costMatrix.length;
    const m = costMatrix[0]?.length || 0;

    const assignments: number[] = new Array(n).fill(-1);
    const assigned = new Set<number>();

    // Greedy assignment: assign each source to best unassigned destination
    for (let i = 0; i < n; i++) {
      let bestJ = -1;
      let bestCost = Infinity;

      for (let j = 0; j < m; j++) {
        if (!assigned.has(j) && costMatrix[i][j] < bestCost) {
          bestCost = costMatrix[i][j];
          bestJ = j;
        }
      }

      if (bestJ !== -1 && bestCost < 0.5) {
        // Only assign if score > 0.5
        assignments[i] = bestJ;
        assigned.add(bestJ);
      }
    }

    return assignments;
  }

  /**
   * Extract match features
   */
  private extractMatchFeatures(
    source: CameraAppearance,
    candidate: CameraAppearance,
    transition: CameraTransition,
    travelTime: number,
  ): JourneyMatchFeatures {
    // Appearance similarity (cosine similarity of embeddings)
    const appearanceSimilarity = this.calculateEmbeddingSimilarity(
      source.representativeEmbedding,
      candidate.representativeEmbedding,
    );

    // Topology probability
    const topologyProbability = transition.probability;

    // Travel time likelihood (Gaussian around expected time)
    const expectedTime =
      (transition.minimumTravelSeconds + transition.maximumTravelSeconds) / 2;
    const timeRange =
      (transition.maximumTravelSeconds - transition.minimumTravelSeconds) / 2;
    const travelTimeLikelihood = Math.exp(
      -Math.pow(travelTime - expectedTime, 2) / (2 * Math.pow(timeRange / 2, 2)),
    );

    // Gate compatibility
    let gateCompatibility = 0.5; // Neutral if no gates
    if (source.exitGateId && candidate.entryGateId) {
      if (
        transition.fromGateId === source.exitGateId &&
        transition.toGateId === candidate.entryGateId
      ) {
        gateCompatibility = 1.0;
      } else {
        gateCompatibility = 0.2;
      }
    }

    // Clothing similarity
    const clothingSimilarity = this.calculateClothingSimilarity(
      source.clothingFeatures,
      candidate.clothingFeatures,
    );

    // Direction compatibility
    const directionCompatibility = this.calculateDirectionCompatibility(
      source.trajectorySummary,
      candidate.trajectorySummary,
    );

    return {
      appearanceSimilarity,
      topologyProbability,
      travelTimeLikelihood,
      gateCompatibility,
      clothingSimilarity,
      directionCompatibility,
    };
  }

  /**
   * Calculate match score
   */
  private calculateMatchScore(features: JourneyMatchFeatures): number {
    return (
      0.5 * features.appearanceSimilarity +
      0.15 * features.topologyProbability +
      0.15 * features.travelTimeLikelihood +
      0.1 * features.gateCompatibility +
      0.05 * features.clothingSimilarity +
      0.05 * features.directionCompatibility
    );
  }

  /**
   * Calculate embedding similarity (cosine similarity)
   */
  private calculateEmbeddingSimilarity(
    embedding1?: number[],
    embedding2?: number[],
  ): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0.5; // Neutral if embeddings missing
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] ** 2;
      norm2 += embedding2[i] ** 2;
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Calculate clothing similarity
   */
  private calculateClothingSimilarity(
    clothing1?: any,
    clothing2?: any,
  ): number {
    if (!clothing1 || !clothing2) {
      return 0.5; // Neutral if missing
    }

    let similarity = 0;
    let factors = 0;

    // Compare dominant colors
    if (clothing1.dominantColors && clothing2.dominantColors) {
      const commonColors = clothing1.dominantColors.filter((c: string) =>
        clothing2.dominantColors.includes(c),
      );
      similarity += commonColors.length / Math.max(clothing1.dominantColors.length, 1);
      factors++;
    }

    // Compare accessories
    if (clothing1.hasBackpack === clothing2.hasBackpack) {
      similarity += 1;
    }
    factors++;

    if (clothing1.hasHat === clothing2.hasHat) {
      similarity += 1;
    }
    factors++;

    return factors > 0 ? similarity / factors : 0.5;
  }

  /**
   * Calculate direction compatibility
   */
  private calculateDirectionCompatibility(
    trajectory1?: any,
    trajectory2?: any,
  ): number {
    if (!trajectory1?.exitDirection || !trajectory2?.entryDirection) {
      return 0.5; // Neutral if missing
    }

    // Calculate angle difference
    const angleDiff = Math.abs(trajectory1.exitDirection - trajectory2.entryDirection);
    const normalizedDiff = Math.min(angleDiff, 360 - angleDiff);

    // Convert to similarity (opposite directions should match)
    const expectedDiff = 180; // Opposite direction
    const deviation = Math.abs(normalizedDiff - expectedDiff);

    return Math.max(0, 1 - deviation / 90);
  }

  /**
   * Get transition between cameras
   */
  private getTransition(
    fromCameraId: string,
    toCameraId: string,
  ): CameraTransition | undefined {
    const key = `${fromCameraId}_${toCameraId}`;
    return this.transitions.get(key);
  }

  /**
   * Check if match is ambiguous
   */
  isAmbiguous(
    bestMatch: MatchCandidate,
    secondBestMatch: MatchCandidate | undefined,
    marginThreshold: number = 0.1,
  ): boolean {
    if (!secondBestMatch) {
      return false;
    }

    const margin = bestMatch.score - secondBestMatch.score;
    return bestMatch.score >= 0.5 && margin < marginThreshold;
  }

  /**
   * Create journey from appearance links
   */
  createJourney(
    appearanceLinks: Array<{
      appearance: CameraAppearance;
      previousAppearanceId?: string;
      transitionConfidence?: number;
      transitionReasons?: string[];
    }>,
  ): PersonJourney {
    const links: JourneyAppearanceLink[] = appearanceLinks.map((link) => ({
      appearanceId: link.appearance.id,
      cameraId: link.appearance.cameraId,
      enteredAt: link.appearance.enteredAt,
      exitedAt: link.appearance.exitedAt,
      previousAppearanceId: link.previousAppearanceId,
      transitionConfidence: link.transitionConfidence,
      transitionReasons: link.transitionReasons,
    }));

    // Calculate overall confidence
    const transitionConfidences = links
      .map((l) => l.transitionConfidence)
      .filter((c): c is number => c !== undefined);

    const overallConfidence =
      transitionConfidences.length > 0
        ? transitionConfidences.reduce((sum, c) => sum + c, 0) /
          transitionConfidences.length
        : 0.5;

    return {
      id: `journey_${randomUUID()}`,
      tenantId: this.tenantId,
      startedAt: links[0].enteredAt,
      lastUpdatedAt: links[links.length - 1].exitedAt,
      appearances: links,
      confidence: overallConfidence,
      status: overallConfidence >= 0.7 ? "active" : "ambiguous",
      reviewStatus: "unreviewed",
    };
  }

  /**
   * Get transition statistics
   */
  getTransitionStats(): {
    totalTransitions: number;
    averageProbability: number;
    byCamera: Map<string, number>;
  } {
    const byCamera = new Map<string, number>();
    let totalProbability = 0;

    for (const transition of this.transitions.values()) {
      const count = byCamera.get(transition.fromCameraId) || 0;
      byCamera.set(transition.fromCameraId, count + 1);
      totalProbability += transition.probability;
    }

    return {
      totalTransitions: this.transitions.size,
      averageProbability:
        this.transitions.size > 0 ? totalProbability / this.transitions.size : 0,
      byCamera,
    };
  }
}
