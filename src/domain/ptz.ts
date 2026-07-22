/**
 * PTZ (Pan-Tilt-Zoom) Control Domain Models and Types
 */

export type PtzDirection = "left" | "right" | "up" | "down";
export type PtzZoomAction = "in" | "out" | "stop";
export type PtzFocusAction = "near" | "far" | "auto" | "stop";

export interface PtzCommand {
  cameraId: string;
  action: "move" | "zoom" | "focus" | "preset" | "patrol" | "home" | "stop";
  direction?: PtzDirection;
  zoomAction?: PtzZoomAction;
  focusAction?: PtzFocusAction;
  presetId?: number;
  patrolId?: number;
  speed?: {
    pan?: number; // 0.0 to 1.0
    tilt?: number; // 0.0 to 1.0
    zoom?: number; // 0.0 to 1.0
  };
}

export interface PtzPreset {
  id: string;
  cameraId: string;
  tenantId: string;
  presetNumber: number;
  name: string;
  description?: string;
  position?: {
    pan: number;
    tilt: number;
    zoom: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PtzPatrol {
  id: string;
  cameraId: string;
  tenantId: string;
  patrolNumber: number;
  name: string;
  presets: Array<{
    presetNumber: number;
    dwellSeconds: number;
    speed: number;
  }>;
  repeat: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PtzLock {
  id: string;
  cameraId: string;
  operatorId: string;
  operatorName: string;
  lockedAt: string;
  expiresAt: string;
  sessionId: string;
}

export interface PtzCapabilities {
  pan: boolean;
  tilt: boolean;
  zoom: boolean;
  focus: boolean;
  iris: boolean;
  absoluteMove: boolean;
  relativeMove: boolean;
  continuousMove: boolean;
  presets: {
    supported: boolean;
    max: number;
  };
  patrols: {
    supported: boolean;
    max: number;
  };
  home: boolean;
  speedRange: {
    min: number;
    max: number;
  };
}
