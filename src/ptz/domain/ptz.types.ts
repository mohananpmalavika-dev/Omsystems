/**
 * Enterprise Reliable PTZ Domain Types
 */

export type PtzPriorityRole = 'GUARD' | 'SUPERVISOR' | 'INCIDENT_RESPONSE' | 'SYSTEM_ADMIN';

export const PTZ_PRIORITY_LEVELS: Record<PtzPriorityRole, number> = {
  GUARD: 10,
  SUPERVISOR: 20,
  INCIDENT_RESPONSE: 50,
  SYSTEM_ADMIN: 100,
};

export type PtzPermission = 'camera.ptz.view' | 'camera.ptz.control' | 'camera.ptz.admin';

export interface PtzMovementCommand {
  panVelocity?: number;   // -1.0 (left) to 1.0 (right)
  tiltVelocity?: number;  // -1.0 (down) to 1.0 (up)
  zoomVelocity?: number;  // -1.0 (zoom out) to 1.0 (zoom in)
  timeoutMs?: number;     // Deadman switch auto-stop timeout (default 5000ms)
}

export interface PtzOpticsCommand {
  focus?: {
    mode: 'AUTO' | 'MANUAL';
    action?: 'NEAR' | 'FAR' | 'STOP';
    speed?: number; // 0.0 to 1.0
  };
  iris?: {
    mode: 'AUTO' | 'MANUAL';
    action?: 'OPEN' | 'CLOSE' | 'RESET';
    value?: number; // 0.0 to 1.0
  };
}

export interface PtzPreset {
  id: string;
  cameraId: string;
  presetNumber: number;
  name: string;
  pan: number;
  tilt: number;
  zoom: number;
  focus?: number;
  iris?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PtzPattern {
  id: string;
  cameraId: string;
  patternNumber: number;
  name: string;
  status: 'RECORDING' | 'READY' | 'PLAYING';
  durationSeconds: number;
  recordedTrajectory?: Array<{ timestamp: number; pan: number; tilt: number; zoom: number }>;
}

export interface PtzTourStep {
  presetNumber: number;
  dwellSeconds: number;
  speed: number; // 0.0 to 1.0
}

export interface PtzTour {
  id: string;
  cameraId: string;
  tourNumber: number;
  name: string;
  steps: PtzTourStep[];
  repeat: boolean;
  status: 'IDLE' | 'RUNNING' | 'PAUSED';
}

export interface PtzHomePosition {
  cameraId: string;
  presetNumber?: number;
  position?: { pan: number; tilt: number; zoom: number };
  autoReturnIdleTimeoutSeconds: number; // e.g. 30 seconds
}

export interface PtzLockState {
  cameraId: string;
  operatorId: string;
  operatorName: string;
  role: PtzPriorityRole;
  priority: number;
  token: string;
  acquiredAt: number;
  expiresAt: number;
  status: 'ACTIVE' | 'PREEMPTED' | 'RELEASED';
  preemptedBy?: {
    operatorId: string;
    operatorName: string;
    role: PtzPriorityRole;
    priority: number;
  };
}

export interface PtzCoordinates {
  pan: number;   // -180.0 to 180.0 degrees
  tilt: number;  // -90.0 to 90.0 degrees
  zoom: number;  // 1.0x to 40.0x
  focus: number; // 0.0 to 1.0
  iris: number;  // 0.0 to 1.0
}
