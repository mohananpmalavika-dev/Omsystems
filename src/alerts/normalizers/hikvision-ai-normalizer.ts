/**
 * Hikvision ISAPI AI Event Normalizer
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { CanonicalAlertType } from "../domain/surveillance-alert.types.js";

export class HikvisionAiNormalizer implements IAlertNormalizer {
  readonly id = "HIKVISION_ISAPI_NORMALIZER";

  canHandle(rawEvent: RawAiDetectionEvent): boolean {
    return rawEvent.vendorSource === "HIKVISION_ISAPI";
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    const rawType = rawEvent.rawEventType;
    let alertType: CanonicalAlertType = "INTRUSION";
    let title = "Hikvision Security Alert";
    let description = `Hikvision ISAPI event ${rawType}`;

    if (rawType === "linedetection" || rawType === "fielddetection" || rawType === "regionEntrance") {
      alertType = "INTRUSION";
      title = "Line Crossing / Field Intrusion";
      description = `Hikvision Smart Analytics triggered on line crossing (${rawType})`;
    } else if (rawType === "tamper" || rawType === "scenechangedetection") {
      alertType = "CAMERA_TAMPER";
      title = "Camera Scene Tamper Alert";
      description = "Camera lens covered, defocused, or position moved";
    } else if (rawType === "fireAndSmoke" || rawType === "fireDetection") {
      alertType = "FIRE";
      title = "Hikvision Thermal Fire Alert";
      description = "Thermal radiometric temperature threshold exceeded";
    } else if (rawType === "vehicleDetection" || rawType === "ANPR") {
      alertType = "VEHICLE_ANPR";
      title = "Vehicle License Plate Captured";
      description = `Plate detected: ${rawEvent.attributes?.licensePlate || "Unknown"}`;
    }

    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType,
      vendorEventType: rawType,
      vendorSource: "HIKVISION_ISAPI",
      occurredAt: new Date(rawEvent.timestamp),
      title,
      description,
      confidence: rawEvent.confidence ?? 0.92,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}
