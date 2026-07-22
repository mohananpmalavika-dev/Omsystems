/**
 * Stream Processor
 * Consumes video streams and processes frames through analytics pipeline
 */

import { randomUUID } from "node:crypto";
import type { DetectionFrame } from "./detectors/base-detector.js";
import type { AnalyticsPipeline, AnalyticsRule } from "./analytics-pipeline.js";

export interface StreamSource {
  cameraId: string;
  tenantId: string;
  streamUrl: string;
  enabled: boolean;
  frameRate?: number; // Frames per second to process
}

export interface ProcessingStats {
  cameraId: string;
  framesProcessed: number;
  eventsGenerated: number;
  lastFrameAt?: string;
  averageProcessingTime?: number;
  errors: number;
}

export class StreamProcessor {
  private activeStreams = new Map<string, StreamProcessingContext>();
  private stats = new Map<string, ProcessingStats>();

  constructor(
    private readonly pipeline: AnalyticsPipeline,
    private readonly submitEvent: (event: any) => Promise<unknown>,
  ) {}

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
      processingTimes: [],
    };

    this.activeStreams.set(source.cameraId, context);
    this.stats.set(source.cameraId, {
      cameraId: source.cameraId,
      framesProcessed: 0,
      eventsGenerated: 0,
      errors: 0,
    });

    console.log(`Started stream processing for camera ${source.cameraId}`);

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
    const frameInterval = 1000 / (context.source.frameRate ?? 1); // Default 1 FPS

    while (context.isActive) {
      try {
        const startTime = Date.now();

        // Fetch frame from stream
        const frame = await this.fetchFrame(context.source);
        if (!frame) {
          // No frame available, wait and retry
          await new Promise((resolve) => setTimeout(resolve, frameInterval));
          continue;
        }

        // Process frame through analytics pipeline
        const events = await this.pipeline.processFrame(frame, context.rules);

        // Submit events to control plane
        for (const event of events) {
          try {
            await this.submitEvent(event);
            context.generatedEvents++;
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
          stats.averageProcessingTime =
            context.processingTimes.reduce((a, b) => a + b, 0) /
            context.processingTimes.length;
        }

        // Wait for next frame interval
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, frameInterval - elapsed);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } catch (error) {
        console.error(
          `Error processing stream for camera ${context.source.cameraId}:`,
          error,
        );
        context.errors++;

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Fetch a frame from the stream
   * TODO: Implement actual RTSP/HLS/WebRTC frame extraction
   */
  private async fetchFrame(
    source: StreamSource,
  ): Promise<DetectionFrame | null> {
    try {
      // TODO: Replace with actual stream frame extraction
      // Options:
      // 1. FFmpeg to extract frames from RTSP
      // 2. Node-canvas for frame processing
      // 3. Sharp for image manipulation
      // 4. WebRTC for real-time streaming

      // PLACEHOLDER: Simulate frame extraction
      // In production, this would connect to the stream URL and extract frames
      
      // For now, return null to prevent actual processing
      // Remove this return when implementing real stream processing
      return null;

      // Example implementation would look like:
      // const frameBuffer = await extractFrameFromRTSP(source.streamUrl);
      // const { width, height } = await getFrameDimensions(frameBuffer);
      //
      // return {
      //   cameraId: source.cameraId,
      //   tenantId: source.tenantId,
      //   timestamp: new Date(),
      //   imageData: frameBuffer,
      //   width,
      //   height,
      //   metadata: {},
      // };
    } catch (error) {
      console.error(`Failed to fetch frame from ${source.streamUrl}:`, error);
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
  processingTimes: number[];
}
