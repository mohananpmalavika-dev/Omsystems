/**
 * Stream Processor
 * Consumes video streams and processes frames through analytics pipeline
 */

import { randomUUID } from "node:crypto";
import type { DetectionFrame } from "./detectors/base-detector.js";
import type { AnalyticsPipeline, AnalyticsRule } from "./analytics-pipeline.js";
import type { IncidentIntegrationHook } from './incident-integration.js';
import { FfmpegFrameExtractor, type FrameExtractor } from "./frame-extractor.js";

export interface StreamSource {
  cameraId: string;
  tenantId: string;
  branchId?: string;
  streamUrl: string;
  substreamUrl?: string; // High-efficiency low-bitrate substream for AI analytics over VPN
  enabled: boolean;
  frameRate?: number; // Frames per second to process (default 2-3 FPS for high-scale enterprise)
  dvrBrand?: string;
}

export interface ProcessingStats {
  cameraId: string;
  framesProcessed: number;
  eventsGenerated: number;
  lastFrameAt?: string;
  averageProcessingTime?: number;
  errors: number;
  activeStreamType: "substream" | "mainstream";
}

export class StreamProcessor {
  private activeStreams = new Map<string, StreamProcessingContext>();
  private stats = new Map<string, ProcessingStats>();

  private readonly incidentHook?: IncidentIntegrationHook;

  constructor(
    private readonly pipeline: AnalyticsPipeline,
    private readonly submitEvent: (event: any) => Promise<unknown>,
    private readonly frameExtractor: FrameExtractor = new FfmpegFrameExtractor(),
    incidentHook?: IncidentIntegrationHook,
  ) {
    this.incidentHook = incidentHook;
  }

  /**
   * Start processing a camera stream
   */
  async startStream(
    source: StreamSource,
    rules: AnalyticsRule[],
  ): Promise<void> {
    if (this.activeStreams.has(source.cameraId)) {
      throw new Error(`Stream already active for camera ${source.cameraId}`);
    }

    const context: StreamProcessingContext = {
      source,
      rules,
      isActive: true,
      processedFrames: 0,
      generatedEvents: 0,
      errors: 0,
      consecutiveFailures: 0,
      processingTimes: [],
      usingSubstream: Boolean(source.substreamUrl),
    };

    this.activeStreams.set(source.cameraId, context);
    this.stats.set(source.cameraId, {
      cameraId: source.cameraId,
      framesProcessed: 0,
      eventsGenerated: 0,
      errors: 0,
      activeStreamType: context.usingSubstream ? "substream" : "mainstream",
    });

    console.log(`Started high-efficiency stream processing for camera ${source.cameraId} (Type: ${context.usingSubstream ? "substream" : "mainstream"})`);

    // Start frame processing loop
    void this.processStreamLoop(context);
  }

  /**
   * Stop processing a camera stream
   */
  async stopStream(cameraId: string): Promise<void> {
    const context = this.activeStreams.get(cameraId);
    if (!context) {
      throw new Error(`No active stream for camera ${cameraId}`);
    }

    context.isActive = false;
    this.activeStreams.delete(cameraId);

    console.log(`Stopped stream processing for camera ${cameraId}`);
  }

  /**
   * Update rules for an active stream
   */
  async updateStreamRules(
    cameraId: string,
    rules: AnalyticsRule[],
  ): Promise<void> {
    const context = this.activeStreams.get(cameraId);
    if (!context) {
      throw new Error(`No active stream for camera ${cameraId}`);
    }

    context.rules = rules;
    console.log(`Updated rules for camera ${cameraId}`);
  }

  /**
   * Main processing loop for a stream
   */
  private async processStreamLoop(
    context: StreamProcessingContext,
  ): Promise<void> {
    // Default 3 FPS for high-scale enterprise CCTV analytics
    const targetFps = Math.max(0.5, Math.min(10, context.source.frameRate ?? 3));
    const frameInterval = 1000 / targetFps;

    while (context.isActive) {
      try {
        const startTime = Date.now();

        // Fetch frame from stream (with automatic substream -> mainstream fallback)
        const frame = await this.fetchFrame(context);
        if (!frame) {
          context.consecutiveFailures++;
          const backoff = Math.min(5000, 500 * Math.pow(1.5, Math.min(context.consecutiveFailures, 6)));
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        context.consecutiveFailures = 0;

        // Process frame through analytics pipeline
        const events = await this.pipeline.processFrame(frame, context.rules);

        // Submit events to control plane
        for (const event of events) {
          try {
            await this.submitEvent(event);
            context.generatedEvents++;

            // Forward to incident integration hook if configured
            if (this.incidentHook) {
              try {
                const detectionSummary = {
                  detectionType: event.detectionType,
                  metadata: event.metadata ?? {},
                  objects: event.objects ?? [],
                  frame,
                };
                await this.incidentHook.onDetection(detectionSummary as any);
              } catch (hookErr) {
                console.error('incident integration hook failed', hookErr);
              }
            }

          } catch (error) {
            console.error(
              `Failed to submit event for camera ${context.source.cameraId}:`,
              error,
            );
            context.errors++;
          }
        }

        context.processedFrames++;

        // Update stats
        const processingTime = Date.now() - startTime;
        context.processingTimes.push(processingTime);
        if (context.processingTimes.length > 100) {
          context.processingTimes.shift();
        }

        const stats = this.stats.get(context.source.cameraId);
        if (stats) {
          stats.framesProcessed = context.processedFrames;
          stats.eventsGenerated = context.generatedEvents;
          stats.lastFrameAt = new Date().toISOString();
          stats.errors = context.errors;
          stats.activeStreamType = context.usingSubstream ? "substream" : "mainstream";
          stats.averageProcessingTime =
            context.processingTimes.reduce((a, b) => a + b, 0) /
            context.processingTimes.length;
        }

        // Wait for next frame interval
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(10, frameInterval - elapsed);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } catch (error) {
        console.error(
          `Error processing stream for camera ${context.source.cameraId}:`,
          error,
        );
        context.errors++;

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  /** Fetch one normalized RGB frame through the configured extractor with fallback. */
  private async fetchFrame(
    context: StreamProcessingContext,
  ): Promise<DetectionFrame | null> {
    const streamToTry = context.usingSubstream && context.source.substreamUrl 
      ? context.source.substreamUrl 
      : context.source.streamUrl;

    try {
      return await this.frameExtractor.extract({
        cameraId: context.source.cameraId,
        tenantId: context.source.tenantId,
        streamUrl: streamToTry,
      });
    } catch (error) {
      // If substream failed and we have mainstream, try fallback
      if (context.usingSubstream && context.source.streamUrl && context.source.streamUrl !== streamToTry) {
        try {
          const frame = await this.frameExtractor.extract({
            cameraId: context.source.cameraId,
            tenantId: context.source.tenantId,
            streamUrl: context.source.streamUrl,
          });
          context.usingSubstream = false;
          return frame;
        } catch {
          // Both failed
        }
      }
      return null;
    }
  }

  /**
   * Get processing stats for all streams
   */
  getStats(): ProcessingStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get processing stats for a specific camera
   */
  getCameraStats(cameraId: string): ProcessingStats | undefined {
    return this.stats.get(cameraId);
  }

  /**
   * Get list of active streams
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Check if a stream is active
   */
  isStreamActive(cameraId: string): boolean {
    return this.activeStreams.has(cameraId);
  }

  /**
   * Stop all streams
   */
  async stopAllStreams(): Promise<void> {
    const cameraIds = Array.from(this.activeStreams.keys());
    for (const cameraId of cameraIds) {
      await this.stopStream(cameraId);
    }
  }
}

interface StreamProcessingContext {
  source: StreamSource;
  rules: AnalyticsRule[];
  isActive: boolean;
  processedFrames: number;
  generatedEvents: number;
  errors: number;
  consecutiveFailures: number;
  usingSubstream: boolean;
  processingTimes: number[];
}
