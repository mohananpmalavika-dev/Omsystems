/**
 * Fighting Detection
 * Two-stage approach: candidate generation + temporal classification
 */

import { randomUUID } from "node:crypto";
import type {
  PersonTrack,
  FightEvidence,
  PairFeatures,
  PoseKeypoints,
} from "../types.js";
import { getCapabilityRegistry } from "../capability-status.js";

interface FightCandidate {
  trackIdA: string;
  trackIdB: string;
  startedAt: Date;
  lastUpdatedAt: Date;
  candidateScore: number;
  features: PairFeatures[];
  frameIds: string[];
  status: "candidate" | "classifying" | "confirmed" | "rejected";
}

interface FightDetectorConfig {
  normalizedDistanceThreshold: number;
  minRelativeVelocity: number;
  minLimbAcceleration: number;
  candidatePersistenceMs: number;
  confirmationWindowMs: number;
  deduplicationCooldownMs: number;
  minPoseValidFrames: number;
}

export class FightDetector {
  private candidates = new Map<string, FightCandidate>();
  private confirmedEvents = new Map<string, FightEvidence>();
  private eventCooldowns = new Map<string, Date>();

  private readonly config: FightDetectorConfig = {
    normalizedDistanceThreshold: 1.5,
    minRelativeVelocity: 50, // pixels/sec
    minLimbAcceleration: 30,
    candidatePersistenceMs: 1000, // 1 second
    confirmationWindowMs: 3000, // 3 seconds
    deduplicationCooldownMs: 15000, // 15 seconds
    minPoseValidFrames: 0.6, // 60% of frames must have valid pose
  };

  constructor(
    private readonly tenantId: string,
    private readonly cameraId: string,
    config?: Partial<FightDetectorConfig>,
  ) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Detect fighting from active tracks
   */
  async detectFighting(
    tracks: PersonTrack[],
    timestamp: Date,
    frameId: string,
  ): Promise<FightEvidence[]> {
    // Check capability
    const registry = getCapabilityRegistry();
    const poseCheck = registry.checkCapability("pose_estimation");

    if (!poseCheck.available) {
      return [];
    }

    const confirmedTracks = tracks.filter((t) => t.status === "confirmed");
    if (confirmedTracks.length < 2) {
      return [];
    }

    // Stage 1: Generate candidates from pairs
    await this.generateCandidates(confirmedTracks, timestamp, frameId);

    // Stage 2: Classify persistent candidates
    const newEvents = await this.classifyCandidates(timestamp);

    // Cleanup old candidates and check cooldowns
    this.cleanupCandidates(timestamp);
    this.cleanupCooldowns(timestamp);

    return newEvents;
  }

  /**
   * Stage 1: Generate fight candidates from track pairs
   */
  private async generateCandidates(
    tracks: PersonTrack[],
    timestamp: Date,
    frameId: string,
  ): Promise<void> {
    // Check all pairs
    for (let i = 0; i < tracks.length; i++) {
      for (let j = i + 1; j < tracks.length; j++) {
        const trackA = tracks[i];
        const trackB = tracks[j];

        // Check cooldown
        const cooldownKey = this.getCooldownKey(trackA.trackId, trackB.trackId);
        if (this.isInCooldown(cooldownKey, timestamp)) {
          continue;
        }

        // Extract features
        const features = this.extractPairFeatures(trackA, trackB);

        // Check if candidate
        if (this.isCandidate(features)) {
          const candidateKey = this.getCandidateKey(trackA.trackId, trackB.trackId);
          
          let candidate = this.candidates.get(candidateKey);
          if (candidate) {
            // Update existing candidate
            candidate.lastUpdatedAt = timestamp;
            candidate.features.push(features);
            candidate.frameIds.push(frameId);
            candidate.candidateScore = this.calculateCandidateScore(candidate.features);
          } else {
            // Create new candidate
            candidate = {
              trackIdA: trackA.trackId,
              trackIdB: trackB.trackId,
              startedAt: timestamp,
              lastUpdatedAt: timestamp,
              candidateScore: this.calculateCandidateScore([features]),
              features: [features],
              frameIds: [frameId],
              status: "candidate",
            };
            this.candidates.set(candidateKey, candidate);
          }
        }
      }
    }
  }

  /**
   * Extract interaction features from track pair
   */
  private extractPairFeatures(trackA: PersonTrack, trackB: PersonTrack): PairFeatures {
    const lastObsA = trackA.observations[trackA.observations.length - 1];
    const lastObsB = trackB.observations[trackB.observations.length - 1];

    // Calculate normalized distance (using person height as reference)
    const centerA = {
      x: lastObsA.boundingBox.x + lastObsA.boundingBox.width / 2,
      y: lastObsA.boundingBox.y + lastObsA.boundingBox.height / 2,
    };
    const centerB = {
      x: lastObsB.boundingBox.x + lastObsB.boundingBox.width / 2,
      y: lastObsB.boundingBox.y + lastObsB.boundingBox.height / 2,
    };

    const distance = Math.sqrt(
      (centerA.x - centerB.x) ** 2 + (centerA.y - centerB.y) ** 2,
    );
    const avgHeight = (lastObsA.boundingBox.height + lastObsB.boundingBox.height) / 2;
    const normalizedDistance = avgHeight > 0 ? distance / avgHeight : 999;

    // Calculate relative velocity
    const velA = trackA.velocity || { dx: 0, dy: 0 };
    const velB = trackB.velocity || { dx: 0, dy: 0 };
    const relativeVelocity = Math.sqrt(
      (velA.dx - velB.dx) ** 2 + (velA.dy - velB.dy) ** 2,
    );

    // Calculate approach speed
    const approachSpeed = this.calculateApproachSpeed(trackA, trackB);

    // Calculate wrist acceleration (if pose available)
    const wristAccelA = this.calculateWristAcceleration(trackA);
    const wristAccelB = this.calculateWristAcceleration(trackB);

    // Calculate torso motion
    const torsoMotionA = this.calculateTorsoMotion(trackA);
    const torsoMotionB = this.calculateTorsoMotion(trackB);

    // Calculate pose instability
    const poseInstability = this.calculatePoseInstability(trackA, trackB);

    // Calculate bounding box overlap
    const overlapRatio = this.calculateOverlapRatio(
      lastObsA.boundingBox,
      lastObsB.boundingBox,
    );

    return {
      normalizedDistance,
      relativeVelocity,
      approachSpeed,
      wristAccelerationA: wristAccelA,
      wristAccelerationB: wristAccelB,
      torsoMotionA,
      torsoMotionB,
      poseInstability,
      overlapRatio,
    };
  }

  /**
   * Check if pair features indicate a candidate
   */
  private isCandidate(features: PairFeatures): boolean {
    return (
      features.normalizedDistance < this.config.normalizedDistanceThreshold &&
      features.relativeVelocity > this.config.minRelativeVelocity &&
      (features.wristAccelerationA > this.config.minLimbAcceleration ||
        features.wristAccelerationB > this.config.minLimbAcceleration)
    );
  }

  /**
   * Calculate candidate score from features
   */
  private calculateCandidateScore(features: PairFeatures[]): number {
    if (features.length === 0) return 0;

    // Average features
    const avg = features.reduce(
      (acc, f) => ({
        normalizedDistance: acc.normalizedDistance + f.normalizedDistance,
        relativeVelocity: acc.relativeVelocity + f.relativeVelocity,
        wristAccelerationA: acc.wristAccelerationA + f.wristAccelerationA,
        wristAccelerationB: acc.wristAccelerationB + f.wristAccelerationB,
        poseInstability: acc.poseInstability + f.poseInstability,
        overlapRatio: acc.overlapRatio + f.overlapRatio,
      }),
      {
        normalizedDistance: 0,
        relativeVelocity: 0,
        wristAccelerationA: 0,
        wristAccelerationB: 0,
        poseInstability: 0,
        overlapRatio: 0,
      },
    );

    const count = features.length;
    const proximityScore = Math.max(
      0,
      1 - avg.normalizedDistance / count / this.config.normalizedDistanceThreshold,
    );
    const motionScore = Math.min(
      1,
      avg.relativeVelocity / count / (this.config.minRelativeVelocity * 2),
    );
    const limbScore = Math.min(
      1,
      Math.max(avg.wristAccelerationA, avg.wristAccelerationB) /
        count /
        (this.config.minLimbAcceleration * 2),
    );
    const instabilityScore = Math.min(1, avg.poseInstability / count);

    // Weighted combination
    return (
      0.15 * proximityScore +
      0.20 * motionScore +
      0.20 * limbScore +
      0.20 * instabilityScore +
      0.25 * (avg.overlapRatio / count)
    );
  }

  /**
   * Stage 2: Classify persistent candidates
   */
  private async classifyCandidates(timestamp: Date): Promise<FightEvidence[]> {
    const newEvents: FightEvidence[] = [];

    for (const [key, candidate] of this.candidates.entries()) {
      const duration = timestamp.getTime() - candidate.startedAt.getTime();

      // Check if candidate has persisted long enough
      if (
        duration >= this.config.candidatePersistenceMs &&
        candidate.status === "candidate"
      ) {
        // Check if we have enough frames for classification
        const windowDuration = timestamp.getTime() - candidate.startedAt.getTime();

        if (windowDuration >= this.config.confirmationWindowMs) {
          // Classify (in production, run temporal classifier here)
          const classifierScore = await this.classifyInteraction(candidate);

          // Calculate final confidence
          const finalConfidence =
            0.35 * candidate.candidateScore + 0.65 * classifierScore;

          if (finalConfidence >= 0.7) {
            // Confirmed fight
            const evidence: FightEvidence = {
              id: `fight_${randomUUID()}`,
              tenantId: this.tenantId,
              cameraId: this.cameraId,
              participantTrackIds: [candidate.trackIdA, candidate.trackIdB],
              startedAt: candidate.startedAt,
              endedAt: timestamp,
              candidateScore: candidate.candidateScore,
              classifierScore,
              finalConfidence,
              evidenceFrameIds: candidate.frameIds,
              modelVersion: "fight-detector-v1.0",
              available: true,
              status: finalConfidence >= 0.85 ? "confirmed" : "uncertain",
            };

            this.confirmedEvents.set(evidence.id, evidence);
            newEvents.push(evidence);

            // Set cooldown
            const cooldownKey = this.getCooldownKey(
              candidate.trackIdA,
              candidate.trackIdB,
            );
            this.eventCooldowns.set(cooldownKey, timestamp);

            // Remove candidate
            this.candidates.delete(key);
          } else {
            // Rejected
            candidate.status = "rejected";
          }
        }
      }
    }

    return newEvents;
  }

  /**
   * Classify interaction (placeholder for temporal classifier)
   */
  private async classifyInteraction(candidate: FightCandidate): Promise<number> {
    // In production, this would:
    // 1. Collect pose sequence or RGB clip
    // 2. Run ST-GCN, PoseC3D, X3D, or VideoMAE model
    // 3. Return classification score

    // For now, use heuristic scoring
    const avgScore = candidate.candidateScore;
    const duration = candidate.lastUpdatedAt.getTime() - candidate.startedAt.getTime();
    const persistenceScore = Math.min(1, duration / this.config.confirmationWindowMs);

    return avgScore * 0.7 + persistenceScore * 0.3;
  }

  /**
   * Calculate approach speed
   */
  private calculateApproachSpeed(trackA: PersonTrack, trackB: PersonTrack): number {
    if (trackA.observations.length < 2 || trackB.observations.length < 2) {
      return 0;
    }

    const prevObsA = trackA.observations[trackA.observations.length - 2];
    const currObsA = trackA.observations[trackA.observations.length - 1];
    const prevObsB = trackB.observations[trackB.observations.length - 2];
    const currObsB = trackB.observations[trackB.observations.length - 1];

    const prevDist = Math.sqrt(
      (prevObsA.footPoint.x - prevObsB.footPoint.x) ** 2 +
        (prevObsA.footPoint.y - prevObsB.footPoint.y) ** 2,
    );
    const currDist = Math.sqrt(
      (currObsA.footPoint.x - currObsB.footPoint.x) ** 2 +
        (currObsA.footPoint.y - currObsB.footPoint.y) ** 2,
    );

    const timeDelta =
      (currObsA.timestamp.getTime() - prevObsA.timestamp.getTime()) / 1000;

    return timeDelta > 0 ? Math.abs(currDist - prevDist) / timeDelta : 0;
  }

  /**
   * Calculate wrist acceleration
   */
  private calculateWristAcceleration(track: PersonTrack): number {
    // Placeholder: would use pose keypoint velocity changes
    return track.speed || 0;
  }

  /**
   * Calculate torso motion
   */
  private calculateTorsoMotion(track: PersonTrack): number {
    // Placeholder: would analyze hip/shoulder keypoint movement
    return track.speed || 0;
  }

  /**
   * Calculate pose instability
   */
  private calculatePoseInstability(trackA: PersonTrack, trackB: PersonTrack): number {
    // Placeholder: would measure keypoint jitter/variance
    const speedA = trackA.speed || 0;
    const speedB = trackB.speed || 0;
    return (speedA + speedB) / 2 / 100; // Normalize
  }

  /**
   * Calculate bounding box overlap ratio
   */
  private calculateOverlapRatio(bboxA: any, bboxB: any): number {
    const x1 = Math.max(bboxA.x, bboxB.x);
    const y1 = Math.max(bboxA.y, bboxB.y);
    const x2 = Math.min(bboxA.x + bboxA.width, bboxB.x + bboxB.width);
    const y2 = Math.min(bboxA.y + bboxA.height, bboxB.y + bboxB.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = bboxA.width * bboxA.height;
    const areaB = bboxB.width * bboxB.height;
    const minArea = Math.min(areaA, areaB);

    return minArea > 0 ? intersection / minArea : 0;
  }

  /**
   * Get candidate key for pair
   */
  private getCandidateKey(trackIdA: string, trackIdB: string): string {
    return [trackIdA, trackIdB].sort().join("_");
  }

  /**
   * Get cooldown key for pair
   */
  private getCooldownKey(trackIdA: string, trackIdB: string): string {
    return this.getCandidateKey(trackIdA, trackIdB);
  }

  /**
   * Check if pair is in cooldown
   */
  private isInCooldown(cooldownKey: string, timestamp: Date): boolean {
    const cooldownEnd = this.eventCooldowns.get(cooldownKey);
    if (!cooldownEnd) return false;

    const timeSinceCooldown = timestamp.getTime() - cooldownEnd.getTime();
    return timeSinceCooldown < this.config.deduplicationCooldownMs;
  }

  /**
   * Cleanup old candidates
   */
  private cleanupCandidates(timestamp: Date): void {
    for (const [key, candidate] of this.candidates.entries()) {
      const timeSinceUpdate = timestamp.getTime() - candidate.lastUpdatedAt.getTime();

      if (
        timeSinceUpdate > this.config.confirmationWindowMs * 2 ||
        candidate.status === "rejected"
      ) {
        this.candidates.delete(key);
      }
    }
  }

  /**
   * Cleanup old cooldowns
   */
  private cleanupCooldowns(timestamp: Date): void {
    for (const [key, cooldownEnd] of this.eventCooldowns.entries()) {
      const timeSinceCooldown = timestamp.getTime() - cooldownEnd.getTime();

      if (timeSinceCooldown > this.config.deduplicationCooldownMs * 2) {
        this.eventCooldowns.delete(key);
      }
    }
  }

  /**
   * Get active candidates
   */
  getActiveCandidates(): FightCandidate[] {
    return Array.from(this.candidates.values()).filter(
      (c) => c.status === "candidate",
    );
  }

  /**
   * Get confirmed events
   */
  getConfirmedEvents(): FightEvidence[] {
    return Array.from(this.confirmedEvents.values());
  }
}
