/**
 * Camera Monitor Service
 * Continuous heartbeat monitoring, video quality tracking, and automatic recovery
 */

import { EventEmitter } from "events";
import type { Pool } from "pg";
import { logger } from "../utils/logger.js";
import { getStreamHealthAnalyzer, type StreamHealthStatus } from "./stream-health-analyzer.service.js";
import { getCameraRecoveryService, type RecoveryWorkflow } from "./camera-recovery.service.js";

export interface CameraDevice {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  vendor: string;
  model: string;
  protocol: "onvif" | "rtsp" | "http";
  rtspUrl: string;
  onvifUrl?: string;
  credentials?: {
    username: string;
    password: string;
  };
  status: "online" | "offline" | "warning" | "unknown";
  lastHeartbeat?: Date;
  lastSeen?: Date;
  consecutiveFailures: number;
  pollingInterval: number; // seconds - adaptive based on status
  enabled: boolean;
  expectedFps: number;
  expectedResolution: { width: number; height: number };
  expectedBitrate: number; // kbps
}

export interface CameraHealthData {
  cameraId: string;
  timestamp: Date;
  status: "online" | "offline" | "warning" | "degraded";
  responseTimeMs?: number;
  
  // Stream quality metrics
  currentFps?: number;
  currentBitrate?: number; // kbps
  currentResolution?: { width: number; height: number };
  packetLoss?: number; // percentage
  latencyMs?: number;
  
  // Stream health indicators
  streamActive: boolean;
  videoLoss: boolean;
  imageFrozen: boolean;
  blackScreen: boolean;
  tamperingDetected: boolean;
  
  // Additional metadata
  codec?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface HeartbeatConfig {
  normalInterval: number; // 60s for stable cameras
  warningInterval: number; // 30s for cameras with issues
  criticalInterval: number; // 15s for offline cameras
  batchSize: number; // Process N cameras at once
  maxConcurrent: number; // Concurrent heartbeat checks
  retryBackoff: "linear" | "exponential";
  maxConsecutiveFailures: number;
}

export interface MonitoringStats {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  warningCameras: number;
  degradedCameras: number;
  lastUpdateTime: Date;
  avgResponseTimeMs: number;
  avgFps: number;
  qualityIssuesCount: number;
}

export class CameraMonitorService extends EventEmitter {
  private pool: Pool;
  private cameras: Map<string, CameraDevice>;
  private pollingTimers: Map<string, NodeJS.Timeout>;
  private isRunning: boolean;
  private healthCache: Map<string, CameraHealthData>;
  private config: HeartbeatConfig;
  private processingQueue: Set<string>;
  private streamAnalyzer = getStreamHealthAnalyzer();
  private recoveryService = getCameraRecoveryService(this.pool);

  constructor(pool: Pool, config?: Partial<HeartbeatConfig>) {
    super();
    this.pool = pool;
    this.cameras = new Map();
    this.pollingTimers = new Map();
    this.isRunning = false;
    this.healthCache = new Map();
    this.processingQueue = new Set();
    
    this.config = {
      normalInterval: config?.normalInterval ?? 60,
      warningInterval: config?.warningInterval ?? 30,
      criticalInterval: config?.criticalInterval ?? 15,
      batchSize: config?.batchSize ?? 50,
      maxConcurrent: config?.maxConcurrent ?? 20,
      retryBackoff: config?.retryBackoff ?? "exponential",
      maxConsecutiveFailures: config?.maxConsecutiveFailures ?? 3,
    };
    
    this.recoveryService = getCameraRecoveryService(pool);
  }

  /**
   * Start the camera monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Camera monitor service already running");
      return;
    }

    logger.info("Starting camera monitor service");
    this.isRunning = true;

    // Load cameras from database
    await this.loadCameras();

    // Start batch polling
    this.startBatchPolling();

    logger.info(`Camera monitor service started with ${this.cameras.size} cameras`);
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping camera monitor service");
    this.isRunning = false;

    // Stop all polling timers
    for (const timer of this.pollingTimers.values()) {
      clearInterval(timer);
    }
    this.pollingTimers.clear();

    logger.info("Camera monitor service stopped");
  }

  /**
   * Load cameras from database
   */
  private async loadCameras(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT 
          c.id::text,
          c.resource_node_id::text as node_id,
          c.branch_node_id::text as branch_id,
          rn.name,
          c.vendor,
          c.model,
          c.protocol,
          c.status,
          c.last_seen_at as last_seen,
          c.profiles,
          b.tenant_id::text as tenant_id
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE c.status != 'disabled'
        ORDER BY c.id
      `);

      for (const row of result.rows) {
        const camera: CameraDevice = {
          id: row.id,
          tenantId: row.tenant_id,
          branchId: row.branch_id,
          name: row.name,
          vendor: row.vendor,
          model: row.model,
          protocol: row.protocol,
          rtspUrl: "", // Will be populated from connection secrets
          status: row.status || "unknown",
          lastSeen: row.last_seen ? new Date(row.last_seen) : undefined,
          consecutiveFailures: 0,
          pollingInterval: this.config.normalInterval,
          enabled: true,
          expectedFps: row.profiles?.[0]?.frameRate || 25,
          expectedResolution: {
            width: row.profiles?.[0]?.width || 1920,
            height: row.profiles?.[0]?.height || 1080,
          },
          expectedBitrate: 2000, // Default 2 Mbps
        };

        this.cameras.set(camera.id, camera);
      }

      logger.info(`Loaded ${this.cameras.size} cameras for monitoring`);
    } catch (error) {
      logger.error("Failed to load cameras", { error });
      throw error;
    }
  }

  /**
   * Start batch polling - processes cameras in batches
   */
  private startBatchPolling(): void {
    // Process cameras in batches every 5 seconds
    const batchTimer = setInterval(() => {
      this.processBatch().catch((error) => {
        logger.error("Batch processing error", { error });
      });
    }, 5000);

    this.pollingTimers.set("batch-processor", batchTimer);
  }

  /**
   * Process a batch of cameras that need polling
   */
  private async processBatch(): Promise<void> {
    const now = Date.now();
    const camerasToProcess: CameraDevice[] = [];

    // Find cameras that need polling based on their interval
    for (const camera of this.cameras.values()) {
      if (!camera.enabled || this.processingQueue.has(camera.id)) {
        continue;
      }

      const interval = this.getAdaptiveInterval(camera);
      const lastPoll = camera.lastHeartbeat?.getTime() || 0;
      const timeSinceLastPoll = now - lastPoll;

      if (timeSinceLastPoll >= interval * 1000) {
        camerasToProcess.push(camera);
      }

      if (camerasToProcess.length >= this.config.batchSize) {
        break;
      }
    }

    if (camerasToProcess.length === 0) {
      return;
    }

    logger.debug(`Processing batch of ${camerasToProcess.length} cameras`);

    // Process cameras concurrently with limit
    const chunks = this.chunkArray(camerasToProcess, this.config.maxConcurrent);
    
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map((camera) => this.pollCamera(camera))
      );
    }
  }

  /**
   * Get adaptive polling interval based on camera status
   */
  private getAdaptiveInterval(camera: CameraDevice): number {
    switch (camera.status) {
      case "online":
        return this.config.normalInterval;
      case "warning":
      case "degraded":
        return this.config.warningInterval;
      case "offline":
        return this.config.criticalInterval;
      default:
        return this.config.normalInterval;
    }
  }

  /**
   * Poll a single camera
   */
  private async pollCamera(camera: CameraDevice): Promise<void> {
    if (this.processingQueue.has(camera.id)) {
      return; // Already processing
    }

    this.processingQueue.add(camera.id);
    const startTime = Date.now();

    try {
      camera.lastHeartbeat = new Date();

      // Perform health check
      const healthData = await this.performHealthCheck(camera);
      healthData.responseTimeMs = Date.now() - startTime;

      const previousStatus = camera.status;
      camera.status = healthData.status;

      if (healthData.status === "online") {
        camera.lastSeen = new Date();
        camera.consecutiveFailures = 0;
      } else {
        camera.consecutiveFailures++;
      }

      // Store health data
      this.healthCache.set(camera.id, healthData);

      // Save to database
      await this.saveHealthData(healthData);
      await this.updateCameraStatus(camera);

      // Emit status change event
      if (previousStatus !== camera.status) {
        this.emit("statusChange", {
          cameraId: camera.id,
          previousStatus,
          currentStatus: camera.status,
          camera,
        });

        // Create alert for offline cameras
        if (camera.status === "offline" && camera.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          await this.createOfflineAlert(camera);
          
          // Trigger automatic recovery
          logger.info(`Triggering automatic recovery for offline camera ${camera.name}`);
          this.triggerRecovery(camera.id).catch((error) => {
            logger.error(`Auto-recovery trigger failed for ${camera.id}`, { error });
          });
        }
      }

      // Check for quality issues
      if (healthData.status === "online") {
        await this.checkQualityIssues(camera, healthData);
      }

      logger.debug(`Polled camera ${camera.name}: ${camera.status} (${healthData.responseTimeMs}ms)`);
    } catch (error) {
      camera.consecutiveFailures++;
      logger.error(`Failed to poll camera ${camera.name}`, {
        error,
        cameraId: camera.id,
        consecutiveFailures: camera.consecutiveFailures,
      });

      // Mark as offline after max consecutive failures
      if (camera.consecutiveFailures >= this.config.maxConsecutiveFailures && camera.status !== "offline") {
        const previousStatus = camera.status;
        camera.status = "offline";
        await this.updateCameraStatus(camera);

        this.emit("statusChange", {
          cameraId: camera.id,
          previousStatus,
          currentStatus: "offline",
          camera,
        });

        await this.createOfflineAlert(camera);
      }
    } finally {
      this.processingQueue.delete(camera.id);
    }
  }

  /**
   * Perform comprehensive health check on camera
   */
  private async performHealthCheck(camera: CameraDevice): Promise<CameraHealthData> {
    const healthData: CameraHealthData = {
      cameraId: camera.id,
      timestamp: new Date(),
      status: "unknown",
      streamActive: false,
      videoLoss: false,
      imageFrozen: false,
      blackScreen: false,
      tamperingDetected: false,
    };

    try {
      // Basic connectivity check (RTSP/ONVIF)
      const isReachable = await this.checkConnectivity(camera);
      
      if (!isReachable) {
        healthData.status = "offline";
        healthData.videoLoss = true;
        healthData.errorMessage = "Camera not reachable";
        return healthData;
      }

      // Camera is reachable, mark as online
      healthData.status = "online";
      healthData.streamActive = true;

      // Get quality metrics (if stream is active)
      const qualityMetrics = await this.getQualityMetrics(camera);
      
      if (qualityMetrics) {
        healthData.currentFps = qualityMetrics.fps;
        healthData.currentBitrate = qualityMetrics.bitrate;
        healthData.currentResolution = qualityMetrics.resolution;
        healthData.packetLoss = qualityMetrics.packetLoss;
        healthData.latencyMs = qualityMetrics.latency;
        healthData.codec = qualityMetrics.codec;

        // Check for quality degradation
        if (qualityMetrics.fps < camera.expectedFps * 0.8) {
          healthData.status = "warning";
          healthData.errorMessage = "Low FPS detected";
        }

        if (qualityMetrics.packetLoss > 5) {
          healthData.status = "warning";
          healthData.errorMessage = "High packet loss";
        }
      }

      // Perform advanced stream health analysis (frozen frames, black screens)
      try {
        const streamHealth = await this.streamAnalyzer.analyzeStream(
          camera.id,
          camera.rtspUrl
        );

        // Update health data with stream analysis results
        healthData.imageFrozen = streamHealth.status === "frozen";
        healthData.blackScreen = streamHealth.status === "black_screen" || streamHealth.status === "white_screen";
        
        // If stream has serious issues, downgrade status
        if (streamHealth.status === "frozen" && streamHealth.consecutiveIssueFrames >= 3) {
          healthData.status = "warning";
          healthData.errorMessage = "Video stream is frozen";
        }
        
        if ((streamHealth.status === "black_screen" || streamHealth.status === "white_screen") && 
            streamHealth.consecutiveIssueFrames >= 3) {
          healthData.status = "warning";
          healthData.errorMessage = streamHealth.status === "black_screen" 
            ? "Black screen detected" 
            : "White screen detected";
        }

        // Store stream health in metadata
        healthData.metadata = {
          ...healthData.metadata,
          streamHealth: {
            status: streamHealth.status,
            consecutiveIssues: streamHealth.consecutiveIssueFrames,
            brightness: streamHealth.lastAnalysis.brightness,
            variance: streamHealth.lastAnalysis.variance,
          },
        };
      } catch (error) {
        logger.debug(`Stream analysis failed for camera ${camera.id}`, { error });
        // Don't fail the entire health check if stream analysis fails
      }

      return healthData;
    } catch (error) {
      healthData.status = "offline";
      healthData.videoLoss = true;
      healthData.errorMessage = error instanceof Error ? error.message : "Unknown error";
      return healthData;
    }
  }

  /**
   * Check basic camera connectivity (ping/RTSP OPTIONS)
   */
  private async checkConnectivity(camera: CameraDevice): Promise<boolean> {
    try {
      // Simple HTTP/ONVIF check or RTSP OPTIONS
      // This is a placeholder - implement actual RTSP OPTIONS or ONVIF ping
      const response = await fetch(camera.onvifUrl || camera.rtspUrl.replace("rtsp://", "http://"), {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      return response?.ok ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get video quality metrics using ffprobe
   */
  private async getQualityMetrics(camera: CameraDevice): Promise<{
    fps: number;
    bitrate: number;
    resolution: { width: number; height: number };
    packetLoss: number;
    latency: number;
    codec: string;
  } | null> {
    try {
      const { spawn } = await import("child_process");
      const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
      
      // Use ffprobe to analyze stream metrics
      const args = [
        "-v", "error",
        "-select_streams", "v:0",
        "-count_packets",
        "-show_entries", "stream=codec_name,width,height,r_frame_rate,bit_rate",
        "-show_entries", "packet=pts_time,size",
        "-read_intervals", "%+2", // Read 2 seconds
        "-of", "json",
        camera.rtspUrl
      ];

      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("ffprobe timeout"));
        }, 10000);

        const child = spawn(ffprobePath, args);
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => stdout += data.toString());
        child.stderr.on("data", (data) => stderr += data.toString());

        child.on("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(`ffprobe failed: ${stderr}`));
          } else {
            try {
              resolve(JSON.parse(stdout));
            } catch (error) {
              reject(new Error("Failed to parse ffprobe output"));
            }
          }
        });

        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Parse ffprobe output
      const stream = result.streams?.[0];
      const packets = result.packets || [];

      if (!stream) {
        logger.warn(`No stream data from ffprobe for camera ${camera.id}`);
        return null;
      }

      // Calculate FPS from r_frame_rate (e.g., "25/1" or "30000/1001")
      let fps = camera.expectedFps;
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split("/").map(Number);
        if (den && den !== 0) {
          fps = num / den;
        }
      }

      // Get bitrate (convert from bits/s to kbps)
      const bitrate = stream.bit_rate 
        ? Math.round(parseInt(stream.bit_rate) / 1000)
        : camera.expectedBitrate;

      // Get resolution
      const resolution = {
        width: stream.width || camera.expectedResolution.width,
        height: stream.height || camera.expectedResolution.height
      };

      // Calculate packet loss from packet timing
      let packetLoss = 0;
      if (packets.length > 1) {
        const expectedPackets = Math.ceil(fps * 2); // 2 seconds of capture
        const actualPackets = packets.length;
        packetLoss = Math.max(0, ((expectedPackets - actualPackets) / expectedPackets) * 100);
      }

      // Calculate latency from packet timing variance
      let latency = 50; // Default baseline
      if (packets.length > 10) {
        const times = packets.map((p: any) => parseFloat(p.pts_time)).filter((t: number) => !isNaN(t));
        if (times.length > 1) {
          const intervals = [];
          for (let i = 1; i < times.length; i++) {
            intervals.push((times[i] - times[i - 1]) * 1000);
          }
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
          latency = Math.sqrt(variance);
        }
      }

      return {
        fps: Math.round(fps * 10) / 10,
        bitrate,
        resolution,
        packetLoss: Math.round(packetLoss * 10) / 10,
        latency: Math.round(latency),
        codec: stream.codec_name?.toUpperCase() || "H264",
      };

    } catch (error) {
      logger.debug(`Failed to get quality metrics for camera ${camera.id}`, { error });
      
      // Fallback: return null to indicate metrics unavailable
      // The health check will still work, just without quality metrics
      return null;
    }
  }

  /**
   * Check for video quality issues
   */
  private async checkQualityIssues(camera: CameraDevice, healthData: CameraHealthData): Promise<void> {
    const issues: string[] = [];

    // Check FPS
    if (healthData.currentFps && healthData.currentFps < camera.expectedFps * 0.8) {
      issues.push(`Low FPS: ${healthData.currentFps.toFixed(1)}/${camera.expectedFps}`);
    }

    // Check bitrate
    if (healthData.currentBitrate && healthData.currentBitrate < camera.expectedBitrate * 0.7) {
      issues.push(`Low bitrate: ${healthData.currentBitrate.toFixed(0)}/${camera.expectedBitrate} kbps`);
    }

    // Check packet loss
    if (healthData.packetLoss && healthData.packetLoss > 5) {
      issues.push(`High packet loss: ${healthData.packetLoss.toFixed(1)}%`);
    }

    // Check latency
    if (healthData.latencyMs && healthData.latencyMs > 500) {
      issues.push(`High latency: ${healthData.latencyMs.toFixed(0)}ms`);
    }

    if (issues.length > 0) {
      await this.createQualityAlert(camera, issues);
    }
  }

  /**
   * Save health data to database
   */
  private async saveHealthData(healthData: CameraHealthData): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO camera_health_history (
          camera_id, timestamp, status, response_time_ms,
          current_fps, current_bitrate, current_resolution,
          packet_loss, latency_ms, stream_active, video_loss,
          image_frozen, black_screen, tampering_detected, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          healthData.cameraId,
          healthData.timestamp,
          healthData.status,
          healthData.responseTimeMs,
          healthData.currentFps,
          healthData.currentBitrate,
          healthData.currentResolution ? JSON.stringify(healthData.currentResolution) : null,
          healthData.packetLoss,
          healthData.latencyMs,
          healthData.streamActive,
          healthData.videoLoss,
          healthData.imageFrozen,
          healthData.blackScreen,
          healthData.tamperingDetected,
          healthData.errorMessage,
          healthData.metadata ? JSON.stringify(healthData.metadata) : null,
        ]
      );
    } catch (error) {
      logger.error("Failed to save camera health data", { error, cameraId: healthData.cameraId });
    }
  }

  /**
   * Update camera status in database
   */
  private async updateCameraStatus(camera: CameraDevice): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE cameras 
         SET status = $2::camera_status, 
             last_seen_at = CASE WHEN $2 = 'online' THEN $3 ELSE last_seen_at END
         WHERE id = $1::uuid`,
        [camera.id, camera.status, camera.lastSeen]
      );
    } catch (error) {
      logger.error("Failed to update camera status", { error, cameraId: camera.id });
    }
  }

  /**
   * Create offline alert
   */
  private async createOfflineAlert(camera: CameraDevice): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO operational_alerts (
          tenant_id, branch_id, alert_type, severity, title, message, metadata, detected_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
        [
          camera.tenantId,
          camera.branchId,
          "camera_offline",
          "high",
          `Camera Offline: ${camera.name}`,
          `Camera ${camera.name} has been offline for ${camera.consecutiveFailures} consecutive checks`,
          JSON.stringify({ cameraId: camera.id, consecutiveFailures: camera.consecutiveFailures }),
        ]
      );

      logger.info(`Created offline alert for camera ${camera.name}`);
    } catch (error) {
      logger.error("Failed to create offline alert", { error, cameraId: camera.id });
    }
  }

  /**
   * Create quality alert
   */
  private async createQualityAlert(camera: CameraDevice, issues: string[]): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO operational_alerts (
          tenant_id, branch_id, alert_type, severity, title, message, metadata, detected_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
        [
          camera.tenantId,
          camera.branchId,
          "camera_quality_degraded",
          "medium",
          `Camera Quality Issues: ${camera.name}`,
          `Camera ${camera.name} has quality issues: ${issues.join(", ")}`,
          JSON.stringify({ cameraId: camera.id, issues }),
        ]
      );

      logger.debug(`Created quality alert for camera ${camera.name}`);
    } catch (error) {
      logger.error("Failed to create quality alert", { error, cameraId: camera.id });
    }
  }

  /**
   * Get monitoring statistics
   */
  async getStats(): Promise<MonitoringStats> {
    let onlineCount = 0;
    let offlineCount = 0;
    let warningCount = 0;
    let degradedCount = 0;
    let totalResponseTime = 0;
    let totalFps = 0;
    let fpsCount = 0;
    let qualityIssues = 0;

    for (const camera of this.cameras.values()) {
      switch (camera.status) {
        case "online":
          onlineCount++;
          break;
        case "offline":
          offlineCount++;
          break;
        case "warning":
          warningCount++;
          break;
        case "degraded":
          degradedCount++;
          break;
      }

      const health = this.healthCache.get(camera.id);
      if (health) {
        if (health.responseTimeMs) {
          totalResponseTime += health.responseTimeMs;
        }
        if (health.currentFps) {
          totalFps += health.currentFps;
          fpsCount++;
        }
        if (health.status === "warning" || health.status === "degraded") {
          qualityIssues++;
        }
      }
    }

    return {
      totalCameras: this.cameras.size,
      onlineCameras: onlineCount,
      offlineCameras: offlineCount,
      warningCameras: warningCount,
      degradedCameras: degradedCount,
      lastUpdateTime: new Date(),
      avgResponseTimeMs: this.cameras.size > 0 ? totalResponseTime / this.cameras.size : 0,
      avgFps: fpsCount > 0 ? totalFps / fpsCount : 0,
      qualityIssuesCount: qualityIssues,
    };
  }

  /**
   * Get camera health data
   */
  getCameraHealth(cameraId: string): CameraHealthData | undefined {
    return this.healthCache.get(cameraId);
  }

  /**
   * Trigger manual health check
   */
  async triggerHealthCheck(cameraId: string): Promise<CameraHealthData | undefined> {
    const camera = this.cameras.get(cameraId);
    if (!camera) {
      return undefined;
    }

    await this.pollCamera(camera);
    return this.healthCache.get(cameraId);
  }

  /**
   * Trigger recovery workflow
   */
  async triggerRecovery(cameraId: string, steps?: string[]): Promise<{ success: boolean; message: string; workflow?: RecoveryWorkflow }> {
    const camera = this.cameras.get(cameraId);
    if (!camera) {
      return { success: false, message: "Camera not found" };
    }

    logger.info(`Starting recovery workflow for camera ${camera.name}`, { steps });

    try {
      let workflow: RecoveryWorkflow;
      
      if (steps && steps.length > 0) {
        // Manual recovery with specific steps
        workflow = await this.recoveryService.startManualRecovery(
          camera,
          steps as any[]
        );
      } else {
        // Automatic recovery with default steps
        workflow = await this.recoveryService.startAutoRecovery(camera);
      }

      return {
        success: true,
        message: "Recovery workflow initiated",
        workflow,
      };
    } catch (error) {
      logger.error(`Failed to start recovery for camera ${camera.name}`, { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to start recovery",
      };
    }
  }

  /**
   * Utility: chunk array
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
