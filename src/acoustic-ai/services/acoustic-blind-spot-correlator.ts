/**
 * Acoustic Blind-Spot Spatial Correlator
 *
 * Correlates audio anomalies with camera visual FOV limitations:
 * 1. Identifies if the acoustic event originated from a known camera blind spot
 * 2. Triggers automated PTZ camera slew commands to rotate towards the acoustic anomaly sector
 * 3. Enriches alerts with adjacent cross-camera alerts and spatial azimuth estimates
 */

import type {
  AcousticBlindSpot,
  AcousticClassificationResult,
} from '../domain/acoustic-ai.types.js';

export interface BlindSpotEvaluationInput {
  cameraId: string;
  classification: AcousticClassificationResult;
  registeredBlindSpots: AcousticBlindSpot[];
  visualTargetInFov?: boolean;
  estimatedAzimuthDeg?: number;
  adjacentCameraIds?: string[];
}

export interface BlindSpotEvaluationResult {
  isBlindSpot: boolean;
  sectorName?: string;
  triangulatedAzimuthDeg?: number;
  ptzSlewTriggered: boolean;
  ptzTargetCameraId?: string;
  ptzPresetRecalled?: number;
  ptzPanTilt?: { pan: number; tilt: number; zoom: number };
  crossAlertedCameraIds: string[];
  reason: string;
}

export class AcousticBlindSpotCorrelator {
  /**
   * Correlates an acoustic event with camera visual field of view
   */
  static correlate(input: BlindSpotEvaluationInput): BlindSpotEvaluationResult {
    const {
      cameraId,
      classification,
      registeredBlindSpots,
      visualTargetInFov = false,
      estimatedAzimuthDeg,
      adjacentCameraIds = [],
    } = input;

    // 1. If visual target is NOT in active FOV and it's a critical security anomaly,
    // this strongly indicates an incident in the camera's blind spot!
    const isThreatSignature =
      classification.signature === 'glass_break' ||
      classification.signature === 'gunshot_blast' ||
      classification.signature === 'shutter_tamper_breach' ||
      classification.signature === 'screaming_aggression';

    // Find closest matching registered blind spot sector
    let matchingBlindSpot: AcousticBlindSpot | undefined;

    if (registeredBlindSpots.length > 0) {
      if (estimatedAzimuthDeg !== undefined) {
        // Find sector closest to estimated acoustic azimuth angle
        matchingBlindSpot = registeredBlindSpots.find(bs => {
          const diff = Math.abs(bs.azimuth_angle_deg - estimatedAzimuthDeg);
          const circularDiff = Math.min(diff, 360 - diff);
          return circularDiff <= 45; // within 45 degrees
        });
      }

      // If no exact azimuth match, pick default active blind spot if no visual target in FOV
      if (!matchingBlindSpot && !visualTargetInFov) {
        matchingBlindSpot = registeredBlindSpots[0];
      }
    }

    const isBlindSpot = !visualTargetInFov || !!matchingBlindSpot;
    const sectorName = matchingBlindSpot
      ? matchingBlindSpot.zone_name
      : isBlindSpot
      ? 'Camera Perimeter Blind Spot (No Visual Target in Active FOV)'
      : undefined;

    const triangulatedAzimuthDeg =
      estimatedAzimuthDeg ?? matchingBlindSpot?.azimuth_angle_deg ?? 180.0;

    // 2. Automated PTZ camera slew trigger
    let ptzSlewTriggered = false;
    let ptzTargetCameraId: string | undefined;
    let ptzPresetRecalled: number | undefined;
    let ptzPanTilt: { pan: number; tilt: number; zoom: number } | undefined;

    if (isBlindSpot && isThreatSignature && matchingBlindSpot?.target_ptz_camera_id) {
      ptzSlewTriggered = true;
      ptzTargetCameraId = matchingBlindSpot.target_ptz_camera_id;
      ptzPresetRecalled = matchingBlindSpot.target_ptz_preset_id ?? 1;
      ptzPanTilt = matchingBlindSpot.target_ptz_pan_tilt ?? { pan: 180, tilt: -15, zoom: 2.5 };
    }

    // 3. Multi-camera cross alerts
    const crossAlertedCameraIds = adjacentCameraIds.filter(id => id !== cameraId);

    const reason = isBlindSpot
      ? `Acoustic anomaly detected outside camera visual FOV in blind spot [${sectorName ?? 'Peripheral Zone'}]. Triggered PTZ slew and cross-camera alerting.`
      : 'Acoustic anomaly correlated with active visual FOV.';

    return {
      isBlindSpot,
      sectorName,
      triangulatedAzimuthDeg,
      ptzSlewTriggered,
      ptzTargetCameraId,
      ptzPresetRecalled,
      ptzPanTilt,
      crossAlertedCameraIds,
      reason,
    };
  }
}
