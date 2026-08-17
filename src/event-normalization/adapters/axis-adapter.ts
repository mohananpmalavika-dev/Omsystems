import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * Axis Device Event Adapter
 * 
 * Normalizes Axis VAPIX / ONVIF XML/JSON events.
 */
export class AxisDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "AXIS";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const vendor = String(raw.Vendor || raw.vendor || raw.brand || "").toUpperCase();
    if (vendor === "AXIS") return true;

    const topic = String(raw.topic || raw.Topic || raw.notification || "");
    return topic.includes("tnsaxis") || topic.includes("axis:");
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const topic = String(raw.topic || raw.Topic || raw.event || "axis:motion");
    const topicLower = topic.toLowerCase();
    const data = (raw.data || raw.dataValues || raw) as Record<string, unknown>;

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.timestamp || raw.UtcTime || raw.time,
    );

    const cameraId = (raw.cameraId as string) || context?.cameraId || "CAM-AXIS-01";
    const deviceId = (raw.deviceId as string) || context?.deviceId || "GW-AXIS-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = "low";
    let details: DeviceEvent["details"] = undefined;

    if (topicLower.includes("tampering") || topicLower.includes("tamper")) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: "MASKING_BLIND",
          confidence: 0.95,
        },
      };
    } else if (topicLower.includes("signalloss") || topicLower.includes("videoloss")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    } else if (topicLower.includes("storage")) {
      type = "STORAGE_FAULT";
      severity = "critical";
    } else if (topicLower.includes("offline")) {
      type = "CAMERA_OFFLINE";
      severity = "high";
    } else if (topicLower.includes("crossline") || topicLower.includes("fenceguard")) {
      type = "ANALYTICS";
      severity = "high";
      details = {
        analytics: {
          analyticsType: "LINE_CROSSING",
          confidence: 0.95,
          zoneName: (data.scenario as string) || "Axis FenceGuard Zone",
          targetType: "HUMAN",
        },
      };
    } else if (topicLower.includes("port") || topicLower.includes("input")) {
      type = "RELAY";
      severity = "medium";
      details = {
        relay: {
          relayIndex: 1,
          relayState: "TRIGGERED",
          inputOrOutput: "INPUT",
        },
      };
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
