/**
 * Human Analytics Pipeline
 * Orchestrates person detection, tracking, behavior analysis, and journey reconstruction
 */

import type { DetectionFrame } from "../../detectors/base-detector.js";
import { getCapabilityRegistry, type AnalyticsCapability } from "../capability-status.js";
import { TrackerAdapter } from "../tracking/tracker-adapter.js";
import { FightDetector } from "../behavior/fight-detector.js";
import { PanicDetector } from "../behavior/panic-detector.js";
import { LineCrossingEngine } from "../counting/line-crossing-engine.js";
import { OccupancyLedger } from "../counting/occupancy-ledger.js";
import { JourneyMatcher } from "../journeys/journey-matcher.js";
import type {
  PersonTrack,
  CountingGate,
  CameraTransition,
  BehaviorEvent,
  CrossingEvent,
  FightEvidence,
} from "../types.js";

export interface HumanAnalyticsPipelineConfig {
  tenantId: string;
  cameraId: string;
  siteId: string;
  zoneId?: string;
  gates?: CountingGate[];
  transitions?: CameraTransition[];
}

export interface PipelineResult {
  timestamp: Date;
  tracks: PersonTrack[];
  behaviorEvents: BehaviorEvent[];
  crossingEvents: CrossingEvent[];
  fightEvidence: FightEvidence[];
  occupancy?: {
    count: number;
    confidence: number;
  };
  capabilities: AnalyticsCapability[];
}

/**
 * Main orchestrator for human analytics pipeline
 */
export class HumanAnalyticsPipeline {
  private tracker: TrackerAdapter;
  private fightDetector: FightDetector;
  private panicDetector: PanicDetector;
  private crossingEngine: LineCrossingEngine | null = null;
  private occupancyLedger: OccupancyLedger | null = null;
  private journeyMatcher: JourneyMatcher;

  private frameCount = 0;
  private lastPoseFrame = 0;
  private lastCleanup = Date.now();

  private readonly POSE_SAMPLE_RATE = 3; // Every 3 frames
  private readonly CLEANUP_INTERVAL_MS = 10000; // 10 seconds

  constructor(private readonly config: HumanAnalyticsPipelineConfig) {
    const registry = getCapabilityRegistry();

    // Initialize tracker
    this.tracker = new TrackerAdapter(config.cameraId, config.tenantId);
    registry.updateCapability({
      name: "tracking",
      status: "ready",
      updatedAt: new Date(),
    });

    // Initialize fight detector
    this.fightDetector = new FightDetector(config.tenantId, config.cameraId);

    // Initialize panic detector
    this.panicDetector = new PanicDetector(
      config.tenantId,
      config.cameraId,
      config.zoneId,
    );

    // Initialize counting if gates provided
    if (config.gates && config.gates.length > 0) {
      this.crossingEngine = new LineCrossingEngine(
        config.tenantId,
        config.cameraId,
        config.gates,
      );
      this.occupancyLedger = new OccupancyLedger(config.siteId);

      registry.updateCapability({
        name: "entry_exit",
        status: "ready",
        updatedAt: new Date(),
      });
    }

    // Initialize journey matcher
    this.journeyMatcher = new JourneyMatcher(config.tenantId);
    if (config.transitions) {
      for (const transition of config.transitions) {
        this.journeyMatcher.addTransition(transition);
      }
    }
  }

  /**
   * Process a frame through the analytics pipeline
   */
  async processFrame(frame: DetectionFrame): Promise<PipelineResult> {
    this.frameCount++;
    const timestamp = frame.timestamp;
    const registry = getCapabilityRegistry();

    // Step 1: Detect persons (via unified inference pipeline)
    const detections = await this.detectPersons(frame);

    // Step 2: Update tracking
    const observations = this.tracker.updateTracking(
      detections,
      timestamp,
      frame.metadata?.frameId as string || `frame_${this.frameCount}`,
    );

    const activeTracks = this.tracker.getActiveTracks();

    // Step 3: Sample pose estimation (not every frame)
    if (this.shouldSamplePose()) {
      await this.samplePoseEstimation(activeTracks, frame);
    }

    // Step 4: Analyze behaviors
    const behaviorEvents: BehaviorEvent[] = [];

    // Fight detection
    const fightEvidence = await this.fightDetector.detectFighting(
      activeTracks,
      timestamp,
      frame.metadata?.frameId as string || `frame_${this.frameCount}`,
    );

    // Convert fight evidence to behavior events
    for (const evidence of fightEvidence) {
      behaviorEvents.push({
        id: evidence.id,
        tenantId: evidence.tenantId,
        cameraId: evidence.cameraId,
        type: evidence.status === "confirmed" ? "fight_confirmed" : "fight_suspected",
        startedAt: evidence.startedAt,
        endedAt: evidence.endedAt,
        confidence: evidence.finalConfidence,
        severity:
          evidence.finalConfidence >= 0.9
            ? "critical"
            : evidence.finalConfidence >= 0.8
              ? "high"
              : "medium",
        trackIds: evidence.participantTrackIds,
        evidence: {
          frameIds: evidence.evidenceFrameIds,
          clipId: evidence.evidenceClipId,
          featureSummary: {
            candidateScore: evidence.candidateScore,
            classifierScore: evidence.classifierScore || 0,
          },
        },
        provenance: {
          detectorVersion: evidence.modelVersion,
          modelVersions: {},
          configurationVersion: "1.0",
        },
        review: {
          status: "unreviewed",
        },
      });
    }

    // Panic detection
    const panicEvent = this.panicDetector.analyzeCrowd(activeTracks, timestamp);
    if (panicEvent) {
      behaviorEvents.push(panicEvent);
    }

    // Step 5: Line crossing and occupancy
    let crossingEvents: CrossingEvent[] = [];
    let occupancy: { count: number; confidence: number } | undefined;

    if (this.crossingEngine && this.occupancyLedger) {
      crossingEvents = this.crossingEngine.updateCrossings(activeTracks, timestamp);

      // Update occupancy ledger
      for (const crossing of crossingEvents) {
        this.occupancyLedger.processCrossingEvent(
          crossing,
          this.config.zoneId || "default",
        );
      }

      // Get occupancy state
      const state = this.occupancyLedger.getOccupancyState(
        this.config.zoneId || "default",
        this.config.gates?.length || 0,
        this.config.gates?.length || 0,
      );

      occupancy = {
        count: state.occupancy,
        confidence: state.confidence,
      };
    }

    // Step 6: Periodic cleanup
    if (Date.now() - this.lastCleanup > this.CLEANUP_INTERVAL_MS) {
      this.performCleanup(timestamp);
    }

    // Get current capabilities
    const capabilities = registry.getAllCapabilities();

    return {
      timestamp,
      tracks: activeTracks,
      behaviorEvents,
      crossingEvents,
      fightEvidence,
      occupancy,
      capabilities,
    };
  }

  /**
   * Detect persons in frame
   */
  private async detectPersons(
    frame: DetectionFrame,
  ): Promise<Array<{ boundingBox: any; confidence: number; trackId?: string }>> {
    try {
      const { getInferencePipeline } = await import(
        "../../inference/unified-inference-pipeline.js"
      );
      const pipeline = getInferencePipeline();

      const detections = await pipeline.detectObjects(frame, ["person"]);
      return detections.map((d) => ({
        boundingBox: d.boundingBox,
        confidence: d.confidence,
        trackId: d.trackId,
      }));
    } catch (error) {
      console.warn("Person detection failed:", error);
      return [];
    }
  }

  /**
   * Check if should sample pose this frame
   */
  private shouldSamplePose(): boolean {
    if (this.frameCount - this.lastPoseFrame >= this.POSE_SAMPLE_RATE) {
      this.lastPoseFrame = this.frameCount;
      return true;
    }
    return false;
  }

  /**
   * Sample pose estimation
   */
  private async samplePoseEstimation(
    tracks: PersonTrack[],
    frame: DetectionFrame,
  ): Promise<void> {
    try {
      const { getInferencePipeline } = await import(
        "../../inference/unified-inference-pipeline.js"
      );
      const pipeline = getInferencePipeline();

      for (const track of tracks) {
        if (track.status !== "confirmed") continue;

        const lastObs = track.observations[track.observations.length - 1];
        if (!lastObs) continue;

        try {
          const pose = await pipeline.estimatePose(frame, lastObs.boundingBox);
          if (pose) {
            lastObs.keypoints = pose;
            lastObs.poseConfidence = 0.8; // Placeholder
          }
        } catch (error) {
          // Skip if pose estimation fails for this track
        }
      }
    } catch (error) {
      console.warn("Pose estimation sampling failed:", error);
    }
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(timestamp: Date): void {
    this.lastCleanup = Date.now();

    // Cleanup old tracks
    const cleanedTracks = this.tracker.cleanupOldTracks(timestamp);

    // Cleanup old crossing events
    if (this.crossingEngine) {
      const oneHourAgo = new Date(timestamp.getTime() - 3600000);
      this.crossingEngine.clearOldEvents(oneHourAgo);
    }

    // Cleanup old ledger entries
    if (this.occupancyLedger) {
      const oneDayAgo = new Date(timestamp.getTime() - 86400000);
      this.occupancyLedger.clearOldEntries(oneDayAgo);
    }

    if (cleanedTracks > 0) {
      console.log(`Cleaned up ${cleanedTracks} stale tracks`);
    }
  }

  /**
   * Get pipeline statistics
   */
  getStatistics(): {
    frameCount: number;
    tracking: ReturnType<TrackerAdapter["getStats"]>;
    crossings?: ReturnType<LineCrossingEngine["getStatistics"]>;
    occupancy?: ReturnType<OccupancyLedger["getStatistics"]>;
    fights: {
      candidates: number;
      confirmed: number;
    };
  } {
    const stats: any = {
      frameCount: this.frameCount,
      tracking: this.tracker.getStats(),
      fights: {
        candidates: this.fightDetector.getActiveCandidates().length,
        confirmed: this.fightDetector.getConfirmedEvents().length,
      },
    };

    if (this.crossingEngine) {
      stats.crossings = this.crossingEngine.getStatistics();
    }

    if (this.occupancyLedger) {
      stats.occupancy = this.occupancyLedger.getStatistics(
        this.config.zoneId || "default",
      );
    }

    return stats;
  }

  /**
   * Get active tracks
   */
  getActiveTracks(): PersonTrack[] {
    return this.tracker.getActiveTracks();
  }

  /**
   * Get journey matcher for cross-camera reconstruction
   */
  getJourneyMatcher(): JourneyMatcher {
    return this.journeyMatcher;
  }

  /**
   * Get baselines for panic detection
   */
  getPanicBaselines() {
    return this.panicDetector.getBaselines();
  }
}
