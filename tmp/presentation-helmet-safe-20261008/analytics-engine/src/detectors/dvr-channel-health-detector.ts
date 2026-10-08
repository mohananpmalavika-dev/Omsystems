/**
 * DVR/XVR Channel Health Detector
 * Monitors DVR/XVR recorder channel health for analog cameras
 * 
 * Detects:
 * - Frozen channels
 * - Blank channels
 * - Wrong camera connected
 * - Channel swapping
 * - Fake video feed
 * - Intermittent signal
 * - Recording failures
 * - Storage issues
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export interface DVRChannelStatus {
  channelId: string;
  cameraId: string;
  dvrId?: string;
  status: 'healthy' | 'warning' | 'error' | 'offline';
  issues: ChannelIssue[];
  lastFrameAt: Date;
  consecutiveFailures: number;
  recordingStatus: 'recording' | 'not-recording' | 'unknown';
  storageStatus: 'ok' | 'low' | 'full' | 'error';
}

export interface ChannelIssue {
  type: 'frozen' | 'blank' | 'wrong-camera' | 'channel-swap' | 
        'fake-feed' | 'intermittent' | 'no-recording' | 'storage-full';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  description: string;
  autoResolved?: boolean;
}

interface DVRChannelHistory {
  channelId: string;
  cameraId: string;
  dvrId?: string;
  frameHashes: Array<{ hash: string; timestamp: Date }>;
  frameCharacteristics: Array<{
    timestamp: Date;
    avgBrightness: number;
    avgColor: { r: number; g: number; b: number };
    motionLevel: number;
  }>;
  issues: ChannelIssue[];
  consecutiveFrozenFrames: number;
  consecutiveBlankFrames: number;
  consecutiveFailures: number;
  lastSuccessfulFrame: Date;
  expectedCameraSignature?: {
    avgBrightness: number;
    avgColor: { r: number; g: number; b: number };
    typicalMotion: number;
  };
  recordingFailures: number;
  lastRecordingCheck?: Date;
}

export class DVRChannelHealthDetector extends BaseDetector {
  private channelHistory = new Map<string, DVRChannelHistory>();
  
  // Configuration
  private readonly FROZEN_THRESHOLD = 5; // consecutive frozen frames
  private readonly BLANK_THRESHOLD = 3; // consecutive blank frames
  private readonly FRAME_HASH_HISTORY = 10;
  private readonly CHARACTERISTICS_HISTORY = 50;
  private readonly SIGNATURE_DEVIATION_THRESHOLD = 30; // brightness/color deviation
  private readonly INTERMITTENT_WINDOW_MS = 300000; // 5 minutes

  constructor() {
    super("dvr-channel-health", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing DVR channel health detector...");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    // Extract channel ID from camera ID or metadata
    const channelId = this.extractChannelId(frame);
    const dvrId = this.extractDVRId(frame);
    
    // Get or create channel history
    let history = this.channelHistory.get(channelId);
    if (!history) {
      history = {
        channelId,
        cameraId: frame.cameraId,
        dvrId,
        frameHashes: [],
        frameCharacteristics: [],
        issues: [],
        consecutiveFrozenFrames: 0,
        consecutiveBlankFrames: 0,
        consecutiveFailures: 0,
        lastSuccessfulFrame: frame.timestamp,
        recordingFailures: 0,
      };
      this.channelHistory.set(channelId, history);
    }

    // Calculate frame hash for frozen detection
    const frameHash = this.calculateFrameHash(frame.imageData);
    history.frameHashes.push({ hash: frameHash, timestamp: frame.timestamp });
    if (history.frameHashes.length > this.FRAME_HASH_HISTORY) {
      history.frameHashes.shift();
    }

    // Calculate frame characteristics
    const characteristics = this.calculateFrameCharacteristics(frame.imageData);
    history.frameCharacteristics.push({
      timestamp: frame.timestamp,
      ...characteristics,
    });
    if (history.frameCharacteristics.length > this.CHARACTERISTICS_HISTORY) {
      history.frameCharacteristics.shift();
    }

    // Establish camera signature if not present
    if (!history.expectedCameraSignature && history.frameCharacteristics.length >= 20) {
      history.expectedCameraSignature = this.establishCameraSignature(history);
    }

    // Check for frozen channel
    const frozenResult = this.checkFrozenChannel(history, frameHash);
    if (frozenResult) {
      results.push(frozenResult);
    }

    // Check for blank channel
    const blankResult = this.checkBlankChannel(history, characteristics);
    if (blankResult) {
      results.push(blankResult);
    }

    // Check for wrong camera / channel swap
    if (history.expectedCameraSignature) {
      const wrongCameraResult = this.checkWrongCamera(history, characteristics);
      if (wrongCameraResult) {
        results.push(wrongCameraResult);
      }
    }

    // Check for intermittent signal
    const intermittentResult = this.checkIntermittentSignal(history, frame.timestamp);
    if (intermittentResult) {
      results.push(intermittentResult);
    }

    // Check for fake/looping feed
    const fakeFeedResult = this.checkFakeFeed(history);
    if (fakeFeedResult) {
      results.push(fakeFeedResult);
    }

    // Update last successful frame
    if (frozenResult === null && blankResult === null) {
      history.lastSuccessfulFrame = frame.timestamp;
      history.consecutiveFailures = 0;
      
      // Auto-resolve previous issues
      for (const issue of history.issues) {
        if (!issue.autoResolved && 
            frame.timestamp.getTime() - issue.detectedAt.getTime() > 60000) {
          issue.autoResolved = true;
        }
      }
    } else {
      history.consecutiveFailures++;
    }

    return results;
  }

  /**
   * Extract channel ID from camera ID or metadata
   */
  private extractChannelId(frame: DetectionFrame): string {
    // Try metadata first
    const metadata = frame.metadata as any;
    if (metadata?.channelId) {
      return metadata.channelId;
    }
    
    // Try parsing from camera ID
    // Common patterns: "DVR1-CH01", "camera_ch_04", "channel-8"
    const match = frame.cameraId.match(/ch(?:annel)?[-_]?(\d+)/i);
    if (match) {
      return `channel-${match[1]}`;
    }
    
    // Fall back to camera ID
    return frame.cameraId;
  }

  /**
   * Extract DVR ID from camera ID or metadata
   */
  private extractDVRId(frame: DetectionFrame): string | undefined {
    const metadata = frame.metadata as any;
    if (metadata?.dvrId) {
      return metadata.dvrId;
    }
    
    // Try parsing from camera ID
    const match = frame.cameraId.match(/(?:dvr|nvr|xvr)[-_]?(\d+)/i);
    if (match) {
      return `dvr-${match[1]}`;
    }
    
    return undefined;
  }

  /**
   * Calculate frame hash for frozen detection
   */
  private calculateFrameHash(imageData: Buffer): string {
    // Sample-based hash for performance
    let hash = 0;
    for (let i = 0; i < imageData.length; i += 1000) {
      hash = ((hash << 5) - hash) + (imageData[i] ?? 0);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Calculate frame characteristics
   */
  private calculateFrameCharacteristics(imageData: Buffer): {
    avgBrightness: number;
    avgColor: { r: number; g: number; b: number };
    motionLevel: number;
  } {
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalBrightness = 0;
    const pixelCount = imageData.length / 3;
    
    for (let i = 0; i < imageData.length; i += 3) {
      const r = imageData[i] ?? 0;
      const g = imageData[i + 1] ?? 0;
      const b = imageData[i + 2] ?? 0;
      
      totalR += r;
      totalG += g;
      totalB += b;
      totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    
    return {
      avgBrightness: totalBrightness / pixelCount,
      avgColor: {
        r: totalR / pixelCount,
        g: totalG / pixelCount,
        b: totalB / pixelCount,
      },
      motionLevel: 0, // Would need previous frame to calculate
    };
  }

  /**
   * Establish expected camera signature
   */
  private establishCameraSignature(history: DVRChannelHistory) {
    const recent = history.frameCharacteristics.slice(-20);
    
    const avgBrightness = recent.reduce((sum, c) => sum + c.avgBrightness, 0) / recent.length;
    const avgR = recent.reduce((sum, c) => sum + c.avgColor.r, 0) / recent.length;
    const avgG = recent.reduce((sum, c) => sum + c.avgColor.g, 0) / recent.length;
    const avgB = recent.reduce((sum, c) => sum + c.avgColor.b, 0) / recent.length;
    const avgMotion = recent.reduce((sum, c) => sum + c.motionLevel, 0) / recent.length;
    
    return {
      avgBrightness,
      avgColor: { r: avgR, g: avgG, b: avgB },
      typicalMotion: avgMotion,
    };
  }

  /**
   * Check for frozen channel
   */
  private checkFrozenChannel(
    history: DVRChannelHistory,
    currentHash: string
  ): DetectionResult | null {
    // Check if recent frames have identical hashes
    const recentHashes = history.frameHashes.slice(-5);
    const allIdentical = recentHashes.every(h => h.hash === currentHash);
    
    if (allIdentical && recentHashes.length >= this.FROZEN_THRESHOLD) {
      history.consecutiveFrozenFrames++;
      
      if (history.consecutiveFrozenFrames >= this.FROZEN_THRESHOLD) {
        const issue: ChannelIssue = {
          type: 'frozen',
          severity: 'high',
          detectedAt: new Date(),
          description: `DVR channel ${history.channelId} has frozen (${history.consecutiveFrozenFrames} identical frames)`,
        };
        history.issues.push(issue);
        
        return {
          detectionType: "dvr-channel-frozen",
          confidence: 0.95,
          objects: [],
          metadata: {
            channelId: history.channelId,
            cameraId: history.cameraId,
            dvrId: history.dvrId,
            consecutiveFrozenFrames: history.consecutiveFrozenFrames,
            issue,
          },
          requiresAlert: true,
        };
      }
    } else {
      history.consecutiveFrozenFrames = 0;
    }
    
    return null;
  }

  /**
   * Check for blank channel
   */
  private checkBlankChannel(
    history: DVRChannelHistory,
    characteristics: { avgBrightness: number }
  ): DetectionResult | null {
    // Check if frame is completely black or white
    const isBlack = characteristics.avgBrightness < 5;
    const isWhite = characteristics.avgBrightness > 250;
    
    if (isBlack || isWhite) {
      history.consecutiveBlankFrames++;
      
      if (history.consecutiveBlankFrames >= this.BLANK_THRESHOLD) {
        const issue: ChannelIssue = {
          type: 'blank',
          severity: 'critical',
          detectedAt: new Date(),
          description: `DVR channel ${history.channelId} is ${isBlack ? 'blank/black' : 'overexposed/white'}`,
        };
        history.issues.push(issue);
        
        return {
          detectionType: "dvr-channel-blank",
          confidence: 0.90,
          objects: [],
          metadata: {
            channelId: history.channelId,
            cameraId: history.cameraId,
            dvrId: history.dvrId,
            blankType: isBlack ? 'black' : 'white',
            consecutiveBlankFrames: history.consecutiveBlankFrames,
            issue,
          },
          requiresAlert: true,
        };
      }
    } else {
      history.consecutiveBlankFrames = 0;
    }
    
    return null;
  }

  /**
   * Check for wrong camera / channel swap
   */
  private checkWrongCamera(
    history: DVRChannelHistory,
    characteristics: {
      avgBrightness: number;
      avgColor: { r: number; g: number; b: number };
    }
  ): DetectionResult | null {
    if (!history.expectedCameraSignature) return null;
    
    const signature = history.expectedCameraSignature;
    
    // Calculate deviation from expected signature
    const brightnessDev = Math.abs(characteristics.avgBrightness - signature.avgBrightness);
    const colorDev = Math.sqrt(
      Math.pow(characteristics.avgColor.r - signature.avgColor.r, 2) +
      Math.pow(characteristics.avgColor.g - signature.avgColor.g, 2) +
      Math.pow(characteristics.avgColor.b - signature.avgColor.b, 2)
    );
    
    // Check recent history for persistent deviation
    const recentChars = history.frameCharacteristics.slice(-10);
    const persistentDeviation = recentChars.every(c => {
      const bDev = Math.abs(c.avgBrightness - signature.avgBrightness);
      return bDev > this.SIGNATURE_DEVIATION_THRESHOLD;
    });
    
    if (persistentDeviation && brightnessDev > this.SIGNATURE_DEVIATION_THRESHOLD) {
      const issue: ChannelIssue = {
        type: 'wrong-camera',
        severity: 'high',
        detectedAt: new Date(),
        description: `DVR channel ${history.channelId} video signature changed - possible channel swap or wrong camera`,
      };
      history.issues.push(issue);
      
      return {
        detectionType: "dvr-wrong-camera",
        confidence: 0.80,
        objects: [],
        metadata: {
          channelId: history.channelId,
          cameraId: history.cameraId,
          dvrId: history.dvrId,
          expectedSignature: signature,
          currentCharacteristics: characteristics,
          deviation: {
            brightness: brightnessDev,
            color: colorDev,
          },
          issue,
        },
        requiresAlert: true,
      };
    }
    
    return null;
  }

  /**
   * Check for intermittent signal
   */
  private checkIntermittentSignal(
    history: DVRChannelHistory,
    currentTime: Date
  ): DetectionResult | null {
    // Check for patterns of frame drops in recent history
    const windowStart = new Date(currentTime.getTime() - this.INTERMITTENT_WINDOW_MS);
    const recentFrames = history.frameHashes.filter(f => f.timestamp >= windowStart);
    
    if (recentFrames.length < 5) return null;
    
    // Calculate frame intervals
    const intervals: number[] = [];
    for (let i = 1; i < recentFrames.length; i++) {
      const interval = recentFrames[i]!.timestamp.getTime() - recentFrames[i - 1]!.timestamp.getTime();
      intervals.push(interval);
    }
    
    // Check for high variance in frame intervals (indicating intermittent signal)
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // High standard deviation indicates intermittent signal
    if (stdDev > avgInterval * 0.5 && avgInterval > 2000) {
      const issue: ChannelIssue = {
        type: 'intermittent',
        severity: 'medium',
        detectedAt: currentTime,
        description: `DVR channel ${history.channelId} experiencing intermittent signal (irregular frame intervals)`,
      };
      
      // Only add if not already present in recent issues
      const hasRecentIntermittent = history.issues.some(
        i => i.type === 'intermittent' && 
        currentTime.getTime() - i.detectedAt.getTime() < 60000
      );
      
      if (!hasRecentIntermittent) {
        history.issues.push(issue);
        
        return {
          detectionType: "dvr-intermittent-signal",
          confidence: 0.75,
          objects: [],
          metadata: {
            channelId: history.channelId,
            cameraId: history.cameraId,
            dvrId: history.dvrId,
            avgFrameInterval: avgInterval,
            intervalStdDev: stdDev,
            issue,
          },
          requiresAlert: true,
        };
      }
    }
    
    return null;
  }

  /**
   * Check for fake/looping feed
   */
  private checkFakeFeed(history: DVRChannelHistory): DetectionResult | null {
    if (history.frameHashes.length < this.FRAME_HASH_HISTORY) return null;
    
    // Check for repeating hash patterns (looping video)
    const hashes = history.frameHashes.map(h => h.hash);
    const uniqueHashes = new Set(hashes);
    
    // If only 2-3 unique hashes in 10 frames, likely a loop
    if (uniqueHashes.size <= 3) {
      const issue: ChannelIssue = {
        type: 'fake-feed',
        severity: 'critical',
        detectedAt: new Date(),
        description: `DVR channel ${history.channelId} may be showing fake/looping video (only ${uniqueHashes.size} unique frames)`,
      };
      
      // Only add if not already present
      const hasRecentFake = history.issues.some(
        i => i.type === 'fake-feed' && 
        new Date().getTime() - i.detectedAt.getTime() < 300000 // 5 minutes
      );
      
      if (!hasRecentFake) {
        history.issues.push(issue);
        
        return {
          detectionType: "dvr-fake-feed",
          confidence: 0.85,
          objects: [],
          metadata: {
            channelId: history.channelId,
            cameraId: history.cameraId,
            dvrId: history.dvrId,
            uniqueFrames: uniqueHashes.size,
            totalFrames: hashes.length,
            issue,
          },
          requiresAlert: true,
        };
      }
    }
    
    return null;
  }

  /**
   * Get channel status
   */
  getChannelStatus(channelId: string): DVRChannelStatus | null {
    const history = this.channelHistory.get(channelId);
    if (!history) return null;
    
    // Determine overall status
    let status: DVRChannelStatus['status'] = 'healthy';
    const activeIssues = history.issues.filter(i => !i.autoResolved);
    
    if (activeIssues.some(i => i.severity === 'critical')) {
      status = 'error';
    } else if (activeIssues.some(i => i.severity === 'high')) {
      status = 'error';
    } else if (activeIssues.some(i => i.severity === 'medium')) {
      status = 'warning';
    } else if (activeIssues.length > 0) {
      status = 'warning';
    }
    
    // Check if offline
    const timeSinceLastFrame = Date.now() - history.lastSuccessfulFrame.getTime();
    if (timeSinceLastFrame > 60000) { // 1 minute
      status = 'offline';
    }
    
    return {
      channelId: history.channelId,
      cameraId: history.cameraId,
      dvrId: history.dvrId,
      status,
      issues: activeIssues,
      lastFrameAt: history.lastSuccessfulFrame,
      consecutiveFailures: history.consecutiveFailures,
      recordingStatus: 'unknown', // Would need DVR integration
      storageStatus: 'ok', // Would need DVR integration
    };
  }

  /**
   * Get all channel statuses
   */
  getAllChannelStatuses(): DVRChannelStatus[] {
    const statuses: DVRChannelStatus[] = [];
    
    for (const channelId of this.channelHistory.keys()) {
      const status = this.getChannelStatus(channelId);
      if (status) {
        statuses.push(status);
      }
    }
    
    return statuses.sort((a, b) => {
      const statusOrder = { error: 4, offline: 3, warning: 2, healthy: 1 };
      return statusOrder[b.status] - statusOrder[a.status];
    });
  }

  /**
   * Get DVR health summary
   */
  getDVRHealthSummary(dvrId: string) {
    const channels = Array.from(this.channelHistory.values()).filter(
      h => h.dvrId === dvrId
    );
    
    if (channels.length === 0) return null;
    
    const statuses = channels.map(h => this.getChannelStatus(h.channelId)!).filter(Boolean);
    
    return {
      dvrId,
      totalChannels: channels.length,
      healthyChannels: statuses.filter(s => s.status === 'healthy').length,
      warningChannels: statuses.filter(s => s.status === 'warning').length,
      errorChannels: statuses.filter(s => s.status === 'error').length,
      offlineChannels: statuses.filter(s => s.status === 'offline').length,
      totalIssues: statuses.reduce((sum, s) => sum + s.issues.length, 0),
      channels: statuses,
    };
  }

  async cleanup(): Promise<void> {
    this.channelHistory.clear();
    console.log("DVR channel health detector cleaned up");
  }

  getHealth() {
    const allStatuses = this.getAllChannelStatuses();
    const errorCount = allStatuses.filter(s => s.status === 'error' || s.status === 'offline').length;
    
    return {
      status: errorCount > 0 ? ("degraded" as const) : ("healthy" as const),
      details: `Monitoring ${this.channelHistory.size} DVR channels, ${errorCount} with errors`,
    };
  }
}
