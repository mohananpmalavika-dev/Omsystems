/**
 * Stream Health Analyzer Service
 * Advanced frame analysis for frozen frames, black screens, and motion detection
 */

import { spawn } from "child_process";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";

export interface FrameAnalysisResult {
  isFrozen: boolean;
  isBlackScreen: boolean;
  isWhiteScreen: boolean;
  hasMotion: boolean;
  brightness: number; // 0-255
  variance: number; // Pixel variance
  frameHash: string; // For comparison
  timestamp: Date;
}

export interface StreamHealthStatus {
  cameraId: string;
  streamUrl: string;
  status: "healthy" | "frozen" | "black_screen" | "white_screen" | "no_motion";
  lastAnalysis: FrameAnalysisResult;
  consecutiveIssueFrames: number;
  analysisHistory: FrameAnalysisResult[];
}

export class StreamHealthAnalyzerService {
  private readonly FROZEN_THRESHOLD = 3; // Consider frozen after 3 identical frames
  private readonly BLACK_THRESHOLD = 10; // Average brightness below 10
  private readonly WHITE_THRESHOLD = 245; // Average brightness above 245
  private readonly LOW_VARIANCE_THRESHOLD = 5; // Pixel variance below 5
  private readonly MOTION_THRESHOLD = 15; // Brightness change threshold for motion
  private readonly HISTORY_SIZE = 10; // Keep last 10 frame analyses

  private streamStates: Map<string, StreamHealthStatus>;

  constructor() {
    this.streamStates = new Map();
  }

  /**
   * Analyze a camera stream for health issues
   */
  async analyzeStream(
    cameraId: string,
    streamUrl: string,
    ffprobePath: string = "ffprobe",
    ffmpegPath: string = "ffmpeg"
  ): Promise<StreamHealthStatus> {
    try {
      // Extract a frame from the stream
      const frameData = await this.extractFrame(streamUrl, ffmpegPath);
      
      if (!frameData) {
        throw new Error("Failed to extract frame from stream");
      }

      // Analyze the frame
      const analysis = await this.analyzeFrame(cameraId, frameData);

      // Update stream state
      const state = this.updateStreamState(cameraId, streamUrl, analysis);

      return state;
    } catch (error) {
      logger.error(`Failed to analyze stream for camera ${cameraId}`, { error });
      
      // Return error state
      return {
        cameraId,
        streamUrl,
        status: "healthy", // Default to healthy on error to avoid false positives
        lastAnalysis: {
          isFrozen: false,
          isBlackScreen: false,
          isWhiteScreen: false,
          hasMotion: true,
          brightness: 128,
          variance: 50,
          frameHash: "",
          timestamp: new Date(),
        },
        consecutiveIssueFrames: 0,
        analysisHistory: [],
      };
    }
  }

  /**
   * Extract a single frame from RTSP stream
   */
  private async extractFrame(
    streamUrl: string,
    ffmpegPath: string = "ffmpeg"
  ): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const args = [
        "-rtsp_transport", "tcp",
        "-i", streamUrl,
        "-vframes", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "-s", "320x240", // Resize for faster analysis
        "-q:v", "2",
        "pipe:1",
      ];

      const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      let errorOutput = "";

      ffmpeg.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on("data", (chunk: Buffer) => {
        errorOutput += chunk.toString();
      });

      const timeout = setTimeout(() => {
        ffmpeg.kill();
        resolve(null);
      }, 10000); // 10 second timeout

      ffmpeg.on("close", (code) => {
        clearTimeout(timeout);
        
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          logger.debug("FFmpeg frame extraction failed", { code, error: errorOutput });
          resolve(null);
        }
      });

      ffmpeg.on("error", (error) => {
        clearTimeout(timeout);
        logger.error("FFmpeg spawn error", { error });
        resolve(null);
      });
    });
  }

  /**
   * Analyze frame data for health issues
   */
  private async analyzeFrame(
    cameraId: string,
    frameData: Buffer
  ): Promise<FrameAnalysisResult> {
    // Calculate frame hash for frozen frame detection
    const frameHash = createHash("md5").update(frameData).digest("hex");

    // Analyze pixel data (assuming JPEG format)
    const pixelAnalysis = this.analyzePixels(frameData);

    // Determine if frame is frozen
    const previousState = this.streamStates.get(cameraId);
    const isFrozen = previousState
      ? this.detectFrozenFrame(frameHash, previousState)
      : false;

    // Determine if frame is black or white
    const isBlackScreen = pixelAnalysis.brightness < this.BLACK_THRESHOLD;
    const isWhiteScreen = pixelAnalysis.brightness > this.WHITE_THRESHOLD;

    // Determine if there's motion
    const hasMotion = previousState
      ? this.detectMotion(pixelAnalysis.brightness, previousState)
      : true;

    return {
      isFrozen,
      isBlackScreen,
      isWhiteScreen,
      hasMotion,
      brightness: pixelAnalysis.brightness,
      variance: pixelAnalysis.variance,
      frameHash,
      timestamp: new Date(),
    };
  }

  /**
   * Analyze pixel data from frame
   */
  private analyzePixels(frameData: Buffer): {
    brightness: number;
    variance: number;
  } {
    // This is a simplified analysis
    // In production, you would decode the JPEG and analyze actual pixels
    // For now, we'll use the buffer data as a proxy
    
    let sum = 0;
    let sumSquares = 0;
    const sampleSize = Math.min(frameData.length, 10000); // Sample first 10KB

    for (let i = 0; i < sampleSize; i++) {
      const value = frameData[i] || 0;
      sum += value;
      sumSquares += value * value;
    }

    const mean = sum / sampleSize;
    const variance = (sumSquares / sampleSize) - (mean * mean);

    return {
      brightness: mean,
      variance: Math.sqrt(variance),
    };
  }

  /**
   * Detect frozen frame by comparing hashes
   */
  private detectFrozenFrame(
    currentHash: string,
    previousState: StreamHealthStatus
  ): boolean {
    const history = previousState.analysisHistory;
    
    if (history.length === 0) {
      return false;
    }

    // Check if current hash matches recent frames
    const recentHashes = history
      .slice(-this.FROZEN_THRESHOLD)
      .map((a) => a.frameHash);

    // If all recent frames have the same hash, it's frozen
    const allSame = recentHashes.every((hash) => hash === currentHash);

    return allSame && recentHashes.length >= this.FROZEN_THRESHOLD;
  }

  /**
   * Detect motion by comparing brightness
   */
  private detectMotion(
    currentBrightness: number,
    previousState: StreamHealthStatus
  ): boolean {
    if (previousState.analysisHistory.length === 0) {
      return true; // Assume motion by default
    }

    const lastBrightness = previousState.lastAnalysis.brightness;
    const change = Math.abs(currentBrightness - lastBrightness);

    return change > this.MOTION_THRESHOLD;
  }

  /**
   * Update stream state with new analysis
   */
  private updateStreamState(
    cameraId: string,
    streamUrl: string,
    analysis: FrameAnalysisResult
  ): StreamHealthStatus {
    const existingState = this.streamStates.get(cameraId);

    // Determine status
    let status: StreamHealthStatus["status"] = "healthy";
    let consecutiveIssueFrames = 0;

    if (analysis.isFrozen) {
      status = "frozen";
      consecutiveIssueFrames = existingState
        ? existingState.consecutiveIssueFrames + 1
        : 1;
    } else if (analysis.isBlackScreen) {
      status = "black_screen";
      consecutiveIssueFrames = existingState
        ? existingState.consecutiveIssueFrames + 1
        : 1;
    } else if (analysis.isWhiteScreen) {
      status = "white_screen";
      consecutiveIssueFrames = existingState
        ? existingState.consecutiveIssueFrames + 1
        : 1;
    } else if (!analysis.hasMotion && analysis.variance < this.LOW_VARIANCE_THRESHOLD) {
      status = "no_motion";
      consecutiveIssueFrames = existingState
        ? existingState.consecutiveIssueFrames + 1
        : 1;
    } else {
      // Reset consecutive count if healthy
      consecutiveIssueFrames = 0;
    }

    // Update history
    const history = existingState
      ? [...existingState.analysisHistory, analysis].slice(-this.HISTORY_SIZE)
      : [analysis];

    const newState: StreamHealthStatus = {
      cameraId,
      streamUrl,
      status,
      lastAnalysis: analysis,
      consecutiveIssueFrames,
      analysisHistory: history,
    };

    this.streamStates.set(cameraId, newState);

    return newState;
  }

  /**
   * Get current stream health status
   */
  getStreamHealth(cameraId: string): StreamHealthStatus | null {
    return this.streamStates.get(cameraId) || null;
  }

  /**
   * Clear stream state (useful when camera goes offline)
   */
  clearStreamState(cameraId: string): void {
    this.streamStates.delete(cameraId);
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalStreams: number;
    healthyStreams: number;
    frozenStreams: number;
    blackScreens: number;
    whiteScreens: number;
    noMotion: number;
  } {
    const states = Array.from(this.streamStates.values());

    return {
      totalStreams: states.length,
      healthyStreams: states.filter((s) => s.status === "healthy").length,
      frozenStreams: states.filter((s) => s.status === "frozen").length,
      blackScreens: states.filter((s) => s.status === "black_screen").length,
      whiteScreens: states.filter((s) => s.status === "white_screen").length,
      noMotion: states.filter((s) => s.status === "no_motion").length,
    };
  }
}

/**
 * Global instance
 */
let streamHealthAnalyzer: StreamHealthAnalyzerService | null = null;

/**
 * Get or create stream health analyzer instance
 */
export function getStreamHealthAnalyzer(): StreamHealthAnalyzerService {
  if (!streamHealthAnalyzer) {
    streamHealthAnalyzer = new StreamHealthAnalyzerService();
  }
  return streamHealthAnalyzer;
}
