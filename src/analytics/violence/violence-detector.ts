/**
 * Physical Violence & Fight Detection Core Engine
 * 
 * Multi-factor kinetic fusion combining dense optical flow energy, directional
 * turbulence entropy, rapid limb strike kinematics, and multi-person interaction geometry
 * with temporal persistence gating.
 */

import { OpticalFlowAnalyzer, type OpticalFlowMetrics, type OpticalFlowVector } from './optical-flow.js';
import { LimbAccelerationAnalyzer, type TrackObservation, type LimbKinematicsSummary, type StrikeEvent } from './limb-acceleration.js';

export interface PersonDetectionTrack {
  trackId: string;
  observations: TrackObservation[];
}

export interface ViolenceDetectionInput {
  cameraId: string;
  tenantId: string;
  timestamp: number; // milliseconds
  prevLuma?: Uint8Array | Buffer;
  currLuma?: Uint8Array | Buffer;
  frameWidth?: number;
  frameHeight?: number;
  activeTracks: PersonDetectionTrack[];
  precomputedFlowVectors?: OpticalFlowVector[];
}

export interface ViolenceDetectionResult {
  detected: boolean;
  confidence: number; // [0, 1]
  severity: 'P1' | 'P2' | 'P3';
  status: 'confirmed' | 'suspected' | 'none';
  opticalFlowEnergy: number;
  turbulenceScore: number;
  maxLimbAcceleration: number;
  strikeCount: number;
  participantCount: number;
  participantTrackIds: string[];
  interactionBox: { x: number; y: number; width: number; height: number } | null;
  metrics: {
    proximityScore: number;
    flowKineticScore: number;
    turbulenceScore: number;
    limbStrikeScore: number;
    temporalDurationMs: number;
    detectedStrikes: StrikeEvent[];
  };
  alertRequired: boolean;
}

export interface ViolenceDetectorConfig {
  sensitivity: number; // 0.1 to 1.0 (default 0.70)
  minConfidence: number; // 0.1 to 1.0 (default 0.65)
  minOpticalFlowEnergy: number; // default 25.0
  minLimbAcceleration: number; // default 30.0
  minDurationMs: number; // default 500ms
  cooldownSeconds: number; // default 15s
  alertSeverity: 'P1' | 'P2' | 'P3';
}

interface OngoingIncidentState {
  startedAt: number;
  lastActiveAt: number;
  participantTrackIds: Set<string>;
  maxConfidence: number;
  peakOpticalEnergy: number;
  peakLimbAccel: number;
  accumulatedStrikes: StrikeEvent[];
  interactionBox: { x: number; y: number; width: number; height: number } | null;
  alertDispatched: boolean;
}

export class ViolenceDetector {
  private readonly opticalFlowAnalyzer: OpticalFlowAnalyzer;
  private readonly limbAnalyzer: LimbAccelerationAnalyzer;
  private readonly config: ViolenceDetectorConfig;

  // Active ongoing encounter states per camera
  private readonly ongoingIncidents = new Map<string, OngoingIncidentState>();
  // Cooldown timestamps per camera
  private readonly cooldowns = new Map<string, number>();

  constructor(config?: Partial<ViolenceDetectorConfig>) {
    this.config = {
      sensitivity: config?.sensitivity ?? 0.70,
      minConfidence: config?.minConfidence ?? 0.65,
      minOpticalFlowEnergy: config?.minOpticalFlowEnergy ?? 25.0,
      minLimbAcceleration: config?.minLimbAcceleration ?? 30.0,
      minDurationMs: config?.minDurationMs ?? 500,
      cooldownSeconds: config?.cooldownSeconds ?? 15,
      alertSeverity: config?.alertSeverity ?? 'P1',
    };

    this.opticalFlowAnalyzer = new OpticalFlowAnalyzer({ blockSize: 16 });
    this.limbAnalyzer = new LimbAccelerationAnalyzer({
      strikeAccelThreshold: this.config.minLimbAcceleration,
    });
  }

  /**
   * Process incoming frame telemetry and active tracks
   */
  public analyze(input: ViolenceDetectionInput): ViolenceDetectionResult {
    const now = input.timestamp;
    const cameraId = input.cameraId;

    // Filter tracks with at least 2 observations
    const validTracks = input.activeTracks.filter((t) => t.observations.length >= 2);

    // If fewer than 2 persons are visible, check if an ongoing altercation just dispersed
    if (validTracks.length < 2) {
      this.cleanupDispersed(cameraId, now);
      return this.emptyResult();
    }

    // 1. Identify interacting multi-person clusters / pairs
    const interaction = this.findInteractionCluster(validTracks);
    if (!interaction) {
      this.cleanupDispersed(cameraId, now);
      return this.emptyResult();
    }

    // 2. Optical Flow Motion Analysis
    let flowMetrics: OpticalFlowMetrics;
    if (input.precomputedFlowVectors && input.precomputedFlowVectors.length > 0) {
      flowMetrics = this.opticalFlowAnalyzer.analyzeMetrics(input.precomputedFlowVectors);
    } else if (input.prevLuma && input.currLuma && input.frameWidth && input.frameHeight) {
      const vectors = this.opticalFlowAnalyzer.computeFlow(
        input.prevLuma,
        input.currLuma,
        input.frameWidth,
        input.frameHeight,
        interaction.boundingBox
      );
      flowMetrics = this.opticalFlowAnalyzer.analyzeMetrics(vectors);
    } else {
      // Fallback from bounding box kinematic velocities if pixel buffers are omitted
      flowMetrics = this.approximateFlowFromTracks(validTracks, interaction.boundingBox);
    }

    // 3. Limb Kinematics Analysis
    const kinematicSummaries: LimbKinematicsSummary[] = [];
    const detectedStrikes: StrikeEvent[] = [];
    let peakLimbAccel = 0;

    for (const track of interaction.tracks) {
      const summary = this.limbAnalyzer.analyzeTrajectory(track.trackId, track.observations);
      kinematicSummaries.push(summary);
      detectedStrikes.push(...summary.detectedStrikes);
      if (summary.peakAcceleration > peakLimbAccel) {
        peakLimbAccel = summary.peakAcceleration;
      }
    }

    // 4. Multi-Factor Kinetic Scoring
    // Proximity score: closer participants = higher altercation probability
    const proximityScore = interaction.proximityFactor;

    // Flow kinetic score: scales up with energy past threshold
    const flowKineticScore = Math.min(
      1.0,
      flowMetrics.kineticEnergy / (this.config.minOpticalFlowEnergy * 1.5)
    );

    // Directional turbulence: high entropy implies chaotic opposing vectors
    const turbulenceScore = flowMetrics.turbulenceScore;

    // Limb strike score: scales with peak acceleration and strike count
    const strikeCount = detectedStrikes.length;
    const limbStrikeScore = Math.min(
      1.0,
      (peakLimbAccel / (this.config.minLimbAcceleration * 1.5)) * 0.6 +
        Math.min(0.4, strikeCount * 0.2)
    );

    // Weighted composite fusion
    // Sensitivity adjusts the trigger baseline: higher sensitivity lowers required threshold
    const rawScore =
      0.25 * proximityScore +
      0.25 * flowKineticScore +
      0.25 * turbulenceScore +
      0.25 * limbStrikeScore;

    const adjustedConfidence = Math.min(
      1.0,
      Math.max(0.0, rawScore * (this.config.sensitivity / 0.70))
    );

    // 5. Temporal Persistence State Machine
    let incident = this.ongoingIncidents.get(cameraId);
    let alertRequired = false;
    let status: 'confirmed' | 'suspected' | 'none' = 'none';
    let durationMs = 0;

    const isAboveInstantThreshold =
      adjustedConfidence >= this.config.minConfidence ||
      (strikeCount >= 2 && adjustedConfidence >= 0.50) ||
      (flowMetrics.kineticEnergy >= this.config.minOpticalFlowEnergy && turbulenceScore >= 0.50 && proximityScore >= 0.60) ||
      (incident !== undefined && now - incident.lastActiveAt <= 2000 && proximityScore >= 0.60);

    if (isAboveInstantThreshold) {
      if (!incident) {
        // Start tracking candidate incident
        incident = {
          startedAt: now,
          lastActiveAt: now,
          participantTrackIds: new Set(interaction.tracks.map((t) => t.trackId)),
          maxConfidence: adjustedConfidence,
          peakOpticalEnergy: flowMetrics.kineticEnergy,
          peakLimbAccel,
          accumulatedStrikes: [...detectedStrikes],
          interactionBox: interaction.boundingBox,
          alertDispatched: false,
        };
        this.ongoingIncidents.set(cameraId, incident);
        status = 'suspected';
      } else {
        // Update ongoing candidate
        incident.lastActiveAt = now;
        interaction.tracks.forEach((t) => incident!.participantTrackIds.add(t.trackId));
        if (adjustedConfidence > incident.maxConfidence) incident.maxConfidence = adjustedConfidence;
        if (flowMetrics.kineticEnergy > incident.peakOpticalEnergy) incident.peakOpticalEnergy = flowMetrics.kineticEnergy;
        if (peakLimbAccel > incident.peakLimbAccel) incident.peakLimbAccel = peakLimbAccel;
        incident.accumulatedStrikes.push(...detectedStrikes);
        incident.interactionBox = interaction.boundingBox;
      }

      durationMs = now - incident.startedAt;

      // Check if candidate has persisted past minimum duration
      if (durationMs >= this.config.minDurationMs) {
        status = 'confirmed';

        // Check cooldown before triggering alert
        const lastCooldown = this.cooldowns.get(cameraId);
        const cooldownElapsed = lastCooldown === undefined || (now - lastCooldown) / 1000 >= this.config.cooldownSeconds;

        if (!incident.alertDispatched && cooldownElapsed) {
          alertRequired = true;
          incident.alertDispatched = true;
          this.cooldowns.set(cameraId, now);
        }
      } else {
        status = 'suspected';
      }
    } else {
      this.cleanupDispersed(cameraId, now);
    }

    // Determine severity: P1 for high confidence + multiple strikes, P2 for grappling/scuffle
    const severity: 'P1' | 'P2' | 'P3' =
      adjustedConfidence >= 0.85 || strikeCount >= 3 || (peakLimbAccel >= this.config.minLimbAcceleration * 1.5)
        ? 'P1'
        : adjustedConfidence >= 0.65
        ? 'P2'
        : 'P3';

    return {
      detected: status === 'confirmed' || status === 'suspected',
      confidence: Number(adjustedConfidence.toFixed(4)),
      severity,
      status,
      opticalFlowEnergy: Number(flowMetrics.kineticEnergy.toFixed(2)),
      turbulenceScore: flowMetrics.turbulenceScore,
      maxLimbAcceleration: Number(peakLimbAccel.toFixed(2)),
      strikeCount,
      participantCount: interaction.tracks.length,
      participantTrackIds: interaction.tracks.map((t) => t.trackId),
      interactionBox: interaction.boundingBox,
      metrics: {
        proximityScore: Number(proximityScore.toFixed(4)),
        flowKineticScore: Number(flowKineticScore.toFixed(4)),
        turbulenceScore: Number(turbulenceScore.toFixed(4)),
        limbStrikeScore: Number(limbStrikeScore.toFixed(4)),
        temporalDurationMs: durationMs,
        detectedStrikes,
      },
      alertRequired,
    };
  }

  private findInteractionCluster(
    tracks: PersonDetectionTrack[]
  ): { tracks: PersonDetectionTrack[]; proximityFactor: number; boundingBox: { x: number; y: number; width: number; height: number } } | null {
    let closestPair: { t1: PersonDetectionTrack; t2: PersonDetectionTrack; normDist: number } | null = null;
    let minNormDist = 999;

    for (let i = 0; i < tracks.length; i++) {
      for (let j = i + 1; j < tracks.length; j++) {
        const t1 = tracks[i]!;
        const t2 = tracks[j]!;

        const b1 = t1.observations[t1.observations.length - 1]!.boundingBox;
        const b2 = t2.observations[t2.observations.length - 1]!.boundingBox;

        const c1 = { x: b1.x + b1.width / 2, y: b1.y + b1.height / 2 };
        const c2 = { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 };

        const dist = Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
        const avgHeight = (b1.height + b2.height) / 2;
        const normDist = avgHeight > 0 ? dist / avgHeight : 999;

        if (normDist < minNormDist) {
          minNormDist = normDist;
          closestPair = { t1, t2, normDist };
        }
      }
    }

    // Interaction threshold: normalized distance < 1.35x average height
    if (!closestPair || closestPair.normDist > 1.35) {
      return null;
    }

    const b1 = closestPair.t1.observations[closestPair.t1.observations.length - 1]!.boundingBox;
    const b2 = closestPair.t2.observations[closestPair.t2.observations.length - 1]!.boundingBox;

    const minX = Math.min(b1.x, b2.x);
    const minY = Math.min(b1.y, b2.y);
    const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
    const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);

    // Proximity factor: 1.0 at touching/overlapping, drops toward 0 as distance reaches 1.35
    const proximityFactor = Math.max(0.0, Math.min(1.0, 1.0 - closestPair.normDist / 1.35));

    return {
      tracks: [closestPair.t1, closestPair.t2],
      proximityFactor,
      boundingBox: {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(maxX - minX),
        height: Math.round(maxY - minY),
      },
    };
  }

  private approximateFlowFromTracks(
    tracks: PersonDetectionTrack[],
    roi: { x: number; y: number; width: number; height: number }
  ): OpticalFlowMetrics {
    let kineticSum = 0;
    let peakMag = 0;
    const simulatedVectors: OpticalFlowVector[] = [];

    for (const track of tracks) {
      const obs = track.observations;
      if (obs.length >= 2) {
        const p0 = obs[obs.length - 2]!;
        const p1 = obs[obs.length - 1]!;
        const dt = (p1.timestamp - p0.timestamp) / 1000;
        if (dt > 0.01) {
          const vx = (p1.boundingBox.x - p0.boundingBox.x) / dt;
          const vy = (p1.boundingBox.y - p0.boundingBox.y) / dt;
          const mag = Math.sqrt(vx * vx + vy * vy);
          const angle = Math.atan2(vy, vx);

          simulatedVectors.push({
            x: p1.boundingBox.x,
            y: p1.boundingBox.y,
            u: vx,
            v: vy,
            magnitude: mag,
            angle,
          });

          kineticSum += 0.5 * mag * mag;
          if (mag > peakMag) peakMag = mag;
        }
      }
    }

    return this.opticalFlowAnalyzer.analyzeMetrics(simulatedVectors);
  }

  private cleanupDispersed(cameraId: string, now: number): void {
    const incident = this.ongoingIncidents.get(cameraId);
    if (incident && now - incident.lastActiveAt > 2000) {
      this.ongoingIncidents.delete(cameraId);
    }
  }

  private emptyResult(): ViolenceDetectionResult {
    return {
      detected: false,
      confidence: 0,
      severity: 'P3',
      status: 'none',
      opticalFlowEnergy: 0,
      turbulenceScore: 0,
      maxLimbAcceleration: 0,
      strikeCount: 0,
      participantCount: 0,
      participantTrackIds: [],
      interactionBox: null,
      metrics: {
        proximityScore: 0,
        flowKineticScore: 0,
        turbulenceScore: 0,
        limbStrikeScore: 0,
        temporalDurationMs: 0,
        detectedStrikes: [],
      },
      alertRequired: false,
    };
  }
}
