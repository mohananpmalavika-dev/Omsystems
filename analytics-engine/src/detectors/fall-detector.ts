/**
 * Fall Detection
 * Detects when a person falls down (for elderly care, hospitals, industrial safety)
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export interface FallEvent {
  personTrackId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  fallType: "forward" | "backward" | "sideways" | "unknown";
  impactEstimated: boolean;
  recoveryDetected: boolean;
  durationSeconds: number;
}

export class FallDetector extends BaseDetector {
  private isModelLoaded = false;
  private personStates = new Map<string, {
    aspectRatio: number; // width/height
    verticalPosition: number; // 0-1 from bottom
    velocityY: number; // vertical movement speed
    isUpright: boolean;
    lastUpdate: Date;
    fallStartTime?: Date;
  }>();

  private readonly FALL_ASPECT_RATIO_THRESHOLD = 1.2; // width > height
  private readonly VERTICAL_VELOCITY_THRESHOLD = 0.15; // Rapid downward movement
  private readonly RECOVERY_TIME_THRESHOLD_MS = 5000; // 5 seconds

  constructor() {
    super("fall", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing fall detector...");
    
    // TODO: Load pose estimation model or fall detection model
    // Options: OpenPose, MediaPipe Pose, specialized fall detection CNNs
    
    this.isModelLoaded = true;
    this.startStateCleanup();
    console.log("Fall detector initialized");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    const fallEvents = await this.detectFallsInFrame(frame);
    
    const results: DetectionResult[] = [];

    if (fallEvents.length > 0) {
      // Filter out recovered falls (unless duration > threshold)
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
    // TODO: Replace with actual pose estimation + fall classification
    /*
    Example implementation:
    
    1. Detect persons in frame
    2. Extract pose keypoints for each person
    3. Analyze pose to detect fall characteristics:
       - Horizontal orientation (lying down)
       - Rapid vertical movement
       - Transition from upright to horizontal
    
    const persons = await this.personDetector.detect(frame);
    const poses = await this.poseEstimator.estimatePoses(frame, persons);
    
    const fallEvents: FallEvent[] = [];
    
    for (const pose of poses) {
      const fallDetected = this.analyzePoseForFall(pose);
      if (fallDetected) {
        fallEvents.push(this.createFallEvent(pose, frame.timestamp));
      }
    }
    
    return fallEvents;
    */
    
    return [];
  }

  /**
   * Analyze person's bounding box for fall indicators
   */
  private analyzeBoundingBoxForFall(
    trackId: string,
    boundingBox: { x: number; y: number; width: number; height: number },
    timestamp: Date
  ): boolean {
    const aspectRatio = boundingBox.width / boundingBox.height;
    const verticalPosition = 1 - (boundingBox.y + boundingBox.height);

    const prevState = this.personStates.get(trackId);
    
    // Calculate vertical velocity if we have previous state
    let velocityY = 0;
    if (prevState) {
      const timeDiff = (timestamp.getTime() - prevState.lastUpdate.getTime()) / 1000;
      if (timeDiff > 0) {
        velocityY = (verticalPosition - prevState.verticalPosition) / timeDiff;
      }
    }

    // Update state
    const isUpright = aspectRatio < this.FALL_ASPECT_RATIO_THRESHOLD;
    this.personStates.set(trackId, {
      aspectRatio,
      verticalPosition,
      velocityY,
      isUpright,
      lastUpdate: timestamp,
      fallStartTime: !isUpright && (!prevState || prevState.isUpright) 
        ? timestamp 
        : prevState?.fallStartTime,
    });

    // Detect fall: rapid downward movement + horizontal orientation
    const isFalling = 
      velocityY < -this.VERTICAL_VELOCITY_THRESHOLD &&
      !isUpright;

    const isLyingDown = !isUpright && prevState && !prevState.isUpright;

    return isFalling || isLyingDown;
  }

  /**
   * Classify fall type based on pose
   */
  private classifyFallType(pose: any): FallEvent["fallType"] {
    // TODO: Implement based on pose keypoints
    // Analyze head, shoulders, hips positions to determine fall direction
    return "unknown";
  }

  /**
   * Check if person has recovered from fall
   */
  private checkRecovery(trackId: string, timestamp: Date): boolean {
    const state = this.personStates.get(trackId);
    if (!state || !state.fallStartTime) return false;

    const timeSinceFall = timestamp.getTime() - state.fallStartTime.getTime();
    
    return state.isUpright && timeSinceFall > this.RECOVERY_TIME_THRESHOLD_MS;
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
    }, 15000); // Every 15 seconds
  }

  private calculateAverageConfidence(falls: FallEvent[]): number {
    if (falls.length === 0) return 0;
    const sum = falls.reduce((acc, f) => acc + f.confidence, 0);
    return sum / falls.length;
  }

  async cleanup(): Promise<void> {
    this.isModelLoaded = false;
    this.personStates.clear();
    console.log("Fall detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("unhealthy" as const),
      details: `Tracking ${this.personStates.size} persons`,
    };
  }
}
