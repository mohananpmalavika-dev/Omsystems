/**
 * ANPR / Vehicle Analytics Normalizer
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { CanonicalAlertType } from "../domain/surveillance-alert.types.js";

export class AnprNormalizer implements IAlertNormalizer {
  readonly id = "ANPR_NORMALIZER";

  canHandle(rawEvent: RawAiDetectionEvent): boolean {
    return rawEvent.vendorSource === "ANPR_ENGINE";
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    const rawType = rawEvent.rawEventType.toLowerCase();
    let alertType: CanonicalAlertType = "VEHICLE_ANPR";
    let title = "Vehicle Plate Read";
    let description = `Plate: ${rawEvent.attributes?.licensePlate || "Unknown"}`;

    if (rawType.includes("blacklist") || rawType.includes("stolen") || rawType.includes("hotlist")) {
      alertType = "BLACKLIST_PERSON";
      title = "Blacklisted / Watchlist Vehicle Detected";
      description = `Vehicle on security watchlist: ${rawEvent.attributes?.licensePlate || "Unknown"}`;
    } else if (rawType.includes("cash_van") || rawType.includes("armored")) {
      alertType = "CASH_VAN_MONITORING";
      title = "Cash Replenishment Van Arrived";
      description = `Cash transit van ${rawEvent.attributes?.licensePlate || "Identified"} arrived at branch bay`;
    }

    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType,
      vendorEventType: rawEvent.rawEventType,
      vendorSource: "ANPR_ENGINE",
      occurredAt: new Date(rawEvent.timestamp),
      title,
      description,
      confidence: rawEvent.confidence ?? 0.98,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}
