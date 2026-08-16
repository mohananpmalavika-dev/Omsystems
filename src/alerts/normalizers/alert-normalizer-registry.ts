/**
 * Alert Normalizer Registry
 * 
 * Central registry that delegates raw AI events to the appropriate vendor/detector normalizer adapter.
 */

import type { IAlertNormalizer } from "./alert-normalizer.interface.js";
import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import { DahuaAiNormalizer } from "./dahua-ai-normalizer.js";
import { HikvisionAiNormalizer } from "./hikvision-ai-normalizer.js";
import { YoloAiNormalizer } from "./yolo-ai-normalizer.js";
import { AnprNormalizer } from "./anpr-normalizer.js";
import { CameraHealthAiNormalizer } from "./camera-health-ai-normalizer.js";

export class AlertNormalizerRegistry {
  private normalizers: IAlertNormalizer[] = [];

  constructor() {
    this.register(new DahuaAiNormalizer());
    this.register(new HikvisionAiNormalizer());
    this.register(new YoloAiNormalizer());
    this.register(new AnprNormalizer());
    this.register(new CameraHealthAiNormalizer());
  }

  register(normalizer: IAlertNormalizer) {
    this.normalizers.push(normalizer);
  }

  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate {
    for (const norm of this.normalizers) {
      if (norm.canHandle(rawEvent)) {
        return norm.normalize(rawEvent);
      }
    }

    // Generic ONVIF / fallback normalizer
    return {
      rawEventId: rawEvent.eventId,
      tenantId: rawEvent.tenantId,
      branchId: rawEvent.branchId,
      cameraId: rawEvent.cameraId,
      recorderId: rawEvent.recorderId,
      alertType: "INTRUSION",
      vendorEventType: rawEvent.rawEventType,
      vendorSource: rawEvent.vendorSource || "ONVIF_ANALYTICS",
      occurredAt: new Date(rawEvent.timestamp),
      title: `Surveillance Alert (${rawEvent.rawEventType})`,
      description: `Raw event ${rawEvent.rawEventType} received from ${rawEvent.vendorSource}`,
      confidence: rawEvent.confidence ?? 0.85,
      attributes: rawEvent.attributes || {},
      snapshotReference: rawEvent.snapshotRef,
      clipReference: rawEvent.clipRef,
    };
  }
}

export const alertNormalizerRegistry = new AlertNormalizerRegistry();
