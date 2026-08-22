/**
 * PTZ Optics & Movement Controller Service
 * Coordinates Pan/Tilt/Zoom, Focus, Iris, Home Position, and RBAC permissions.
 */

import {
  PtzMovementCommand,
  PtzOpticsCommand,
  PtzCoordinates,
  PtzHomePosition,
  PtzPermission,
} from '../domain/ptz.types.js';
import { PtzPriorityManagerService, ptzPriorityManager } from './ptz-priority-manager.service.js';
import { PtzPresetTourManagerService, ptzPresetTourManager } from './ptz-preset-tour-manager.service.js';

export interface ExecutePtzRequest {
  cameraId: string;
  operatorId: string;
  operatorPermissions: PtzPermission[];
  token?: string;
  movement?: PtzMovementCommand;
  optics?: PtzOpticsCommand;
}

export class PtzOpticsControllerService {
  private cameraPositions = new Map<string, PtzCoordinates>();
  private cameraHomes = new Map<string, PtzHomePosition>();

  constructor(
    private readonly priorityManager: PtzPriorityManagerService = ptzPriorityManager,
    private readonly presetManager: PtzPresetTourManagerService = ptzPresetTourManager
  ) {
    // Hook into idle callback to return camera to Home position automatically
    this.priorityManager.onIdle((cameraId) => {
      this.returnToHome(cameraId);
    });
  }

  /**
   * Asserts caller has required RBAC permission.
   */
  assertPermission(operatorPermissions: PtzPermission[], required: PtzPermission): void {
    if (!operatorPermissions.includes(required) && !operatorPermissions.includes('camera.ptz.admin')) {
      throw new Error(`PERMISSION_DENIED: Missing required permission ${required}`);
    }
  }

  /**
   * Configures Home Position for a camera.
   */
  setHomePosition(cameraId: string, config: PtzHomePosition, permissions: PtzPermission[]): PtzHomePosition {
    this.assertPermission(permissions, 'camera.ptz.admin');
    this.cameraHomes.set(cameraId, config);
    return config;
  }

  getHomePosition(cameraId: string): PtzHomePosition | null {
    return this.cameraHomes.get(cameraId) || null;
  }

  /**
   * Returns camera to Home Position.
   */
  returnToHome(cameraId: string): PtzCoordinates {
    const home = this.cameraHomes.get(cameraId);
    if (home?.presetNumber !== undefined) {
      const preset = this.presetManager.getPreset(cameraId, home.presetNumber);
      if (preset) {
        const coords: PtzCoordinates = {
          pan: preset.pan,
          tilt: preset.tilt,
          zoom: preset.zoom,
          focus: preset.focus || 0.5,
          iris: preset.iris || 0.5,
        };
        this.cameraPositions.set(cameraId, coords);
        return coords;
      }
    }

    const defaultHome: PtzCoordinates = {
      pan: home?.position?.pan || 0.0,
      tilt: home?.position?.tilt || 0.0,
      zoom: home?.position?.zoom || 1.0,
      focus: 0.5,
      iris: 0.5,
    };
    this.cameraPositions.set(cameraId, defaultHome);
    return defaultHome;
  }

  /**
   * Queries current camera coordinates.
   */
  getCoordinates(cameraId: string, permissions: PtzPermission[]): PtzCoordinates {
    this.assertPermission(permissions, 'camera.ptz.view');
    return this.cameraPositions.get(cameraId) || { pan: 0, tilt: 0, zoom: 1, focus: 0.5, iris: 0.5 };
  }

  /**
   * Executes pan, tilt, zoom movement.
   */
  move(request: ExecutePtzRequest): PtzCoordinates {
    this.assertPermission(request.operatorPermissions, 'camera.ptz.control');

    const hasControl = this.priorityManager.assertControl(request.cameraId, request.operatorId, request.token);
    if (!hasControl) {
      throw new Error('PTZ_CONTROL_DENIED: Operator does not possess an active PTZ lock');
    }

    const current = this.getCoordinates(request.cameraId, ['camera.ptz.view']);
    const m = request.movement || {};

    const updated: PtzCoordinates = {
      pan: Math.max(-180, Math.min(180, current.pan + (m.panVelocity || 0) * 10)),
      tilt: Math.max(-90, Math.min(90, current.tilt + (m.tiltVelocity || 0) * 5)),
      zoom: Math.max(1, Math.min(40, current.zoom + (m.zoomVelocity || 0) * 2)),
      focus: current.focus,
      iris: current.iris,
    };

    this.cameraPositions.set(request.cameraId, updated);
    return updated;
  }

  /**
   * Controls optics (Focus and Iris).
   */
  controlOptics(request: ExecutePtzRequest): PtzCoordinates {
    this.assertPermission(request.operatorPermissions, 'camera.ptz.control');

    const hasControl = this.priorityManager.assertControl(request.cameraId, request.operatorId, request.token);
    if (!hasControl) {
      throw new Error('PTZ_CONTROL_DENIED: Operator does not possess an active PTZ lock');
    }

    const current = this.getCoordinates(request.cameraId, ['camera.ptz.view']);
    const o = request.optics || {};

    let newFocus = current.focus;
    if (o.focus?.action === 'NEAR') newFocus = Math.max(0.0, current.focus - 0.1);
    if (o.focus?.action === 'FAR') newFocus = Math.min(1.0, current.focus + 0.1);
    if (o.focus?.mode === 'AUTO') newFocus = 0.5;

    let newIris = current.iris;
    if (o.iris?.action === 'OPEN') newIris = Math.min(1.0, current.iris + 0.1);
    if (o.iris?.action === 'CLOSE') newIris = Math.max(0.0, current.iris - 0.1);
    if (o.iris?.mode === 'AUTO' || o.iris?.action === 'RESET') newIris = 0.5;

    const updated: PtzCoordinates = {
      ...current,
      focus: newFocus,
      iris: newIris,
    };

    this.cameraPositions.set(request.cameraId, updated);
    return updated;
  }

  /**
   * Moves camera directly to a stored Preset position.
   */
  gotoPreset(cameraId: string, presetNumber: number, request: Omit<ExecutePtzRequest, 'cameraId'>): PtzCoordinates {
    this.assertPermission(request.operatorPermissions, 'camera.ptz.control');

    const hasControl = this.priorityManager.assertControl(cameraId, request.operatorId, request.token);
    if (!hasControl) {
      throw new Error('PTZ_CONTROL_DENIED: Operator does not possess an active PTZ lock');
    }

    const preset = this.presetManager.getPreset(cameraId, presetNumber);
    if (!preset) {
      throw new Error(`PRESET_NOT_FOUND: Preset ${presetNumber} does not exist`);
    }

    const updated: PtzCoordinates = {
      pan: preset.pan,
      tilt: preset.tilt,
      zoom: preset.zoom,
      focus: preset.focus || 0.5,
      iris: preset.iris || 0.5,
    };

    this.cameraPositions.set(cameraId, updated);
    return updated;
  }
}

export const ptzOpticsController = new PtzOpticsControllerService();
