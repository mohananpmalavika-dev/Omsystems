/**
 * Fall Detection
 * Detects when a person falls down (for elderly care, hospitals, industrial safety)
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, getInferenceObjects } from "./base-detector.js";

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
    
    // The temporal fallback below consumes tracked person boxes, but it is not
    // a replacement for a pose/fall model and must be reported as degraded.
    this.isModelLoaded = false;
    this.startStateCleanup();
    console.log("Fall detector initialized");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
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
    const persons = getInferenceObjects(frame, ["person"])
      .filter((person) => person.confidence >= 0.5);
    const events: FallEvent[] = [];
    for (const person of persons) {
      // Tracking IDs are inserted by AnalyticsPipeline before this detector.
      // The fallback key preserves temporal behavior for direct integrations.
      const trackId = person.trackId ?? `box:${person.boundingBox.x.toFixed(2)}:${person.boundingBox.y.toFixed(2)}`;
      if (!this.analyzeBoundingBoxForFall(trackId, person.boundingBox, frame.timestamp)) continue;
      const state = this.personStates.get(trackId)!;
      events.push({
        personTrackId: trackId,
        boundingBox: person.boundingBox,
        confidence: person.confidence,
        fallType: "unknown",
        impactEstimated: Math.abs(state.velocityY) >= this.VERTICAL_VELOCITY_THRESHOLD,
        recoveryDetected: this.checkRecovery(trackId, frame.timestamp),
        durationSeconds: state.fallStartTime
          ? Math.max(0, (frame.timestamp.getTime() - state.fallStartTime.getTime()) / 1000)
          : 0,
      });
    }
    return events;
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
      status: this.isModelLoaded ? ("healthy" as const) : ("degraded" as const),
      details: this.isModelLoaded
        ? `Pose-model fall inference active; tracking ${this.personStates.size} persons`
        : `Tracked-box temporal fallback only; tracking ${this.personStates.size} persons. Provision a pose/fall model for production alerts.`,
    };
  }
}
