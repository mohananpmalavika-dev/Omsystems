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
    // Check capability and register fight_detection if needed
    const registry = getCapabilityRegistry();
    if (!registry.isAvailable("fight_detection")) {
      registry.updateCapability({
        name: "fight_detection",
        status: "ready",
        modelVersion: "optical-flow-limb-kinetics-v1.0",
        updatedAt: new Date(),
      });
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
              status: finalConfidence >= 0.75 ? "confirmed" : "uncertain",
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
   * Temporal multi-frame kinetic strike and grapple classifier
   */
  private async classifyInteraction(candidate: FightCandidate): Promise<number> {
    const features = candidate.features;
    if (features.length === 0) return 0;

    // 1. Strike impulses: frames where limb acceleration exceeded threshold (>= 30 px/s²)
    const strikeFrames = features.filter(
      (f) =>
        f.wristAccelerationA >= this.config.minLimbAcceleration ||
        f.wristAccelerationB >= this.config.minLimbAcceleration,
    ).length;
    const strikeRatio = strikeFrames / features.length;
    const strikeScore = Math.min(1.0, strikeRatio * 2.5);

    // 2. High-speed approach and proximity persistence
    const closeContactFrames = features.filter((f) => f.normalizedDistance < 1.2).length;
    const contactScore = closeContactFrames / features.length;

    // 3. Postural instability & grappling dynamics
    const avgInstability = features.reduce((sum, f) => sum + f.poseInstability, 0) / features.length;
    const instabilityScore = Math.min(1.0, avgInstability * 1.5);

    // 4. Overlap and relative velocity
    const avgOverlap = features.reduce((sum, f) => sum + f.overlapRatio, 0) / features.length;
    const overlapScore = Math.min(1.0, avgOverlap * 3.0);

    const duration = candidate.lastUpdatedAt.getTime() - candidate.startedAt.getTime();
    const persistenceBonus = Math.min(0.2, (duration / this.config.confirmationWindowMs) * 0.2);

    // Composite temporal kinetic classification
    const rawScore =
      0.35 * strikeScore +
      0.25 * contactScore +
      0.20 * instabilityScore +
      0.20 * overlapScore +
      persistenceBonus;

    return Math.min(1.0, Math.max(0.0, rawScore));
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
   * Calculate rapid limb / wrist acceleration via discrete numerical derivatives
   * of pose keypoints or upper-quadrant ballistic motion proxies.
   */
  private calculateWristAcceleration(track: PersonTrack): number {
    const obs = track.observations;
    if (obs.length < 2) {
      return track.speed ? track.speed * 10 : 0;
    }

    // Try keypoint-based limb acceleration first
    const keypointAccels: number[] = [];
    for (let i = Math.max(1, obs.length - 4); i < obs.length; i++) {
      const prev = obs[i - 1];
      const curr = obs[i];
      const dt = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dt <= 0 || dt > 1.0) continue;

      if (curr.keypoints && prev.keypoints) {
        const wrists = [
          { c: curr.keypoints.leftWrist, p: prev.keypoints.leftWrist },
          { c: curr.keypoints.rightWrist, p: prev.keypoints.rightWrist },
          { c: curr.keypoints.leftAnkle, p: prev.keypoints.leftAnkle },
          { c: curr.keypoints.rightAnkle, p: prev.keypoints.rightAnkle },
        ];
        for (const { c, p } of wrists) {
          if (c && p && c.confidence > 0.25 && p.confidence > 0.25) {
            const vx = (c.x - p.x) / dt;
            const vy = (c.y - p.y) / dt;
            const speed = Math.sqrt(vx * vx + vy * vy);
            if (i >= 2 && obs[i - 2].keypoints) {
              const pprev = obs[i - 2];
              const dtPrev = (prev.timestamp.getTime() - pprev.timestamp.getTime()) / 1000;
              if (dtPrev > 0 && dtPrev <= 1.0) {
                const pKeypoint =
                  c === curr.keypoints.leftWrist
                    ? pprev.keypoints?.leftWrist
                    : c === curr.keypoints.rightWrist
                    ? pprev.keypoints?.rightWrist
                    : c === curr.keypoints.leftAnkle
                    ? pprev.keypoints?.leftAnkle
                    : pprev.keypoints?.rightAnkle;
                if (pKeypoint && pKeypoint.confidence > 0.25) {
                  const vxPrev = (p.x - pKeypoint.x) / dtPrev;
                  const vyPrev = (p.y - pKeypoint.y) / dtPrev;
                  const ax = (vx - vxPrev) / dt;
                  const ay = (vy - vyPrev) / dt;
                  keypointAccels.push(Math.sqrt(ax * ax + ay * ay));
                }
              }
            } else {
              keypointAccels.push(speed / dt);
            }
          }
        }
      }
    }

    if (keypointAccels.length > 0) {
      return Math.max(...keypointAccels);
    }

    // Fallback: Upper-quadrant proxy kinematics (ballistic hand/torso motion)
    const proxyAccels: number[] = [];
    for (let i = Math.max(2, obs.length - 4); i < obs.length; i++) {
      const pprev = obs[i - 2];
      const prev = obs[i - 1];
      const curr = obs[i];
      const dt1 = (prev.timestamp.getTime() - pprev.timestamp.getTime()) / 1000;
      const dt2 = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dt1 <= 0 || dt2 <= 0 || dt1 > 1.0 || dt2 > 1.0) continue;

      const u1x = pprev.boundingBox.x + pprev.boundingBox.width / 2;
      const u1y = pprev.boundingBox.y + pprev.boundingBox.height * 0.25;
      const u2x = prev.boundingBox.x + prev.boundingBox.width / 2;
      const u2y = prev.boundingBox.y + prev.boundingBox.height * 0.25;
      const u3x = curr.boundingBox.x + curr.boundingBox.width / 2;
      const u3y = curr.boundingBox.y + curr.boundingBox.height * 0.25;

      const v1x = (u2x - u1x) / dt1;
      const v1y = (u2y - u1y) / dt1;
      const v2x = (u3x - u2x) / dt2;
      const v2y = (u3y - u2y) / dt2;

      const ax = (v2x - v1x) / dt2;
      const ay = (v2y - v1y) / dt2;
      proxyAccels.push(Math.sqrt(ax * ax + ay * ay));
    }

    return proxyAccels.length > 0 ? Math.max(...proxyAccels) : (track.speed ? track.speed * 15 : 0);
  }

  /**
   * Calculate torso motion
   */
  private calculateTorsoMotion(track: PersonTrack): number {
    const obs = track.observations;
    if (obs.length < 2) return track.speed || 0;

    const last = obs[obs.length - 1];
    const prev = obs[obs.length - 2];
    const dt = (last.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    if (dt <= 0) return 0;

    if (last.keypoints && prev.keypoints) {
      const getMid = (kp: PoseKeypoints) => ({
        x: (kp.leftShoulder.x + kp.rightShoulder.x + kp.leftHip.x + kp.rightHip.x) / 4,
        y: (kp.leftShoulder.y + kp.rightShoulder.y + kp.leftHip.y + kp.rightHip.y) / 4,
      });
      const m1 = getMid(prev.keypoints);
      const m2 = getMid(last.keypoints);
      return Math.sqrt((m2.x - m1.x) ** 2 + (m2.y - m1.y) ** 2) / dt;
    }

    const c1 = {
      x: prev.boundingBox.x + prev.boundingBox.width / 2,
      y: prev.boundingBox.y + prev.boundingBox.height / 2,
    };
    const c2 = {
      x: last.boundingBox.x + last.boundingBox.width / 2,
      y: last.boundingBox.y + last.boundingBox.height / 2,
    };
    return Math.sqrt((c2.x - c1.x) ** 2 + (c2.y - c1.y) ** 2) / dt;
  }

  /**
   * Calculate pose instability
   */
  private calculatePoseInstability(trackA: PersonTrack, trackB: PersonTrack): number {
    const computeTrackTilt = (track: PersonTrack): number => {
      const obs = track.observations.slice(-5);
      if (obs.length < 2) return 0;

      const angles: number[] = [];
      for (const o of obs) {
        if (o.keypoints && o.keypoints.nose && o.keypoints.leftHip && o.keypoints.rightHip) {
          const hipMidX = (o.keypoints.leftHip.x + o.keypoints.rightHip.x) / 2;
          const hipMidY = (o.keypoints.leftHip.y + o.keypoints.rightHip.y) / 2;
          const angle = Math.atan2(o.keypoints.nose.x - hipMidX, hipMidY - o.keypoints.nose.y);
          angles.push(angle);
        } else {
          angles.push(o.boundingBox.height / Math.max(1, o.boundingBox.width));
        }
      }

      if (angles.length < 2) return 0;
      const mean = angles.reduce((sum, a) => sum + a, 0) / angles.length;
      const variance = angles.reduce((sum, a) => sum + (a - mean) ** 2, 0) / angles.length;
      return Math.min(1.0, Math.sqrt(variance) * 2.0);
    };

    const instabilityA = computeTrackTilt(trackA);
    const instabilityB = computeTrackTilt(trackB);
    return (instabilityA + instabilityB) / 2;
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
