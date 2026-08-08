/**
 * ONVIF PTZ Client
 * Handles PTZ-specific SOAP commands and operations
 */

import { OnvifClient, type OnvifCredentials } from "../../edge-agent/src/devices/onvif-client.js";
import type { PtzDirection, PtzCapabilities } from "../domain/ptz.js";

export type PtzOperationStatus = 
  | "accepted" 
  | "executing" 
  | "succeeded" 
  | "failed" 
  | "timed_out" 
  | "unsupported";

export interface PtzOperationResult {
  status: PtzOperationStatus;
  message?: string;
  detail?: string;
  vendorSpecific?: boolean;
}

export interface PtzPosition {
  pan: number;
  tilt: number;
  zoom: number;
}

export interface PtzPresetInfo {
  token: string;
  name: string;
  position?: PtzPosition;
}

export class OnvifPtzClient extends OnvifClient {
  private ptzServiceUrl?: string;
  private defaultProfileToken?: string;

  constructor(
    deviceServiceUrl: string,
    credentials: OnvifCredentials,
    timeoutMs = 8000,
  ) {
    super(deviceServiceUrl, credentials, timeoutMs);
  }

  /**
   * Initialize PTZ service by discovering PTZ endpoint and default profile
   */
  async initialize(): Promise<{ ptzSupported: boolean; profileToken?: string }> {
    try {
      const device = await this.inspect();
      
      if (!device.capabilities.ptz) {
        return { ptzSupported: false };
      }

      // Try to get PTZ service URL from capabilities
      this.ptzServiceUrl = await this.getPtzServiceUrl();
      
      // Find first profile with PTZ configuration
      this.defaultProfileToken = device.profiles[0]?.token;
      
      if (!this.ptzServiceUrl || !this.defaultProfileToken) {
        return { ptzSupported: false };
      }

      return { 
        ptzSupported: true, 
        profileToken: this.defaultProfileToken 
      };
    } catch (error) {
      return { ptzSupported: false };
    }
  }

  /**
   * Get PTZ service URL from device capabilities
   */
  private async getPtzServiceUrl(): Promise<string | undefined> {
    try {
      const capabilities = await this.callOnvif(
        (this as any).deviceServiceUrl,
        "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
        `<tds:GetCapabilities><tds:Category>PTZ</tds:Category></tds:GetCapabilities>`,
        `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`,
      );

      const caps = this.findRecord(capabilities, "Capabilities");
      const ptz = this.recordValue(caps?.PTZ);
      return this.textValue(ptz?.["@_XAddr"]) ?? this.textValue(ptz?.XAddr);
    } catch {
      // Fallback to guessed PTZ service URL
      const deviceUrl = new URL((this as any).deviceServiceUrl);
      return new URL("/onvif/ptz", deviceUrl).toString();
    }
  }

  /**
   * Get PTZ capabilities
   */
  async getCapabilities(profileToken?: string): Promise<PtzCapabilities> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      throw new Error("No profile token available for PTZ capabilities");
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      throw new Error("PTZ service not available");
    }

    try {
      const document = await this.callOnvif(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/GetConfigurations",
        `<tptz:GetConfigurations/>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      const response = this.findRecord(document, "GetConfigurationsResponse");
      const configs = this.arrayValue(response?.PTZConfiguration);
      const config = this.recordValue(configs[0]);

      return this.parseCapabilities(config);
    } catch (error) {
      // Fallback to basic capabilities
      return this.getBasicCapabilities();
    }
  }

  /**
   * Move to absolute position
   */
  async moveAbsolute(
    pan: number,
    tilt: number,
    zoom: number,
    speed?: number,
    profileToken?: string,
  ): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      const speedValue = speed ?? 0.5;
      await this.callOnvif(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/AbsoluteMove",
        `<tptz:AbsoluteMove>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:Position>
            <tt:PanTilt x="${pan}" y="${tilt}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            <tt:Zoom x="${zoom}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
          </tptz:Position>
          <tptz:Speed>
            <tt:PanTilt x="${speedValue}" y="${speedValue}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            <tt:Zoom x="${speedValue}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
          </tptz:Speed>
        </tptz:AbsoluteMove>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: "Absolute move command executed" 
      };
    } catch (error) {
      return this.handlePtzError(error, "absolute move");
    }
  }

  /**
   * Move continuously in direction
   */
  async moveContinuous(
    panSpeed: number,
    tiltSpeed: number,
    zoomSpeed: number,
    profileToken?: string,
  ): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      await this.call(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove",
        `<tptz:ContinuousMove>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:Velocity>
            <tt:PanTilt x="${panSpeed}" y="${tiltSpeed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            <tt:Zoom x="${zoomSpeed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
          </tptz:Velocity>
        </tptz:ContinuousMove>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: "Continuous move command executed" 
      };
    } catch (error) {
      return this.handlePtzError(error, "continuous move");
    }
  }

  /**
   * Stop all PTZ movement
   */
  async stop(profileToken?: string): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      await this.call(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/Stop",
        `<tptz:Stop>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:PanTilt>true</tptz:PanTilt>
          <tptz:Zoom>true</tptz:Zoom>
        </tptz:Stop>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: "Stop command executed" 
      };
    } catch (error) {
      return this.handlePtzError(error, "stop");
    }
  }

  /**
   * Get current PTZ position
   */
  async getPosition(profileToken?: string): Promise<PtzPosition | null> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token || !this.ptzServiceUrl) {
      return null;
    }

    try {
      const document = await this.callOnvif(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/GetStatus",
        `<tptz:GetStatus>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
        </tptz:GetStatus>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      const response = this.findRecord(document, "GetStatusResponse");
      const status = this.recordValue(response?.PTZStatus);
      const position = this.recordValue(status?.Position);
      const panTilt = this.recordValue(position?.PanTilt);
      const zoom = this.recordValue(position?.Zoom);

      return {
        pan: this.numberValue(panTilt?.["@_x"] ?? panTilt?.x),
        tilt: this.numberValue(panTilt?.["@_y"] ?? panTilt?.y),
        zoom: this.numberValue(zoom?.["@_x"] ?? zoom?.x),
      };
    } catch {
      return null;
    }
  }

  /**
   * Go to preset position
   */
  async gotoPreset(
    presetToken: string,
    speed?: number,
    profileToken?: string,
  ): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      const speedXml = speed 
        ? `<tptz:Speed>
            <tt:PanTilt x="${speed}" y="${speed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            <tt:Zoom x="${speed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
          </tptz:Speed>`
        : "";

      await this.call(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/GotoPreset",
        `<tptz:GotoPreset>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:PresetToken>${this.escapeXml(presetToken)}</tptz:PresetToken>
          ${speedXml}
        </tptz:GotoPreset>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: `Moved to preset ${presetToken}` 
      };
    } catch (error) {
      return this.handlePtzError(error, "goto preset");
    }
  }

  /**
   * Set current position as preset
   */
  async setPreset(
    presetName: string,
    presetToken?: string,
    profileToken?: string,
  ): Promise<PtzOperationResult & { presetToken?: string }> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      const presetTokenXml = presetToken 
        ? `<tptz:PresetToken>${this.escapeXml(presetToken)}</tptz:PresetToken>`
        : "";

      const document = await this.callOnvif(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/SetPreset",
        `<tptz:SetPreset>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:PresetName>${this.escapeXml(presetName)}</tptz:PresetName>
          ${presetTokenXml}
        </tptz:SetPreset>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      const response = this.findRecord(document, "SetPresetResponse");
      const newPresetToken = this.textValue(response?.PresetToken);

      return { 
        status: "succeeded", 
        message: `Preset ${presetName} saved`,
        presetToken: newPresetToken ?? undefined,
      };
    } catch (error) {
      return this.handlePtzError(error, "set preset");
    }
  }

  /**
   * Remove preset
   */
  async removePreset(
    presetToken: string,
    profileToken?: string,
  ): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      await this.call(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/RemovePreset",
        `<tptz:RemovePreset>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          <tptz:PresetToken>${this.escapeXml(presetToken)}</tptz:PresetToken>
        </tptz:RemovePreset>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: `Preset ${presetToken} removed` 
      };
    } catch (error) {
      return this.handlePtzError(error, "remove preset");
    }
  }

  /**
   * List all presets
   */
  async listPresets(profileToken?: string): Promise<PtzPresetInfo[]> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token || !this.ptzServiceUrl) {
      return [];
    }

    try {
      const document = await this.callOnvif(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/GetPresets",
        `<tptz:GetPresets>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
        </tptz:GetPresets>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      const response = this.findRecord(document, "GetPresetsResponse");
      const presets = this.arrayValue(response?.Preset);

      return presets.map((preset) => {
        const presetRecord = this.recordValue(preset);
        const position = this.recordValue(presetRecord?.Position);
        const panTilt = this.recordValue(position?.PanTilt);
        const zoom = this.recordValue(position?.Zoom);

        return {
          token: this.textValue(presetRecord?.["@_token"]) ?? "",
          name: this.textValue(presetRecord?.Name) ?? "",
          position: position ? {
            pan: this.numberValue(panTilt?.["@_x"] ?? panTilt?.x),
            tilt: this.numberValue(panTilt?.["@_y"] ?? panTilt?.y),
            zoom: this.numberValue(zoom?.["@_x"] ?? zoom?.x),
          } : undefined,
        };
      }).filter(p => p.token);
    } catch {
      return [];
    }
  }

  /**
   * Go to home position
   */
  async gotoHome(speed?: number, profileToken?: string): Promise<PtzOperationResult> {
    const token = profileToken ?? this.defaultProfileToken;
    if (!token) {
      return { 
        status: "failed", 
        message: "No profile token available" 
      };
    }

    if (!this.ptzServiceUrl) {
      await this.initialize();
    }

    if (!this.ptzServiceUrl) {
      return { 
        status: "unsupported", 
        message: "PTZ service not available" 
      };
    }

    try {
      const speedXml = speed 
        ? `<tptz:Speed>
            <tt:PanTilt x="${speed}" y="${speed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            <tt:Zoom x="${speed}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
          </tptz:Speed>`
        : "";

      await this.call(
        this.ptzServiceUrl,
        "http://www.onvif.org/ver20/ptz/wsdl/GotoHomePosition",
        `<tptz:GotoHomePosition>
          <tptz:ProfileToken>${this.escapeXml(token)}</tptz:ProfileToken>
          ${speedXml}
        </tptz:GotoHomePosition>`,
        `xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"`,
      );

      return { 
        status: "succeeded", 
        message: "Moved to home position" 
      };
    } catch (error) {
      return this.handlePtzError(error, "goto home");
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Call parent's protected call method using super
   */
  protected async callOnvif(url: string, action: string, body: string, namespaces: string): Promise<unknown> {
    // Call the parent class's call method directly
    return await (super as any).call(url, action, body, namespaces);
  }

  private findRecord(value: unknown, key: string): Record<string, unknown> | undefined {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = this.findRecord(child, key);
        if (found) return found;
      }
      return undefined;
    }
    const record = this.recordValue(value);
    if (!record) return undefined;
    const direct = this.recordValue(record[key]);
    if (direct) return direct;
    for (const child of Object.values(record)) {
      const found = this.findRecord(child, key);
      if (found) return found;
    }
    return undefined;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private arrayValue(value: unknown): unknown[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  private textValue(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return null;
  }

  private numberValue(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private escapeXml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  private parseCapabilities(config: Record<string, unknown> | undefined): PtzCapabilities {
    if (!config) {
      return this.getBasicCapabilities();
    }

    const panTiltLimits = this.recordValue(config.PanTiltLimits);
    const zoomLimits = this.recordValue(config.ZoomLimits);
    
    return {
      pan: Boolean(panTiltLimits),
      tilt: Boolean(panTiltLimits),
      zoom: Boolean(zoomLimits),
      focus: false, // Focus is typically separate from PTZ in ONVIF
      iris: false,  // Iris is typically in imaging service
      absoluteMove: Boolean(config.DefaultAbsolutePantTiltPositionSpace || config.DefaultAbsoluteZoomPositionSpace),
      relativeMove: Boolean(config.DefaultRelativePanTiltTranslationSpace || config.DefaultRelativeZoomTranslationSpace),
      continuousMove: Boolean(config.DefaultContinuousPanTiltVelocitySpace || config.DefaultContinuousZoomVelocitySpace),
      presets: {
        supported: true, // Most PTZ cameras support presets
        max: 128, // Common default
      },
      patrols: {
        supported: false, // Patrols are vendor-specific
        max: 0,
      },
      home: true, // Most PTZ cameras support home position
      speedRange: {
        min: 0.0,
        max: 1.0,
      },
    };
  }

  private getBasicCapabilities(): PtzCapabilities {
    return {
      pan: true,
      tilt: true,
      zoom: true,
      focus: false,
      iris: false,
      absoluteMove: true,
      relativeMove: false,
      continuousMove: true,
      presets: {
        supported: true,
        max: 128,
      },
      patrols: {
        supported: false,
        max: 0,
      },
      home: true,
      speedRange: {
        min: 0.0,
        max: 1.0,
      },
    };
  }

  private handlePtzError(error: unknown, operation: string): PtzOperationResult {
    const message = error instanceof Error ? error.message : String(error);
    
    // Check for timeout
    if (message.includes("timeout") || message.includes("aborted")) {
      return {
        status: "timed_out",
        message: `PTZ ${operation} timed out`,
        detail: message,
      };
    }

    // Check for unsupported operation
    if (message.includes("not supported") || 
        message.includes("ActionNotSupported") ||
        message.includes("OperationProhibited")) {
      return {
        status: "unsupported",
        message: `PTZ ${operation} not supported by camera`,
        detail: message,
      };
    }

    // Check for vendor-specific errors
    if (message.includes("vendor") || message.includes("proprietary")) {
      return {
        status: "failed",
        message: `PTZ ${operation} failed - vendor-specific behavior`,
        detail: message,
        vendorSpecific: true,
      };
    }

    // General failure
    return {
      status: "failed",
      message: `PTZ ${operation} failed`,
      detail: message,
    };
  }
}
