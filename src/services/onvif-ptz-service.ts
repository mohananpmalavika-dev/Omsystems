/**
 * ONVIF PTZ Service
 * Handles PTZ commands via ONVIF protocol
 */

import type {
  PtzCommand,
  PtzDirection,
  PtzZoomAction,
  PtzFocusAction,
  PtzCapabilities,
} from "../domain/ptz.js";

export class OnvifPtzService {
  private isSimulationAllowed(): boolean {
    return process.env.ALLOW_PTZ_SIMULATION === 'true';
  }
  /**
   * Execute PTZ command via ONVIF
   * In production, this would connect to the camera via ONVIF SOAP API
   */
  async executeCommand(
    connectionSecretRef: string,
    command: PtzCommand,
  ): Promise<{ success: boolean; message?: string }> {
    // Fail closed unless simulation explicitly allowed
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ commands are disabled in this deployment. Set ALLOW_PTZ_SIMULATION=true for development testing.' };
    }

    // Simulated execution for development only
    console.log(`[PTZ] Executing command for camera ${command.cameraId}:`, {
      action: command.action,
      direction: command.direction,
      speed: command.speed,
    });

    // Validate command
    if (command.action === "move" && !command.direction) {
      return { success: false, message: "Direction required for move command" };
    }

    if (command.action === "zoom" && !command.zoomAction) {
      return { success: false, message: "Zoom action required" };
    }

    if (command.action === "preset" && !command.presetId) {
      return { success: false, message: "Preset ID required" };
    }

    // Simulate ONVIF command execution (development only)
    return { success: true };
  }

  /**
   * Get PTZ capabilities from camera
   */
  async getCapabilities(connectionSecretRef: string): Promise<PtzCapabilities> {
    if (!this.isSimulationAllowed()) {
      // Fail closed - do not report capabilities when PTZ not configured
      throw new Error('PTZ capability query is disabled in this deployment.');
    }

    // Placeholder returning default capabilities for development
    return {
      pan: true,
      tilt: true,
      zoom: true,
      focus: true,
      iris: false,
      absoluteMove: true,
      relativeMove: true,
      continuousMove: true,
      presets: {
        supported: true,
        max: 128,
      },
      patrols: {
        supported: true,
        max: 8,
      },
      home: true,
      speedRange: {
        min: 0.1,
        max: 1.0,
      },
    };
  }

  /**
   * Get current PTZ position
   */
  async getPosition(connectionSecretRef: string): Promise<{
    pan: number;
    tilt: number;
    zoom: number;
  }> {
    if (!this.isSimulationAllowed()) {
      throw new Error('PTZ position query is disabled in this deployment.');
    }

    // Development placeholder
    return { pan: 0, tilt: 0, zoom: 0 };
  }

  /**
   * Move to absolute position
   */
  async moveAbsolute(
    connectionSecretRef: string,
    pan: number,
    tilt: number,
    zoom: number,
    speed?: number,
  ): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ absolute move is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Move to absolute position: pan=${pan}, tilt=${tilt}, zoom=${zoom}, speed=${speed}`);
    // TODO: Execute ONVIF AbsoluteMove command (development simulation)
    return { success: true } as any;
  }

  /**
   * Move continuously in direction
   */
  async moveContinuous(
    connectionSecretRef: string,
    panSpeed: number,
    tiltSpeed: number,
    zoomSpeed: number,
  ): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ continuous move is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Continuous move: pan=${panSpeed}, tilt=${tiltSpeed}, zoom=${zoomSpeed}`);
    // TODO: Execute ONVIF ContinuousMove command (development simulation)
    return { success: true } as any;
  }

  /**
   * Stop all PTZ movement
   */
  async stop(connectionSecretRef: string): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ stop is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Stop all movement`);
    // TODO: Execute ONVIF Stop command (development simulation)
    return { success: true } as any;
  }

  /**
   * Go to preset position
   */
  async gotoPreset(
    connectionSecretRef: string,
    presetNumber: number,
    speed?: number,
  ): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ goto preset is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Go to preset ${presetNumber}, speed=${speed}`);
    // TODO: Execute ONVIF GotoPreset command (development simulation)
    return { success: true } as any;
  }

  /**
   * Set current position as preset
   */
  async setPreset(
    connectionSecretRef: string,
    presetNumber: number,
    name?: string,
  ): Promise<{ success: boolean }> {
    if (!this.isSimulationAllowed()) {
      return { success: false, message: 'PTZ set preset is disabled in this deployment.' } as any;
    }

    console.log(`[PTZ] Set preset ${presetNumber}, name=${name}`);
    // TODO: Execute ONVIF SetPreset command (development simulation)
    return { success: true } as any;
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
