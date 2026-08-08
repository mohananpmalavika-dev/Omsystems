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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    if (!clientResult.success) {
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
    presetNumber: number,
  ): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ remove preset is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Remove preset ${presetNumber}`);
    // TODO: Execute ONVIF RemovePreset command (development simulation)
    return { success: true } as any;
  }

  /**
   * List available presets from camera
   */
  async listPresets(connectionSecretRef: string): Promise<Array<{
    number: number;
    name: string;
  }>> {
    if (!this.isSimulationAllowed()) {
      throw new Error('PTZ list presets is disabled in this deployment.');
    }

    // Development placeholder
    return [];
  }
}
