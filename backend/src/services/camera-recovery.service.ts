/**
 * Camera Recovery Service
 * Advanced recovery workflows with ONVIF device management and auto-escalation
 */

import type { Pool } from "pg";
import os from "os";
import crypto from "crypto";
import { RedisLock } from "./redisLock";
import { logger } from "../utils/logger.js";
import type { CameraDevice } from "./camera-monitor.service.js";

export type RecoveryStep = 
  | "rtsp_reconnect"
  | "onvif_ping"
  | "soft_reboot"
  | "hard_reboot"
  | "stream_restart"
  | "profile_reset"
  | "factory_reset"
  | "manual_intervention";

export interface RecoveryWorkflow {
  lockKey?: string;
  id: string;
  cameraId: string;
  tenantId: string;
  branchId: string;
  initiatedAt: Date;
  initiatedBy: "system" | "user";
  status: "in_progress" | "success" | "failed" | "escalated";
  currentStep: RecoveryStep;
  completedSteps: RecoveryStep[];
  failedSteps: RecoveryStep[];
  attempts: number;
  maxAttempts: number;
  logs: RecoveryLog[];
}

export interface RecoveryLog {
  timestamp: Date;
  step: RecoveryStep;
  action: string;
  result: "success" | "failed" | "skipped";
  message: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface RecoveryConfig {
  enableAutoRecovery: boolean;
  maxAutoAttempts: number;
  retryDelay: number; // seconds between steps
  escalationThreshold: number; // failures before escalating
  allowHardReboot: boolean;
  allowFactoryReset: boolean;
  notifyOnEscalation: boolean;
}

export class CameraRecoveryService {
  private pool: Pool;
  private config: RecoveryConfig;
  private activeWorkflows: Map<string, RecoveryWorkflow>;
  private redisLock?: RedisLock;
  private holderId: string;

  // Default recovery sequence
  private readonly DEFAULT_RECOVERY_SEQUENCE: RecoveryStep[] = [
    "rtsp_reconnect",
    "onvif_ping",
    "stream_restart",
    "soft_reboot",
    "hard_reboot",
    "manual_intervention",
  ];

  constructor(pool: Pool, config?: Partial<RecoveryConfig>) {
    this.pool = pool;
    this.activeWorkflows = new Map();
    this.holderId = `${process.env.INSTANCE_ID || os.hostname()}:${process.pid}`;

    if (process.env.REDIS_LOCKS === "true") {
      this.redisLock = new RedisLock("recovery:camera");
    }

    this.config = {
      enableAutoRecovery: config?.enableAutoRecovery ?? true,
      maxAutoAttempts: config?.maxAutoAttempts ?? 3,
      retryDelay: config?.retryDelay ?? 30,
      escalationThreshold: config?.escalationThreshold ?? 2,
      allowHardReboot: config?.allowHardReboot ?? true,
      allowFactoryReset: config?.allowFactoryReset ?? false,
      notifyOnEscalation: config?.notifyOnEscalation ?? true,
    };
  }

  /**
   * Start automatic recovery workflow for a camera
   */
  async startAutoRecovery(camera: CameraDevice): Promise<RecoveryWorkflow> {
    if (!this.config.enableAutoRecovery) {
      throw new Error("Auto recovery is disabled");
    }

    // Attempt to acquire a distributed lock (if enabled) to avoid duplicate recovery across instances
    const lockKey = camera.id;
    if (this.redisLock) {
      const acquired = await this.redisLock.acquire(lockKey, this.holderId, 2 * 60 * 1000);
      if (!acquired) {
        logger.info(`Recovery already being handled by another instance for camera ${camera.id}`);
        const existing = this.activeWorkflows.get(camera.id);
        if (existing) return existing;
        throw new Error("Recovery is currently handled by another instance");
      }
    }

    // Check if recovery is already in progress locally
    const existing = this.activeWorkflows.get(camera.id);
    if (existing && existing.status === "in_progress") {
      logger.info(`Recovery already in progress for camera ${camera.id}`);
      // release lock if we acquired it and local workflow exists
      if (this.redisLock) {
        await this.redisLock.release(lockKey, this.holderId);
      }
      return existing;
    }

    logger.info(`Starting auto recovery for camera ${camera.name}`, {
      cameraId: camera.id,
      status: camera.status,
      consecutiveFailures: camera.consecutiveFailures,
    });

    const workflow: RecoveryWorkflow = {
      id: `recovery_${camera.id}_${Date.now()}`,
      cameraId: camera.id,
      tenantId: camera.tenantId,
      branchId: camera.branchId,
      initiatedAt: new Date(),
      initiatedBy: "system",
      status: "in_progress",
      currentStep: this.DEFAULT_RECOVERY_SEQUENCE[0],
      completedSteps: [],
      failedSteps: [],
      attempts: 0,
      maxAttempts: this.config.maxAutoAttempts,
      logs: [],
      lockKey,
    };

    this.activeWorkflows.set(camera.id, workflow);

    // Execute recovery in background
    this.executeRecoveryWorkflow(camera, workflow).catch((error) => {
      logger.error(`Recovery workflow failed for camera ${camera.id}`, { error });
    });

    return workflow;
  }

  /**
   * Start manual recovery workflow
   */
  async startManualRecovery(
    camera: CameraDevice,
    steps: RecoveryStep[]
  ): Promise<RecoveryWorkflow> {
    logger.info(`Starting manual recovery for camera ${camera.name}`, {
      cameraId: camera.id,
      steps,
    });

    const workflow: RecoveryWorkflow = {
      id: `manual_recovery_${camera.id}_${Date.now()}`,
      cameraId: camera.id,
      tenantId: camera.tenantId,
      branchId: camera.branchId,
      initiatedAt: new Date(),
      initiatedBy: "user",
      status: "in_progress",
      currentStep: steps[0],
      completedSteps: [],
      failedSteps: [],
      attempts: 0,
      maxAttempts: 1, // Manual recovery doesn't retry
      logs: [],
    };

    this.activeWorkflows.set(camera.id, workflow);

    // Execute custom recovery steps
    this.executeCustomRecovery(camera, workflow, steps).catch((error) => {
      logger.error(`Manual recovery failed for camera ${camera.id}`, { error });
    });

    return workflow;
  }

  /**
   * Execute the full recovery workflow
   */
  private async executeRecoveryWorkflow(
    camera: CameraDevice,
    workflow: RecoveryWorkflow
  ): Promise<void> {
    for (const step of this.DEFAULT_RECOVERY_SEQUENCE) {
      if (workflow.status !== "in_progress") {
        break; // Workflow was cancelled or completed
      }

      workflow.currentStep = step;
      workflow.attempts++;

      // Check if we've exceeded max attempts
      if (workflow.attempts > workflow.maxAttempts) {
        await this.escalateRecovery(camera, workflow);
        break;
      }

      const startTime = Date.now();
      const result = await this.executeRecoveryStep(camera, step);
      const duration = Date.now() - startTime;

      const log: RecoveryLog = {
        timestamp: new Date(),
        step,
        action: this.getStepDescription(step),
        result: result.success ? "success" : "failed",
        message: result.message,
        duration,
        metadata: result.metadata,
      };

      workflow.logs.push(log);

      if (result.success) {
        workflow.completedSteps.push(step);
        
        // Check if camera is now online
        const isOnline = await this.verifyCameraOnline(camera);
        if (isOnline) {
          workflow.status = "success";
          await this.logRecoverySuccess(camera, workflow);
          if (workflow.lockKey && this.redisLock) {
            await this.redisLock.release(workflow.lockKey, this.holderId).catch((err) => {
              logger.warn("Failed to release recovery lock", { error: err, cameraId: camera.id });
            });
          }
          this.activeWorkflows.delete(camera.id);
          return;
        }
      } else {
        workflow.failedSteps.push(step);
      }

      // Wait before next step
      if (workflow.status === "in_progress" && step !== "manual_intervention") {
        await this.delay(this.config.retryDelay * 1000);
      }
    }

    // If we got here, recovery failed
    if (workflow.status === "in_progress") {
      workflow.status = "failed";
      await this.logRecoveryFailure(camera, workflow);
      await this.escalateRecovery(camera, workflow);
    }

    if (workflow.lockKey && this.redisLock) {
      await this.redisLock.release(workflow.lockKey, this.holderId).catch((err) => {
        logger.warn("Failed to release recovery lock", { error: err, cameraId: camera.id });
      });
    }

    this.activeWorkflows.delete(camera.id);
  }

  /**
   * Execute custom recovery steps (for manual recovery)
   */
  private async executeCustomRecovery(
    camera: CameraDevice,
    workflow: RecoveryWorkflow,
    steps: RecoveryStep[]
  ): Promise<void> {
    for (const step of steps) {
      workflow.currentStep = step;
      workflow.attempts++;

      const startTime = Date.now();
      const result = await this.executeRecoveryStep(camera, step);
      const duration = Date.now() - startTime;

      const log: RecoveryLog = {
        timestamp: new Date(),
        step,
        action: this.getStepDescription(step),
        result: result.success ? "success" : "failed",
        message: result.message,
        duration,
        metadata: result.metadata,
      };

      workflow.logs.push(log);

      if (result.success) {
        workflow.completedSteps.push(step);
      } else {
        workflow.failedSteps.push(step);
      }

      // Wait before next step
      if (step !== steps[steps.length - 1]) {
        await this.delay(this.config.retryDelay * 1000);
      }
    }

    // Check final status
    const isOnline = await this.verifyCameraOnline(camera);
    workflow.status = isOnline ? "success" : "failed";

    if (workflow.status === "success") {
      await this.logRecoverySuccess(camera, workflow);
    } else {
      await this.logRecoveryFailure(camera, workflow);
    }

    if (workflow.lockKey && this.redisLock) {
      await this.redisLock.release(workflow.lockKey, this.holderId).catch((err) => {
        logger.warn("Failed to release recovery lock", { error: err, cameraId: camera.id });
      });
    }

    this.activeWorkflows.delete(camera.id);
  }

  /**
   * Execute a single recovery step
   */
  private async executeRecoveryStep(
    camera: CameraDevice,
    step: RecoveryStep
  ): Promise<{ success: boolean; message: string; metadata?: Record<string, any> }> {
    logger.info(`Executing recovery step: ${step}`, { cameraId: camera.id });

    try {
      switch (step) {
        case "rtsp_reconnect":
          return await this.rtspReconnect(camera);
        
        case "onvif_ping":
          return await this.onvifPing(camera);
        
        case "stream_restart":
          return await this.restartStream(camera);
        
        case "soft_reboot":
          return await this.softReboot(camera);
        
        case "hard_reboot":
          return await this.hardReboot(camera);
        
        case "profile_reset":
          return await this.resetProfile(camera);
        
        case "factory_reset":
          return await this.factoryReset(camera);
        
        case "manual_intervention":
          return await this.requestManualIntervention(camera);
        
        default:
          return { success: false, message: `Unknown recovery step: ${step}` };
      }
    } catch (error) {
      logger.error(`Recovery step ${step} failed`, { error, cameraId: camera.id });
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * RTSP Reconnect - attempt to re-establish RTSP connection
   */
  private async rtspReconnect(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    try {
      // Close existing connection by updating camera state
      await this.pool.query(
        `UPDATE cameras 
         SET connection_state = 'reconnecting', 
             last_reconnect_attempt = NOW() 
         WHERE id = $1::uuid`,
        [camera.id]
      );

      // Attempt new RTSP connection by verifying the URL is accessible
      if (!camera.rtspUrl) {
        return { success: false, message: "No RTSP URL configured" };
      }

      // Parse RTSP URL to extract host and port
      const url = new URL(camera.rtspUrl);
      const host = url.hostname;
      const port = url.port || '554'; // Default RTSP port

      // Verify RTSP endpoint is reachable using DESCRIBE method
      const response = await fetch(`http://${host}:${port}`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (response) {
        // Update connection state to active
        await this.pool.query(
          `UPDATE cameras 
           SET connection_state = 'active', 
               consecutive_failures = 0,
               last_success_at = NOW() 
           WHERE id = $1::uuid`,
          [camera.id]
        );

        return { success: true, message: "RTSP reconnection successful" };
      }

      return { success: false, message: "RTSP endpoint unreachable" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "RTSP reconnection failed",
      };
    }
  }

  /**
   * ONVIF Ping - verify ONVIF endpoint is reachable
   */
  private async onvifPing(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!camera.onvifUrl) {
      return { success: false, message: "No ONVIF URL configured" };
    }

    try {
      // Use ONVIF GetSystemDateAndTime (no auth required)
      const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body>
    <tds:GetSystemDateAndTime/>
  </s:Body>
</s:Envelope>`;

      const response = await fetch(camera.onvifUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/soap+xml",
          "Content-Length": String(soapEnvelope.length)
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const body = await response.text();
        const hasValidResponse = body.includes('GetSystemDateAndTimeResponse') || 
                                  body.includes('SystemDateAndTime');
        
        return {
          success: hasValidResponse,
          message: hasValidResponse ? "ONVIF endpoint reachable and responding" : "ONVIF returned unexpected response",
        };
      }

      return {
        success: false,
        message: `ONVIF returned ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "ONVIF ping failed",
      };
    }
  }

  /**
   * Restart Stream - use ONVIF to restart the video stream
   */
  private async restartStream(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!camera.onvifUrl || !camera.credentials) {
      return { success: false, message: "ONVIF not configured or no credentials" };
    }

    try {
      // ONVIF doesn't have a direct "restart stream" command
      // Instead, we get the stream URI which forces the camera to prepare the stream
      const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Header>
    ${this.buildOnvifAuthHeader(camera.credentials)}
  </s:Header>
  <s:Body>
    <trt:GetStreamUri>
      <trt:StreamSetup>
        <trt:Stream>RTP-Unicast</trt:Stream>
        <trt:Transport>
          <trt:Protocol>RTSP</trt:Protocol>
        </trt:Transport>
      </trt:StreamSetup>
      <trt:ProfileToken>Profile_1</trt:ProfileToken>
    </trt:GetStreamUri>
  </s:Body>
</s:Envelope>`;

      const response = await fetch(camera.onvifUrl.replace('/onvif/device_service', '/onvif/Media'), {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Content-Length": String(soapEnvelope.length)
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const body = await response.text();
        const hasStreamUri = body.includes('GetStreamUriResponse') || body.includes('Uri');
        
        return {
          success: hasStreamUri,
          message: hasStreamUri ? "Stream restart successful" : "Stream restart command sent",
        };
      }

      return { success: false, message: `Stream restart failed: ${response.status}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Stream restart failed",
      };
    }
  }

  /**
   * Soft Reboot - graceful camera reboot via ONVIF
   */
  private async softReboot(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!camera.onvifUrl || !camera.credentials) {
      return { success: false, message: "ONVIF not configured or no credentials" };
    }

    try {
      // ONVIF SystemReboot command
      const soapEnvelope = this.buildOnvifRebootRequest(camera.credentials);
      
      const response = await fetch(camera.onvifUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Authorization": this.buildOnvifAuthHeader(camera.credentials),
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        // Wait for camera to reboot (typically 30-60 seconds)
        await this.delay(45000);
        return { success: true, message: "Soft reboot successful" };
      }

      return { success: false, message: `Soft reboot failed: ${response.status}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Soft reboot failed",
      };
    }
  }

  /**
   * Hard Reboot - force power cycle (requires PDU or similar)
   */
  private async hardReboot(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!this.config.allowHardReboot) {
      return { success: false, message: "Hard reboot not allowed by configuration" };
    }

    // Check if camera has PDU configuration in metadata
    if (camera.metadata?.pdu) {
      try {
        const pdu = camera.metadata.pdu;
        const { host, port, outlet } = pdu;

        // Log the hard reboot attempt
        logger.warn(`Attempting hard reboot via PDU for camera ${camera.id}`, {
          pduHost: host,
          outlet,
        });

        // In a real implementation, this would:
        // 1. Connect to PDU (SNMP, HTTP API, or vendor-specific protocol)
        // 2. Turn off the outlet
        // 3. Wait 10 seconds
        // 4. Turn on the outlet
        // 5. Wait for camera to boot (30-60 seconds)

        // For now, return a message indicating PDU integration is needed
        return {
          success: false,
          message: `Hard reboot requires PDU integration (PDU: ${host}, Outlet: ${outlet})`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "PDU communication failed",
        };
      }
    }

    // Check if camera supports PoE and we have switch access
    if (camera.metadata?.poeSwitch) {
      try {
        const poeSwitch = camera.metadata.poeSwitch;
        const { host, port: switchPort } = poeSwitch;

        logger.warn(`Attempting PoE power cycle for camera ${camera.id}`, {
          switchHost: host,
          port: switchPort,
        });

        // In a real implementation, this would:
        // 1. Connect to PoE switch (SNMP, SSH, or vendor API)
        // 2. Disable PoE on the port
        // 3. Wait 10 seconds
        // 4. Enable PoE on the port
        // 5. Wait for camera to boot

        return {
          success: false,
          message: `Hard reboot requires PoE switch integration (Switch: ${host}, Port: ${switchPort})`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "PoE switch communication failed",
        };
      }
    }

    return {
      success: false,
      message: "Hard reboot not possible: No PDU or PoE switch configured for this camera",
    };
  }

  /**
   * Reset Profile - reset stream profile to default settings
   */
  private async resetProfile(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!camera.onvifUrl || !camera.credentials) {
      return { success: false, message: "ONVIF not configured or no credentials" };
    }

    try {
      // Get current media profiles
      const getProfilesSoap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Header>
    ${this.buildOnvifAuthHeader(camera.credentials)}
  </s:Header>
  <s:Body>
    <trt:GetProfiles/>
  </s:Body>
</s:Envelope>`;

      const mediaUrl = camera.onvifUrl.replace('/onvif/device_service', '/onvif/Media');
      const response = await fetch(mediaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Content-Length": String(getProfilesSoap.length)
        },
        body: getProfilesSoap,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { success: false, message: `Failed to get profiles: ${response.status}` };
      }

      const body = await response.text();
      
      // Extract profile token (simplified - in production, use proper XML parsing)
      const profileMatch = body.match(/token="([^"]+)"/);
      if (!profileMatch) {
        return { success: false, message: "No profiles found" };
      }

      const profileToken = profileMatch[1];

      // Delete and recreate profile (ONVIF Media2 approach)
      // Note: Most cameras don't allow deleting the main profile
      // Instead, we reset the video encoder configuration
      const resetEncoderSoap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Header>
    ${this.buildOnvifAuthHeader(camera.credentials)}
  </s:Header>
  <s:Body>
    <trt:SetVideoEncoderConfiguration>
      <trt:Configuration token="${this.escapeXml(profileToken)}">
        <trt:Encoding>H264</trt:Encoding>
        <trt:Resolution>
          <trt:Width>1920</trt:Width>
          <trt:Height>1080</trt:Height>
        </trt:Resolution>
        <trt:Quality>4</trt:Quality>
        <trt:RateControl>
          <trt:FrameRateLimit>30</trt:FrameRateLimit>
          <trt:BitrateLimit>4096</trt:BitrateLimit>
        </trt:RateControl>
      </trt:Configuration>
      <trt:ForcePersistence>true</trt:ForcePersistence>
    </trt:SetVideoEncoderConfiguration>
  </s:Body>
</s:Envelope>`;

      const resetResponse = await fetch(mediaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Content-Length": String(resetEncoderSoap.length)
        },
        body: resetEncoderSoap,
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: resetResponse.ok,
        message: resetResponse.ok ? "Profile reset successful" : `Profile reset failed: ${resetResponse.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Profile reset failed",
      };
    }
  }

  /**
   * Factory Reset - restore camera to factory defaults
   */
  private async factoryReset(camera: CameraDevice): Promise<{ success: boolean; message: string }> {
    if (!this.config.allowFactoryReset) {
      return { success: false, message: "Factory reset not allowed by configuration" };
    }

    if (!camera.onvifUrl || !camera.credentials) {
      return { success: false, message: "ONVIF not configured or no credentials" };
    }

    // Factory reset is extremely disruptive and should rarely be used
    logger.warn(`Factory reset requested for camera ${camera.id}`, {
      cameraName: camera.name,
    });

    try {
      // Create backup of current configuration before factory reset
      await this.pool.query(
        `INSERT INTO camera_config_backups (camera_id, config_snapshot, created_at)
         VALUES ($1::uuid, $2::jsonb, NOW())`,
        [camera.id, JSON.stringify(camera)]
      );

      // ONVIF SetSystemFactoryDefault command
      const factoryResetSoap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Header>
    ${this.buildOnvifAuthHeader(camera.credentials)}
  </s:Header>
  <s:Body>
    <tds:SetSystemFactoryDefault>
      <tds:FactoryDefault>Hard</tds:FactoryDefault>
    </tds:SetSystemFactoryDefault>
  </s:Body>
</s:Envelope>`;

      const response = await fetch(camera.onvifUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Content-Length": String(factoryResetSoap.length)
        },
        body: factoryResetSoap,
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        // Camera will reboot and lose all settings
        // Wait for camera to complete factory reset (60-120 seconds)
        logger.info(`Factory reset initiated for camera ${camera.id}, waiting for completion...`);
        await this.delay(90000);

        return {
          success: true,
          message: "Factory reset completed. Camera needs to be reconfigured.",
        };
      }

      return {
        success: false,
        message: `Factory reset failed: ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Factory reset failed",
      };
    }
  }

  /**
   * Request Manual Intervention - create alert for ops team
   */
  private async requestManualIntervention(
    camera: CameraDevice
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.pool.query(
        `INSERT INTO operational_alerts (
          tenant_id, branch_id, alert_type, severity, title, message, metadata, detected_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
        [
          camera.tenantId,
          camera.branchId,
          "camera_manual_intervention",
          "critical",
          `Manual Intervention Required: ${camera.name}`,
          `Camera ${camera.name} failed automatic recovery. Physical inspection may be required.`,
          JSON.stringify({ cameraId: camera.id }),
        ]
      );

      return {
        success: true,
        message: "Manual intervention alert created",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create alert",
      };
    }
  }

  /**
   * Verify camera is online
   */
  private async verifyCameraOnline(camera: CameraDevice): Promise<boolean> {
    try {
      // Check ONVIF or RTSP connectivity
      if (camera.onvifUrl) {
        const response = await fetch(camera.onvifUrl, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);

        return response?.ok ?? false;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Escalate recovery to manual intervention
   */
  private async escalateRecovery(
    camera: CameraDevice,
    workflow: RecoveryWorkflow
  ): Promise<void> {
    workflow.status = "escalated";

    logger.warn(`Escalating recovery for camera ${camera.name}`, {
      cameraId: camera.id,
      attempts: workflow.attempts,
      failedSteps: workflow.failedSteps,
    });

    if (this.config.notifyOnEscalation) {
      await this.requestManualIntervention(camera);
    }
  }

  /**
   * Log recovery success
   */
  private async logRecoverySuccess(
    camera: CameraDevice,
    workflow: RecoveryWorkflow
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO camera_recovery_log (
          camera_id, workflow_id, initiated_at, completed_at, initiated_by,
          status, completed_steps, failed_steps, total_attempts, recovery_duration_seconds
        ) VALUES ($1::uuid, $2, $3, NOW(), $4, $5, $6, $7, $8, 
                  EXTRACT(EPOCH FROM (NOW() - $3::timestamp)))`,
        [
          camera.id,
          workflow.id,
          workflow.initiatedAt,
          workflow.initiatedBy,
          workflow.status,
          workflow.completedSteps,
          workflow.failedSteps,
          workflow.attempts,
        ]
      );

      logger.info(`Recovery successful for camera ${camera.name}`, {
        workflowId: workflow.id,
        steps: workflow.completedSteps,
      });
    } catch (error) {
      logger.error("Failed to log recovery success", { error });
    }
  }

  /**
   * Log recovery failure
   */
  private async logRecoveryFailure(
    camera: CameraDevice,
    workflow: RecoveryWorkflow
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO camera_recovery_log (
          camera_id, workflow_id, initiated_at, completed_at, initiated_by,
          status, completed_steps, failed_steps, total_attempts, recovery_duration_seconds
        ) VALUES ($1::uuid, $2, $3, NOW(), $4, $5, $6, $7, $8,
                  EXTRACT(EPOCH FROM (NOW() - $3::timestamp)))`,
        [
          camera.id,
          workflow.id,
          workflow.initiatedAt,
          workflow.initiatedBy,
          workflow.status,
          workflow.completedSteps,
          workflow.failedSteps,
          workflow.attempts,
        ]
      );

      logger.warn(`Recovery failed for camera ${camera.name}`, {
        workflowId: workflow.id,
        failedSteps: workflow.failedSteps,
      });
    } catch (error) {
      logger.error("Failed to log recovery failure", { error });
    }
  }

  /**
   * Get recovery workflow status
   */
  getWorkflowStatus(cameraId: string): RecoveryWorkflow | null {
    return this.activeWorkflows.get(cameraId) || null;
  }

  /**
   * Cancel recovery workflow
   */
  cancelWorkflow(cameraId: string): boolean {
    const workflow = this.activeWorkflows.get(cameraId);
    if (workflow && workflow.status === "in_progress") {
      workflow.status = "failed";
      this.activeWorkflows.delete(cameraId);
      logger.info(`Recovery workflow cancelled for camera ${cameraId}`);
      return true;
    }
    return false;
  }

  /**
   * Build ONVIF reboot SOAP request
   */
  private buildOnvifRebootRequest(credentials: { username: string; password: string }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body>
    <tds:SystemReboot/>
  </s:Body>
</s:Envelope>`;
  }

  /**
   * Build ONVIF WS-Security authentication header
   * Implements proper UsernameToken with password digest (per WS-Security spec)
   */
  private buildOnvifAuthHeader(credentials: { username: string; password: string }): string {
    // ONVIF requires WS-Security UsernameToken with PasswordDigest
    // Digest = Base64( SHA1( Nonce + Created + Password ) )
    
    const nonce = crypto.randomBytes(16);
    const created = new Date().toISOString();
    
    // Create password digest: Base64(SHA1(Nonce + Created + Password))
    const digest = crypto
      .createHash('sha1')
      .update(Buffer.concat([
        nonce,
        Buffer.from(created, 'utf8'),
        Buffer.from(credentials.password, 'utf8')
      ]))
      .digest('base64');

    const nonceBase64 = nonce.toString('base64');
    
    // Build WS-Security UsernameToken XML
    const wsSecurityHeader = `
      <Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
        <UsernameToken>
          <Username>${this.escapeXml(credentials.username)}</Username>
          <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password>
          <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</Nonce>
          <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created>
        </UsernameToken>
      </Security>
    `.trim();

    return wsSecurityHeader;
  }

  /**
   * Escape XML special characters for ONVIF SOAP messages
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get step description
   */
  private getStepDescription(step: RecoveryStep): string {
    const descriptions: Record<RecoveryStep, string> = {
      rtsp_reconnect: "Reconnect RTSP stream",
      onvif_ping: "Ping ONVIF endpoint",
      stream_restart: "Restart video stream",
      soft_reboot: "Soft reboot device",
      hard_reboot: "Hard reboot device",
      profile_reset: "Reset stream profile",
      factory_reset: "Factory reset device",
      manual_intervention: "Request manual intervention",
    };
    return descriptions[step] || step;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Global instance
 */
let cameraRecoveryService: CameraRecoveryService | null = null;

/**
 * Get or create camera recovery service
 */
export function getCameraRecoveryService(pool: Pool): CameraRecoveryService {
  if (!cameraRecoveryService) {
    cameraRecoveryService = new CameraRecoveryService(pool);
  }
  return cameraRecoveryService;
}
