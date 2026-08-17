import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * ONVIF Device Event Adapter
 * 
 * Normalizes standard ONVIF WS-BaseNotification XML/JSON topics.
 */
export class OnvifDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "ONVIF";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const topic = String(raw.Topic || raw.topic || "");
    const message = String(raw.Message || raw.message || "");
    return (
      topic.startsWith("tns1:") ||
      topic.startsWith("onvif:") ||
      message.includes("http://www.onvif.org/ver10/schema")
    );
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const topic = String(raw.Topic || raw.topic || "tns1:VideoSource/MotionAlarm");
    const topicLower = topic.toLowerCase();
    const data = (raw.Data || raw.data || raw.Message || raw) as Record<string, unknown>;

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.UtcTime || raw.utcTime || raw.timestamp,
    );

    const cameraId = (raw.cameraId as string) || (data.Source as string) || context?.cameraId || "CAM-ONVIF-01";
    const deviceId = (raw.deviceId as string) || context?.deviceId || "GW-ONVIF-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = "low";
    let details: DeviceEvent["details"] = undefined;

    if (topicLower.includes("signalloss") || topicLower.includes("videoloss")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    } else if (topicLower.includes("tamper") || topicLower.includes("tampering")) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: "MASKING_BLIND",
          confidence: 0.95,
        },
      };
    } else if (topicLower.includes("storage") || topicLower.includes("disk")) {
      type = "STORAGE_FAULT";
      severity = "critical";
    } else if (topicLower.includes("ruleengine/linedetector") || topicLower.includes("crossline")) {
      type = "ANALYTICS";
      severity = "high";
      details = {
        analytics: {
          analyticsType: "LINE_CROSSING",
          confidence: 0.93,
          zoneName: "ONVIF Rule Zone",
          targetType: "HUMAN",
        },
      };
    } else if (topicLower.includes("digitalinput") || topicLower.includes("relay")) {
      type = "RELAY";
      severity = "medium";
      details = {
        relay: {
          relayIndex: 1,
          relayState: "TRIGGERED",
          inputOrOutput: "INPUT",
        },
      };
    } else if (topicLower.includes("door") || topicLower.includes("access")) {
      type = "DOOR_ACCESS";
      severity = "info";
    } else {
      type = "MOTION";
      severity = "low";
    }

    return this.buildDeviceEvent({
      tenantId: (raw.tenantId as string) || context?.tenantId,
      branchId: (raw.branchId as string) || context?.branchId,
      deviceId,
      cameraId,
      type,
      sourceTimestamp,
      severity,
      details,
      rawEventCode: topic,
      rawPayload: raw,
      context,
    });
  }
}
