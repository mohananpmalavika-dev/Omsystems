/**
 * PTZ Preset, Pattern & Tour Manager Service
 * Manages PTZ coordinates presets, recorded manual trajectories, and automated Guard Tours.
 */

import { randomUUID } from 'node:crypto';
import {
  PtzPreset,
  PtzPattern,
  PtzTour,
  PtzTourStep,
} from '../domain/ptz.types.js';

export class PtzPresetTourManagerService {
  private presets = new Map<string, Map<number, PtzPreset>>();
  private patterns = new Map<string, Map<number, PtzPattern>>();
  private tours = new Map<string, Map<number, PtzTour>>();

  // ================= PRESETS =================

  storePreset(cameraId: string, presetNumber: number, name: string, pan: number, tilt: number, zoom: number, focus?: number, iris?: number): PtzPreset {
    const cameraPresets = this.presets.get(cameraId) || new Map<number, PtzPreset>();
    const nowIso = new Date().toISOString();

    const preset: PtzPreset = {
      id: randomUUID(),
      cameraId,
      presetNumber,
      name,
      pan,
      tilt,
      zoom,
      focus,
      iris,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    cameraPresets.set(presetNumber, preset);
    this.presets.set(cameraId, cameraPresets);
    return preset;
  }

  getPreset(cameraId: string, presetNumber: number): PtzPreset | null {
    const cameraPresets = this.presets.get(cameraId);
    return cameraPresets?.get(presetNumber) || null;
  }

  listPresets(cameraId: string): PtzPreset[] {
    const cameraPresets = this.presets.get(cameraId);
    return cameraPresets ? Array.from(cameraPresets.values()) : [];
  }

  deletePreset(cameraId: string, presetNumber: number): boolean {
    const cameraPresets = this.presets.get(cameraId);
    if (!cameraPresets) return false;
    return cameraPresets.delete(presetNumber);
  }

  // ================= PATTERNS =================

  createPattern(cameraId: string, patternNumber: number, name: string): PtzPattern {
    const cameraPatterns = this.patterns.get(cameraId) || new Map<number, PtzPattern>();
    const pattern: PtzPattern = {
      id: randomUUID(),
      cameraId,
      patternNumber,
      name,
      status: 'READY',
      durationSeconds: 0,
      recordedTrajectory: [],
    };
    cameraPatterns.set(patternNumber, pattern);
    this.patterns.set(cameraId, cameraPatterns);
    return pattern;
  }

  recordTrajectory(cameraId: string, patternNumber: number, trajectory: Array<{ timestamp: number; pan: number; tilt: number; zoom: number }>, durationSeconds: number): PtzPattern | null {
    const cameraPatterns = this.patterns.get(cameraId);
    const pattern = cameraPatterns?.get(patternNumber);
    if (!pattern) return null;

    pattern.recordedTrajectory = trajectory;
    pattern.durationSeconds = durationSeconds;
    pattern.status = 'READY';
    return pattern;
  }

  getPattern(cameraId: string, patternNumber: number): PtzPattern | null {
    const cameraPatterns = this.patterns.get(cameraId);
    return cameraPatterns?.get(patternNumber) || null;
  }

  listPatterns(cameraId: string): PtzPattern[] {
    const cameraPatterns = this.patterns.get(cameraId);
    return cameraPatterns ? Array.from(cameraPatterns.values()) : [];
  }

  // ================= GUARD TOURS =================

  configureTour(cameraId: string, tourNumber: number, name: string, steps: PtzTourStep[], repeat: boolean = true): PtzTour {
    const cameraTours = this.tours.get(cameraId) || new Map<number, PtzTour>();
    const tour: PtzTour = {
      id: randomUUID(),
      cameraId,
      tourNumber,
      name,
      steps,
      repeat,
      status: 'IDLE',
    };
    cameraTours.set(tourNumber, tour);
    this.tours.set(cameraId, cameraTours);
    return tour;
  }

  startTour(cameraId: string, tourNumber: number): PtzTour | null {
    const cameraTours = this.tours.get(cameraId);
    const tour = cameraTours?.get(tourNumber);
    if (!tour) return null;
    tour.status = 'RUNNING';
    return tour;
  }

  stopTour(cameraId: string, tourNumber: number): PtzTour | null {
    const cameraTours = this.tours.get(cameraId);
    const tour = cameraTours?.get(tourNumber);
    if (!tour) return null;
    tour.status = 'IDLE';
    return tour;
  }

  listTours(cameraId: string): PtzTour[] {
    const cameraTours = this.tours.get(cameraId);
    return cameraTours ? Array.from(cameraTours.values()) : [];
  }
}

export const ptzPresetTourManager = new PtzPresetTourManagerService();
