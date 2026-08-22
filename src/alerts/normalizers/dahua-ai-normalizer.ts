/**
 * Dahua CGI AI Event Normalizer
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { CanonicalAlertType } from "../domain/surveillance-alert.types.js";

export class DahuaAiNormalizer implements IAlertNormalizer {
  readonly id = "DAHUA_CGI_NORMALIZER";

  canHandle(rawEvent: RawAiDetectionEvent): boolean {
    return rawEvent.vendorSource === "DAHUA_CGI";
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    const rawType = rawEvent.rawEventType;
    let alertType: CanonicalAlertType = "INTRUSION";
    let title = "Dahua Security Event";
    let description = `Dahua event ${rawType} detected`;

    if (rawType === "CrossLineDetection" || rawType === "Tripwire" || rawType === "CrossRegionDetection" || rawType === "RegionIntrusion") {
      alertType = "INTRUSION";
      title = "Perimeter / Zone Intrusion";
      description = `Object crossed configured virtual boundary (${rawType})`;
    } else if (rawType === "FireWarning" || rawType === "FireDetection") {
      alertType = "FIRE";
      title = "Fire Detection Alarm";
      description = "Optical / thermal fire signature detected";
    } else if (rawType === "SmokeDetection") {
      alertType = "SMOKE";
      title = "Smoke Detection Alarm";
      description = "Smoke dispersion pattern detected";
    } else if (rawType === "VideoTamper" || rawType === "TamperAlert" || rawType === "CoverDetection") {
      alertType = "CAMERA_TAMPER";
      title = "Camera Tampering / Obstruction";
      description = "Camera view has been blocked or redirected";
    } else if (rawType === "FaceRecognition" || rawType === "BlacklistMatch") {
      alertType = "BLACKLIST_PERSON";
      title = "Blacklisted Person Identified";
      description = `Facial match identified: ${rawEvent.attributes?.personName || "Suspect"}`;
    } else if (rawType === "CrowdDetection" || rawType === "PeopleCountWarning") {
      alertType = "CROWD_GATHERING";
      title = "Unusual Crowd Gathering";
      description = `Crowd density exceeded threshold (${rawEvent.attributes?.crowdCount || "High"} persons)`;
    }

    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType,
      vendorEventType: rawType,
      vendorSource: "DAHUA_CGI",
      occurredAt: new Date(rawEvent.timestamp),
      title,
      description,
      confidence: rawEvent.confidence ?? 0.95,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}
