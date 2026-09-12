/**
 * Production-Ready Fall Detector for Analytics Engine
 * Detects sudden falls using pose estimation kinematics and bounding box aspect ratio dynamics.
 * Suitable for worker safety (industrial/construction) and elderly care facilities.
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, getInferenceObjects } from "./base-detector.js";

export interface FallKeypoint {
  x: number;
  y: number;
  confidence: number;
}

export interface FallPoseData {
  nose?: FallKeypoint;
  leftShoulder?: FallKeypoint;
  rightShoulder?: FallKeypoint;
  leftHip?: FallKeypoint;
  rightHip?: FallKeypoint;
  leftKnee?: FallKeypoint;
  rightKnee?: FallKeypoint;
  leftAnkle?: FallKeypoint;
  rightAnkle?: FallKeypoint;
  [key: string]: FallKeypoint | undefined;
}

export interface FallEvent {
  personTrackId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  fallType: "forward" | "backward" | "sideways" | "slump" | "scaffold_drop" | "unknown";
  impactEstimated: boolean;
  recoveryDetected: boolean;
  durationSeconds: number;
  torsoAngleDegrees: number | null;
  aspectRatio: number;
  motionlessDurationSeconds: number;
}

interface PersonState {
  aspectRatio: number; // width/height
  verticalPosition: number; // 0-1 from bottom (1 - (y + height))
  velocityY: number; // vertical movement speed (downward is negative verticalPosition)
  isUpright: boolean;
  lastUpdate: Date;
  fallStartTime?: Date;
  impactTime?: Date;
  recoveryTime?: Date;
  torsoAngleDegrees: number | null;
  poseDetected: boolean;
  fallType: FallEvent["fallType"];
}

export class FallDetector extends BaseDetector {
  private isModelLoaded = true;
  private personStates = new Map<string, PersonState>();

  private readonly FALL_ASPECT_RATIO_THRESHOLD = 1.20; // width > height indicates horizontal recumbent
  private readonly VERTICAL_VELOCITY_THRESHOLD = 0.150; // Rapid downward descent
  private readonly TORSO_HORIZONTAL_THRESHOLD = 35.0; // Degrees relative to floor
  private readonly RECOVERY_TIME_THRESHOLD_MS = 5000; // 5 seconds of upright posture to confirm recovery
  private readonly MOTIONLESS_TIME_THRESHOLD_MS = 3000; // 3 seconds of motionless ground contact for high urgency

  constructor() {
    super("fall", "2.0.0");
  }

  async initialize(): Promise<void> {
    console.log("[FallDetector] Initializing production pose & aspect ratio dynamics fall detector...");
    this.isModelLoaded = true;
    this.startStateCleanup();
    console.log("[FallDetector] Fall detector initialized successfully.");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const fallEvents = await this.detectFallsInFrame(frame);
    const results: DetectionResult[] = [];

    if (fallEvents.length > 0) {
      // Filter out recovered falls unless duration exceeds threshold
      const activeFalls = fallEvents.filter(f => 
        !f.recoveryDetected || f.durationSeconds > 10
      );

      if (activeFalls.length > 0) {
        results.push({
          detectionType: "fall",
          confidence: this.calculateAverageConfidence(activeFalls),
          objects: activeFalls.map(fall => ({
            label: "person-fallen",
            confidence: fall.confidence,
            trackId: fall.personTrackId,
            boundingBox: fall.boundingBox,
          })),
          metadata: {
            fallCount: activeFalls.length,
            fallTypes: activeFalls.map(f => f.fallType),
            needsAssistance: activeFalls.filter(f => !f.recoveryDetected).length,
            longestDuration: Math.max(...activeFalls.map(f => f.durationSeconds)),
            aspectRatios: activeFalls.map(f => f.aspectRatio),
            torsoAngles: activeFalls.map(f => f.torsoAngleDegrees),
            motionlessDurations: activeFalls.map(f => f.motionlessDurationSeconds),
          },
          requiresAlert: true,
        });
      }
    }

    return results;
  }

  /**
   * Detect falls in frame
   */
  private async detectFallsInFrame(frame: DetectionFrame): Promise<FallEvent[]> {
    const persons = getInferenceObjects(frame, ["person"])
      .filter((person) => person.confidence !== null && person.confidence >= 0.45);

    const events: FallEvent[] = [];

    for (const person of persons) {
      const trackId = person.trackId ?? `box:${person.boundingBox.x.toFixed(2)}:${person.boundingBox.y.toFixed(2)}`;
      
      // Extract pose if available in attributes
      const poseData = this.extractPoseFromPerson(person);

      if (!this.analyzeDynamicsForFall(trackId, person.boundingBox, poseData, frame.timestamp)) {
        continue;
      }

      const state = this.personStates.get(trackId)!;
      const durationSeconds = state.fallStartTime
        ? Math.max(0, (frame.timestamp.getTime() - state.fallStartTime.getTime()) / 1000)
        : 0;

      const motionlessDurationSeconds = state.impactTime
        ? Math.max(0, (frame.timestamp.getTime() - state.impactTime.getTime()) / 1000)
        : 0;

      const isRecovered = this.checkRecovery(trackId, frame.timestamp);

      events.push({
        personTrackId: trackId,
        boundingBox: person.boundingBox,
        confidence: person.confidence ?? 0.85,
        fallType: state.fallType,
        impactEstimated: Math.abs(state.velocityY) >= this.VERTICAL_VELOCITY_THRESHOLD,
        recoveryDetected: isRecovered,
        durationSeconds: Number(durationSeconds.toFixed(1)),
        torsoAngleDegrees: state.torsoAngleDegrees,
        aspectRatio: state.aspectRatio,
        motionlessDurationSeconds: Number(motionlessDurationSeconds.toFixed(1)),
      });
    }

    return events;
  }

  /**
   * Extract pose keypoints from inference object attributes if present
   */
  private extractPoseFromPerson(person: any): FallPoseData | undefined {
    if (!person.attributes) return undefined;
    const pose = person.attributes.pose || person.attributes.keypoints;
    if (pose && typeof pose === "object") {
      return pose as FallPoseData;
    }
    return undefined;
  }

  /**
   * Analyze bounding box aspect ratio and pose keypoints for fall dynamics
   */
  private analyzeDynamicsForFall(
    trackId: string,
    boundingBox: { x: number; y: number; width: number; height: number },
    pose: FallPoseData | undefined,
    timestamp: Date
  ): boolean {
    const aspectRatio = boundingBox.height > 0 ? boundingBox.width / boundingBox.height : 0.5;
    const verticalPosition = 1 - (boundingBox.y + boundingBox.height);

    const prevState = this.personStates.get(trackId);

    // Calculate vertical velocity if previous state exists
    let velocityY = 0;
    if (prevState) {
      const timeDiff = (timestamp.getTime() - prevState.lastUpdate.getTime()) / 1000;
      if (timeDiff > 0) {
        velocityY = (verticalPosition - prevState.verticalPosition) / timeDiff;
      }
    }

    // Pose analysis: torso angle and fall direction
    let torsoAngleDegrees: number | null = null;
    let fallType: FallEvent["fallType"] = prevState?.fallType || "unknown";

    if (pose) {
      const shoulderMid = this.calculateMidpoint(pose.leftShoulder, pose.rightShoulder);
      const hipMid = this.calculateMidpoint(pose.leftHip, pose.rightHip);

      if (shoulderMid && hipMid) {
        const dx = Math.abs(shoulderMid.x - hipMid.x);
        const dy = Math.abs(shoulderMid.y - hipMid.y);
        const rad = Math.atan2(dy, dx);
        torsoAngleDegrees = Number(((rad * 180) / Math.PI).toFixed(1));

        fallType = this.classifyFallTypeFromPose(shoulderMid, hipMid, pose);
      }
    }

    // Determine uprightness: upright if aspect ratio is tall and torso (if present) is vertical
    const isUprightAR = aspectRatio < this.FALL_ASPECT_RATIO_THRESHOLD;
    const isUprightPose = torsoAngleDegrees === null || torsoAngleDegrees >= this.TORSO_HORIZONTAL_THRESHOLD;
    const isUpright = isUprightAR && isUprightPose;

    const isFalling =
      (velocityY < -this.VERTICAL_VELOCITY_THRESHOLD && !isUpright) ||
      (!isUpright && prevState && prevState.isUpright && velocityY < -0.05);

    const isLyingDown = !isUpright && prevState && !prevState.isUpright;

    const hasFallen = isFalling || isLyingDown;

    const fallStartTime = hasFallen
      ? prevState?.fallStartTime || timestamp
      : undefined;

    const impactTime = hasFallen
      ? prevState?.impactTime || timestamp
      : undefined;

    this.personStates.set(trackId, {
      aspectRatio: Number(aspectRatio.toFixed(3)),
      verticalPosition: Number(verticalPosition.toFixed(3)),
      velocityY: Number(velocityY.toFixed(3)),
      isUpright,
      lastUpdate: timestamp,
      fallStartTime,
      impactTime,
      recoveryTime: isUpright && prevState && !prevState.isUpright ? timestamp : prevState?.recoveryTime,
      torsoAngleDegrees,
      poseDetected: Boolean(pose),
      fallType: hasFallen && fallType === "unknown" ? "forward" : fallType,
    });

    return hasFallen;
  }

  private calculateMidpoint(p1?: FallKeypoint, p2?: FallKeypoint): FallKeypoint | null {
    if (!p1 && !p2) return null;
    if (p1 && !p2) return p1;
    if (!p1 && p2) return p2;
    return {
      x: (p1!.x + p2!.x) / 2,
      y: (p1!.y + p2!.y) / 2,
      confidence: Math.min(p1!.confidence, p2!.confidence),
    };
  }

  /**
   * Classify fall type based on pose keypoints
   */
  private classifyFallTypeFromPose(
    shoulders: FallKeypoint,
    hips: FallKeypoint,
    pose: FallPoseData
  ): FallEvent["fallType"] {
    const dx = shoulders.x - hips.x;
    const dy = shoulders.y - hips.y;

    // Lateral tilt
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      return "sideways";
    }

    if (pose.leftKnee && pose.rightKnee) {
      const kneeMidY = (pose.leftKnee.y + pose.rightKnee.y) / 2;
      if (Math.abs(hips.y - kneeMidY) < 20) {
        return "slump";
      }
    }

    if (pose.nose) {
      return pose.nose.y >= hips.y ? "forward" : "backward";
    }

    return "forward";
  }

  /**
   * Check if person has recovered from fall
   */
  private checkRecovery(trackId: string, timestamp: Date): boolean {
    const state = this.personStates.get(trackId);
    if (!state || !state.fallStartTime || !state.recoveryTime) return false;

    const timeSinceRecovery = timestamp.getTime() - state.recoveryTime.getTime();
    return state.isUpright && timeSinceRecovery >= this.RECOVERY_TIME_THRESHOLD_MS;
  }

  /**
   * Clean up old person states
   */
  private startStateCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = 30000; // 30 seconds

      for (const [trackId, state] of this.personStates.entries()) {
        if (now.getTime() - state.lastUpdate.getTime() > timeout) {
          this.personStates.delete(trackId);
        }
      }
    }, 15000);
  }

  private calculateAverageConfidence(falls: FallEvent[]): number {
    if (falls.length === 0) return 0;
    const sum = falls.reduce((acc, f) => acc + f.confidence, 0);
    return Number((sum / falls.length).toFixed(3));
  }

  async cleanup(): Promise<void> {
    this.personStates.clear();
    console.log("[FallDetector] Fall detector cleaned up");
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: `Production pose & aspect ratio dynamics fall detector active; tracking ${this.personStates.size} persons`,
    };
  }
}
