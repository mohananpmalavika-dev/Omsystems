/**
 * Behavior Analysis Detector
 * Detects unusual or suspicious behaviors
 */

import {
  BaseDetector,
  type DetectedObject,
  type DetectionFrame,
  type DetectionResult,
  getBoundingBoxCenter,
} from "./base-detector.js";

export interface BehaviorConfig {
  runningSpeedThreshold: number; // pixels per second
  fightingMotionThreshold: number;
  fallingDurationThreshold: number; // seconds
  abnormalPostureThreshold: number;
  aggressionDetectionEnabled: boolean;
}

interface TrackedPerson {
  trackId: string;
  positions: Array<{ x: number; y: number; timestamp: Date }>;
  poses: Array<{ keypoints: any[]; timestamp: Date }>;
  lastSeen: Date;
  behaviorHistory: string[];
}

export class BehaviorDetector extends BaseDetector {
  private config: BehaviorConfig;
  private trackedPersons = new Map<string, TrackedPerson>();
  private poseModel: any = null;
  private isInitialized = false;
  private readonly TRACKING_TIMEOUT_MS = 5000;

  constructor(config: Partial<BehaviorConfig> = {}) {
    super("behavior", "1.0.0");
    this.config = {
      runningSpeedThreshold: config.runningSpeedThreshold ?? 100, // pixels/second
      fightingMotionThreshold: config.fightingMotionThreshold ?? 50,
      fallingDurationThreshold: config.fallingDurationThreshold ?? 2,
      abnormalPostureThreshold: config.abnormalPostureThreshold ?? 0.7,
      aggressionDetectionEnabled: config.aggressionDetectionEnabled ?? true,
    };
  }

  async initialize(): Promise<void> {
    // TODO: Load pose estimation model
    // Options:
    // 1. PoseNet (TensorFlow.js)
    // 2. MoveNet (faster, more accurate)
    // 3. OpenPose (comprehensive but slower)
    // 4. MediaPipe Pose

    // Example with MoveNet:
    // import * as poseDetection from '@tensorflow-models/pose-detection';
    // this.poseModel = await poseDetection.createDetector(
    //   poseDetection.SupportedModels.MoveNet
    // );

    console.log("BehaviorDetector initialized (simulation mode)");
    this.isInitialized = true;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("BehaviorDetector not initialized");
    }

    // This detector works with person detections from ObjectDetector
    // It doesn't detect objects itself, but analyzes movement patterns
    return [];
  }

  /**
   * Analyze behavior from person tracking data
   */
  async analyzeBehavior(
    frame: DetectionFrame,
    persons: DetectedObject[],
  ): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp;

    for (const person of persons) {
      if (!person.trackId) continue;

      // Update tracking
      let tracked = this.trackedPersons.get(person.trackId);
      if (!tracked) {
        tracked = {
          trackId: person.trackId,
          positions: [],
          poses: [],
          lastSeen: now,
          behaviorHistory: [],
        };
        this.trackedPersons.set(person.trackId, tracked);
      }

      const center = getBoundingBoxCenter(person.boundingBox);
      tracked.positions.push({ x: center.x, y: center.y, timestamp: now });
      tracked.lastSeen = now;

      // Keep only recent history (last 10 seconds)
      tracked.positions = tracked.positions.filter(
        (p) => now.getTime() - p.timestamp.getTime() < 10000,
      );

      // Detect pose if model is loaded
      // const pose = await this.detectPose(frame.imageData, person.boundingBox);
      // if (pose) tracked.poses.push({ keypoints: pose, timestamp: now });

      // Analyze behaviors
      if (tracked.positions.length >= 3) {
        // Running detection
        const runningResult = this.detectRunning(tracked, frame);
        if (runningResult) results.push(runningResult);

        // Sudden direction change (suspicious behavior)
        const directionChangeResult = this.detectSuddenDirectionChange(
          tracked,
          frame,
        );
        if (directionChangeResult) results.push(directionChangeResult);

        // Erratic movement (potential aggression/distress)
        const erraticResult = this.detectErraticMovement(tracked, frame);
        if (erraticResult) results.push(erraticResult);
      }

      // Pose-based behaviors
      if (tracked.poses.length >= 2) {
        // Falling detection
        const fallingResult = this.detectFalling(tracked, frame, person);
        if (fallingResult) results.push(fallingResult);

        // Fighting/aggressive posture
        if (this.config.aggressionDetectionEnabled) {
          const aggressionResult = this.detectAggression(tracked, frame, person);
          if (aggressionResult) results.push(aggressionResult);
        }

        // Abnormal posture (person on ground, unconscious)
        const abnormalResult = this.detectAbnormalPosture(tracked, frame, person);
        if (abnormalResult) results.push(abnormalResult);
      }
    }

    // Multi-person behaviors
    if (persons.length >= 2) {
      // Fight detection (multiple people with rapid movement)
      const fightResult = this.detectFighting(frame, persons);
      if (fightResult) results.push(fightResult);

      // Crowd unusual movement (stampede, panic)
      if (persons.length >= 5) {
        const crowdPanicResult = this.detectCrowdPanic(frame, persons);
        if (crowdPanicResult) results.push(crowdPanicResult);
      }
    }

    // Cleanup old tracks
    this.cleanupOldTracks(now);

    return results;
  }

  /**
   * Detect running (high speed movement)
   */
  private detectRunning(
    tracked: TrackedPerson,
    frame: DetectionFrame,
  ): DetectionResult | null {
    if (tracked.positions.length < 3) return null;

    const recentPositions = tracked.positions.slice(-3);
    const speed = this.calculateSpeed(recentPositions);

    if (speed > this.config.runningSpeedThreshold) {
      return {
        detectionType: "running",
        confidence: Math.min(0.95, speed / this.config.runningSpeedThreshold / 2),
        objects: [],
        metadata: {
          trackId: tracked.trackId,
          speed: Math.round(speed),
          threshold: this.config.runningSpeedThreshold,
        },
        requiresAlert: true,
      };
    }

    return null;
  }

  /**
   * Detect sudden direction change (evasive behavior)
   */
  private detectSuddenDirectionChange(
    tracked: TrackedPerson,
    frame: DetectionFrame,
  ): DetectionResult | null {
    if (tracked.positions.length < 4) return null;

    const positions = tracked.positions.slice(-4);
    const angles = [];

    for (let i = 0; i < positions.length - 2; i++) {
      const angle = this.calculateAngle(
        positions[i]!,
        positions[i + 1]!,
        positions[i + 2]!,
      );
      angles.push(angle);
    }

    // Detect sharp turn (> 90 degrees)
    const hasSharpTurn = angles.some((angle) => angle > 90);

    if (hasSharpTurn) {
      return {
        detectionType: "sudden-direction-change",
        confidence: 0.85,
        objects: [],
        metadata: {
          trackId: tracked.trackId,
          maxAngle: Math.max(...angles),
        },
        requiresAlert: true,
      };
    }

    return null;
  }

  /**
   * Detect erratic movement (zigzag, confusion, distress)
   */
  private detectErraticMovement(
    tracked: TrackedPerson,
    frame: DetectionFrame,
  ): DetectionResult | null {
    if (tracked.positions.length < 6) return null;

    const recentPositions = tracked.positions.slice(-6);
    const changes = [];

    for (let i = 0; i < recentPositions.length - 1; i++) {
      const dx = recentPositions[i + 1]!.x - recentPositions[i]!.x;
      const dy = recentPositions[i + 1]!.y - recentPositions[i]!.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      changes.push(distance);
    }

    // Calculate variance in movement
    const mean = changes.reduce((sum, d) => sum + d, 0) / changes.length;
    const variance =
      changes.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
      changes.length;
    const stdDev = Math.sqrt(variance);

    // High variance indicates erratic movement
    if (stdDev > 30 && mean > 10) {
      return {
        detectionType: "erratic-movement",
        confidence: Math.min(0.9, stdDev / 50),
        objects: [],
        metadata: {
          trackId: tracked.trackId,
          movementVariance: Math.round(variance),
        },
        requiresAlert: true,
      };
    }

    return null;
  }

  /**
   * Detect person falling
   */
  private detectFalling(
    tracked: TrackedPerson,
    frame: DetectionFrame,
    person: DetectedObject,
  ): DetectionResult | null {
    // TODO: Implement with pose estimation
    // Check if:
    // 1. Person's bounding box aspect ratio changes dramatically (becomes wider)
    // 2. Vertical position drops suddenly
    // 3. Pose keypoints show horizontal orientation

    // Simplified check: sudden height reduction
    if (tracked.positions.length < 2) return null;

    // Check bounding box aspect ratio change
    // Normal standing person: height/width > 1.5
    // Fallen person: height/width < 1.0

    return null;
  }

  /**
   * Detect aggressive posture or fighting
   */
  private detectAggression(
    tracked: TrackedPerson,
    frame: DetectionFrame,
    person: DetectedObject,
  ): DetectionResult | null {
    // TODO: Implement with pose estimation
    // Aggressive indicators:
    // 1. Raised arms
    // 2. Forward-leaning posture
    // 3. Rapid arm movements
    // 4. Proximity to another person with similar movements

    return null;
  }

  /**
   * Detect abnormal posture (person on ground)
   */
  private detectAbnormalPosture(
    tracked: TrackedPerson,
    frame: DetectionFrame,
    person: DetectedObject,
  ): DetectionResult | null {
    // TODO: Implement with pose estimation
    // Abnormal indicators:
    // 1. Horizontal body position for extended time
    // 2. No movement detected
    // 3. Unusual limb positions

    return null;
  }

  /**
   * Detect fighting between multiple people
   */
  private detectFighting(
    frame: DetectionFrame,
    persons: DetectedObject[],
  ): DetectionResult | null {
    // TODO: Implement fight detection
    // Indicators:
    // 1. Multiple people in close proximity
    // 2. Rapid movements by both
    // 3. Overlapping bounding boxes
    // 4. Aggressive poses

    return null;
  }

  /**
   * Detect crowd panic (stampede, mass movement)
   */
  private detectCrowdPanic(
    frame: DetectionFrame,
    persons: DetectedObject[],
  ): DetectionResult | null {
    // TODO: Implement crowd panic detection
    // Indicators:
    // 1. Many people moving in same direction rapidly
    // 2. High density + high speed
    // 3. Irregular crowd flow patterns

    return null;
  }

  /**
   * Calculate movement speed (pixels per second)
   */
  private calculateSpeed(
    positions: Array<{ x: number; y: number; timestamp: Date }>,
  ): number {
    if (positions.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      const dx = positions[i + 1]!.x - positions[i]!.x;
      const dy = positions[i + 1]!.y - positions[i]!.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }

    const timeDelta =
      (positions[positions.length - 1]!.timestamp.getTime() -
        positions[0]!.timestamp.getTime()) /
      1000; // seconds

    return timeDelta > 0 ? totalDistance / timeDelta : 0;
  }

  /**
   * Calculate angle between three points
   */
  private calculateAngle(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): number {
    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    let angleDiff = Math.abs(angle2 - angle1) * (180 / Math.PI);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    return angleDiff;
  }

  /**
   * Cleanup old tracks
   */
  private cleanupOldTracks(now: Date): void {
    for (const [trackId, tracked] of this.trackedPersons.entries()) {
      if (now.getTime() - tracked.lastSeen.getTime() > this.TRACKING_TIMEOUT_MS) {
        this.trackedPersons.delete(trackId);
      }
    }
  }

  async cleanup(): Promise<void> {
    this.poseModel = null;
    this.trackedPersons.clear();
    this.isInitialized = false;
  }

  getHealth() {
    return {
      status: this.isInitialized ? ("healthy" as const) : ("unhealthy" as const),
      details: this.isInitialized
        ? `Behavior detector operational (tracking ${this.trackedPersons.size} persons)`
        : "Behavior detector not initialized",
      metadata: {
        trackedPersons: this.trackedPersons.size,
        aggressionDetection: this.config.aggressionDetectionEnabled,
      },
    };
  }
}
