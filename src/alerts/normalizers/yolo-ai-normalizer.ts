/**
 * YOLO / Computer Vision AI Normalizer
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { CanonicalAlertType } from "../domain/surveillance-alert.types.js";

export class YoloAiNormalizer implements IAlertNormalizer {
  readonly id = "YOLO_AI_NORMALIZER";

  canHandle(rawEvent: RawAiDetectionEvent): boolean {
    return rawEvent.vendorSource === "YOLO_V8" || rawEvent.vendorSource === "CUSTOM_PY" || rawEvent.vendorSource === "FRIGATE";
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    const rawType = rawEvent.rawEventType.toLowerCase();
    let alertType: CanonicalAlertType = "INTRUSION";
    let title = "AI Vision Detection";
    let description = `Computer vision detected ${rawEvent.rawEventType}`;

    if (rawType.includes("vault") || rawType.includes("strong_room")) {
      alertType = "VAULT_ACCESS";
      title = "Unauthorized Vault Access Detected";
      description = "Human detected inside restricted vault perimeter";
    } else if (rawType.includes("weapon") || rawType.includes("gun") || rawType.includes("knife")) {
      alertType = "WEAPON_DETECTED";
      title = "Weapon Detected on Premises";
      description = `Visual object detection identified weapon: ${rawEvent.attributes?.weaponType || "Firearm"}`;
    } else if (rawType.includes("violence") || rawType.includes("fight") || rawType.includes("assault")) {
      alertType = "VIOLENCE";
      title = "Physical Altercation / Violence Detected";
      description = "Kinematic pose model detected aggressive struggle or assault";
    } else if (rawType.includes("loiter")) {
      alertType = "LOITERING";
      title = "Loitering in Sensitive Zone";
      description = `Individual present for extended duration (${rawEvent.attributes?.durationSeconds || 120}s)`;
    } else if (rawType.includes("crowd") || rawType.includes("density")) {
      alertType = "CROWD_GATHERING";
      title = "High Crowd Density Detected";
      description = `Crowd density count: ${rawEvent.attributes?.crowdCount || "Elevated"}`;
    } else if (rawType.includes("atm") && (rawType.includes("tamper") || rawType.includes("skimmer") || rawType.includes("vandal"))) {
      alertType = "ATM_VANDALISM";
      title = "ATM Tampering / Vandalism Attempt";
      description = "Suspicious tool / physical impact detected near ATM cash dispenser";
    }

    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType,
      vendorEventType: rawEvent.rawEventType,
      vendorSource: rawEvent.vendorSource,
      occurredAt: new Date(rawEvent.timestamp),
      title,
      description,
      confidence: rawEvent.confidence ?? 0.9,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}
