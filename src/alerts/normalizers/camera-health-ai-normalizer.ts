/**
 * Camera Health AI Visual Analytics Normalizer
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { CanonicalAlertType } from "../domain/surveillance-alert.types.js";

export class CameraHealthAiNormalizer implements IAlertNormalizer {
  readonly id = "CAMERA_HEALTH_AI_NORMALIZER";

  canHandle(rawEvent: RawAiDetectionEvent): boolean {
    return rawEvent.vendorSource === "CAMERA_HEALTH_AI";
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    const rawType = rawEvent.rawEventType.toLowerCase();
    let alertType: CanonicalAlertType = "CAMERA_HEALTH_FAULT";
    let title = "Camera Visual Health Anomaly";
    let description = `Visual health fault: ${rawEvent.rawEventType}`;

    if (rawType.includes("blur") || rawType.includes("defocus")) {
      alertType = "CAMERA_OBSTRUCTION";
      title = "Camera Lens Blur / Defocus";
      description = "Video stream sharpness dropped below operational threshold";
    } else if (rawType.includes("freeze") || rawType.includes("frozen")) {
      alertType = "CAMERA_HEALTH_FAULT";
      title = "Camera Video Stream Frozen";
      description = "Zero temporal delta detected across video frames";
    } else if (rawType.includes("blind") || rawType.includes("dark") || rawType.includes("glare")) {
      alertType = "CAMERA_OBSTRUCTION";
      title = "Severe Lighting / Glare Obstruction";
      description = "Extreme sensor glare or optical blindness detected";
    }

    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType,
      vendorEventType: rawEvent.rawEventType,
      vendorSource: "CAMERA_HEALTH_AI",
      occurredAt: new Date(rawEvent.timestamp),
      title,
      description,
      confidence: rawEvent.confidence ?? 0.94,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}
