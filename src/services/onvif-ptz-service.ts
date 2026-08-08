/**
 * ONVIF PTZ Service
 * Handles PTZ commands via ONVIF protocol with real camera control
 */

import type { Pool } from "pg";
import type {
  PtzCommand,
  PtzDirection,
  PtzZoomAction,
  PtzFocusAction,
  PtzCapabilities,
  PtzOperationResult,
} from "../domain/ptz.js";
import { OnvifPtzClient } from "./onvif-ptz-client.js";
import { CameraCredentialResolver } from "./camera-credential-resolver.js";

/**
 * Cache entry for PTZ clients to avoid re-initialization
 */
interface PtzClientCacheEntry {
  client: OnvifPtzClient;
  profileToken: string;
  createdAt: number;
}

export class OnvifPtzService {
  private clientCache = new Map<string, PtzClientCacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private credentialResolver: CameraCredentialResolver;

  constructor(private readonly pool: Pool) {
    this.credentialResolver = new CameraCredentialResolver(pool);
    
    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupCache(), 60_000);
  }

  /**
   * Execute PTZ command via ONVIF
   */
  async executeCommand(
    connectionSecretRef: string,
    command: PtzCommand,
  ): Promise<PtzOperationResult> {
    const startTime = Date.now();

    // Validate command
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      return {
        status: "failed",
        message: validation.error,
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Get or create PTZ client
    const clientResult = await this.getPtzClient(connectionSecretRef, command.cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
      };
    }

    const { client, profileToken } = clientResult;

    // Execute command
    let result: PtzOperationResult;
    try {
      result = await this.executeCommandInternal(client, command, profileToken);
    } catch (error) {
      result = {
        status: "failed",
        message: "PTZ command execution failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    // Add execution metadata
    result.timestamp = new Date().toISOString();
    result.executionTimeMs = Date.now() - startTime;

    return result;
  }

  /**
   * Get PTZ capabilities from camera
   */
  async getCapabilities(
    connectionSecretRef: string,
    cameraId: string,
  ): Promise<PtzCapabilities> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      throw new Error(clientResult.error || "Failed to connect to camera");
    }

    return await clientResult.client.getCapabilities(clientResult.profileToken);
  }

  /**
   * Get current PTZ position
   */
  async getPosition(
    connectionSecretRef: string,
    cameraId: string,
  ): Promise<{
    pan: number;
    tilt: number;
    zoom: number;
  } | null> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return null;
    }

    return await clientResult.client.getPosition(clientResult.profileToken);
  }

  /**
   * Move to absolute position
   */
  async moveAbsolute(
    connectionSecretRef: string,
    cameraId: string,
    pan: number,
    tilt: number,
    zoom: number,
    speed?: number,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.moveAbsolute(
      pan,
      tilt,
      zoom,
      speed,
      clientResult.profileToken,
    );
  }

  /**
   * Move continuously in direction
   */
  async moveContinuous(
    connectionSecretRef: string,
    cameraId: string,
    panSpeed: number,
    tiltSpeed: number,
    zoomSpeed: number,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.moveContinuous(
      panSpeed,
      tiltSpeed,
      zoomSpeed,
      clientResult.profileToken,
    );
  }

  /**
   * Stop all PTZ movement
   */
  async stop(
    connectionSecretRef: string,
    cameraId: string,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.stop(clientResult.profileToken);
  }

  /**
   * Go to preset position
   */
  async gotoPreset(
    connectionSecretRef: string,
    cameraId: string,
    presetToken: string,
    speed?: number,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.gotoPreset(
      presetToken,
      speed,
      clientResult.profileToken,
    );
  }

  /**
   * Set current position as preset
   */
  async setPreset(
    connectionSecretRef: string,
    cameraId: string,
    presetName: string,
    presetToken?: string,
  ): Promise<PtzOperationResult & { presetToken?: string }> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.setPreset(
      presetName,
      presetToken,
      clientResult.profileToken,
    );
  }

  /**
   * Delete preset
   */
  async removePreset(
    connectionSecretRef: string,
    cameraId: string,
    presetToken: string,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.removePreset(
      presetToken,
      clientResult.profileToken,
    );
  }

  /**
   * List available presets from camera
   */
  async listPresets(
    connectionSecretRef: string,
    cameraId: string,
  ): Promise<Array<{
    token: string;
    name: string;
    position?: { pan: number; tilt: number; zoom: number };
  }>> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return [];
    }

    return await clientResult.client.listPresets(clientResult.profileToken);
  }

  /**
   * Go to home position
   */
  async gotoHome(
    connectionSecretRef: string,
    cameraId: string,
    speed?: number,
  ): Promise<PtzOperationResult> {
    const clientResult = await this.getPtzClient(connectionSecretRef, cameraId);
    if (clientResult.success === false) {
      return {
        status: "failed",
        message: clientResult.error || "Failed to connect to camera",
      };
    }

    return await clientResult.client.gotoHome(speed, clientResult.profileToken);
  }

  // ========== Private Helper Methods ==========

  /**
   * Validate PTZ command
   */
  private validateCommand(command: PtzCommand): { valid: boolean; error?: string } {
    if (!command.cameraId) {
      return { valid: false, error: "Camera ID required" };
    }

    if (command.action === "move" && !command.direction) {
      return { valid: false, error: "Direction required for move command" };
    }

    if (command.action === "zoom" && !command.zoomAction) {
      return { valid: false, error: "Zoom action required" };
    }

    if (command.action === "preset" && !command.presetId) {
      return { valid: false, error: "Preset ID required" };
    }

    if (command.action === "patrol" && !command.patrolId) {
      return { valid: false, error: "Patrol ID required" };
    }

    return { valid: true };
  }

  /**
   * Execute command internally using PTZ client
   */
  private async executeCommandInternal(
    client: OnvifPtzClient,
    command: PtzCommand,
    profileToken: string,
  ): Promise<PtzOperationResult> {
    const speed = command.speed ? {
      pan: command.speed.pan ?? 0.5,
      tilt: command.speed.tilt ?? 0.5,
      zoom: command.speed.zoom ?? 0.5,
    } : undefined;

    switch (command.action) {
      case "move": {
        const { panSpeed, tiltSpeed } = this.directionToSpeed(command.direction!);
        return await client.moveContinuous(panSpeed, tiltSpeed, 0, profileToken);
      }

      case "zoom": {
        const zoomSpeed = this.zoomActionToSpeed(command.zoomAction!);
        return await client.moveContinuous(0, 0, zoomSpeed, profileToken);
      }

      case "stop":
        return await client.stop(profileToken);

      case "preset":
        if (command.presetId !== undefined) {
          return await client.gotoPreset(
            `preset${command.presetId}`,
            speed?.pan,
            profileToken,
          );
        }
        return { status: "failed", message: "Preset ID required" };

      case "home":
        return await client.gotoHome(speed?.pan, profileToken);

      case "patrol":
        return {
          status: "unsupported",
          message: "Patrols are vendor-specific and not yet implemented",
        };

      case "focus":
        return {
          status: "unsupported",
          message: "Focus control is typically handled by imaging service",
        };

      default:
        return {
          status: "failed",
          message: `Unknown action: ${command.action}`,
        };
    }
  }

  /**
   * Convert direction to pan/tilt speeds
   */
  private directionToSpeed(direction: PtzDirection): {
    panSpeed: number;
    tiltSpeed: number;
  } {
    const speed = 0.5; // Default speed
    switch (direction) {
      case "left":
        return { panSpeed: -speed, tiltSpeed: 0 };
      case "right":
        return { panSpeed: speed, tiltSpeed: 0 };
      case "up":
        return { panSpeed: 0, tiltSpeed: speed };
      case "down":
        return { panSpeed: 0, tiltSpeed: -speed };
    }
  }

  /**
   * Convert zoom action to zoom speed
   */
  private zoomActionToSpeed(action: PtzZoomAction): number {
    switch (action) {
      case "in":
        return 0.5;
      case "out":
        return -0.5;
      case "stop":
        return 0;
    }
  }

  /**
   * Get or create PTZ client with caching
   */
  private async getPtzClient(
    connectionSecretRef: string,
    cameraId: string,
  ): Promise<
    | { success: true; client: OnvifPtzClient; profileToken: string }
    | { success: false; error: string }
  > {
    // Check cache
    const cached = this.clientCache.get(cameraId);
    if (cached && Date.now() - cached.createdAt < this.CACHE_TTL_MS) {
      return {
        success: true,
        client: cached.client,
        profileToken: cached.profileToken,
      };
    }

    // Resolve credentials
    const connection = await this.credentialResolver.resolve(
      connectionSecretRef,
      cameraId,
    );

    if (!connection) {
      return {
        success: false,
        error: "Failed to resolve camera credentials",
      };
    }

    // Create and initialize client
    try {
      const client = new OnvifPtzClient(
        connection.onvifServiceUrl,
        connection.credentials,
        8000,
      );

      const initResult = await client.initialize();
      if (!initResult.ptzSupported || !initResult.profileToken) {
        return {
          success: false,
          error: "Camera does not support PTZ or has no PTZ profile",
        };
      }

      // Cache the client
      this.clientCache.set(cameraId, {
        client,
        profileToken: initResult.profileToken,
        createdAt: Date.now(),
      });

      return {
        success: true,
        client,
        profileToken: initResult.profileToken,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize PTZ client",
      };
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [cameraId, entry] of this.clientCache.entries()) {
      if (now - entry.createdAt >= this.CACHE_TTL_MS) {
        this.clientCache.delete(cameraId);
      }
    }
  }

  /**
   * Clear cached client for a camera (useful after credential updates)
   */
  clearCache(cameraId?: string): void {
    if (cameraId) {
      this.clientCache.delete(cameraId);
    } else {
      this.clientCache.clear();
    }
  }
}
