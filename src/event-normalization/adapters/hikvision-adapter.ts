import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * Hikvision Device Event Adapter
 * 
 * Normalizes Hikvision ISAPI XML/JSON alerts & AcuSense event streams.
 */
export class HikvisionDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "HIKVISION";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const vendor = String(raw.Vendor || raw.vendor || raw.brand || "").toUpperCase();
    if (vendor === "HIKVISION" || vendor === "HIK") return true;

    const alertObj = raw.EventNotificationAlert as Record<string, unknown> | undefined;
    const eventType = String(
      raw.eventType || raw.eventDescription || alertObj?.eventType || "",
    );
    const hikCodes = [
      "videoloss",
      "tamperdetection",
      "shelteralarm",
      "motiondetection",
      "diskerror",
      "diskfull",
      "linedetection",
      "fielddetection",
      "accessControllerEvent",
      "IO",
      "defocus",
      "scenechangedetection",
    ];
    return hikCodes.some((c) => eventType.toLowerCase().includes(c.toLowerCase()));
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const alert = (raw.EventNotificationAlert || raw) as Record<string, unknown>;
    const rawType = String(alert.eventType || alert.eventDescription || raw.type || "motion");
    const rawTypeLower = rawType.toLowerCase();

    const sourceTimestamp = this.parseSourceTimestamp(
      alert.dateTime || raw.dateTime || raw.timestamp,
    );

    const channel = typeof alert.channelID === "number"
      ? alert.channelID
      : typeof alert.channelID === "string"
      ? Number.parseInt(alert.channelID, 10)
      : undefined;

    const cameraId =
      (raw.cameraId as string) ||
      (alert.channelID ? `CAM-${alert.channelID}` : undefined) ||
      context?.cameraId;

    const deviceId =
      (raw.deviceId as string) ||
      (alert.deviceID as string) ||
      (alert.macAddress as string) ||
      context?.deviceId ||
      "NVR-HIKVISION-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = "low";
    let details: DeviceEvent["details"] = undefined;

    // 1. VIDEO LOSS
    if (rawTypeLower.includes("videoloss")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    }
    // 2. TAMPER
    else if (
      rawTypeLower.includes("tamper") ||
      rawTypeLower.includes("shelter") ||
      rawTypeLower.includes("defocus") ||
      rawTypeLower.includes("scenechange")
    ) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: rawTypeLower.includes("defocus")
            ? "DEFOCUS"
            : rawTypeLower.includes("scenechange")
            ? "SCENE_CHANGE"
            : "MASKING_BLIND",
          confidence: 0.98,
        },
      };
    }
    // 3. STORAGE FAULT
    else if (rawTypeLower.includes("disk")) {
      type = "STORAGE_FAULT";
      severity = "critical";
      details = {
        storage: {
          storageFaultType: rawTypeLower.includes("full") ? "DISK_FULL" : "DISK_ERROR",
        },
      };
    }
    // 4. CAMERA OFFLINE
    else if (rawTypeLower.includes("offline") || rawTypeLower.includes("disconnect")) {
      type = "CAMERA_OFFLINE";
      severity = "high";
    }
    // 5. RECORDING FAILURE
    else if (rawTypeLower.includes("record")) {
      type = "RECORDING_FAILURE";
      severity = "critical";
    }
    // 6. ANALYTICS (AcuSense)
    else if (
      rawTypeLower.includes("line") ||
      rawTypeLower.includes("field") ||
      rawTypeLower.includes("intrusion") ||
      rawTypeLower.includes("face") ||
      rawTypeLower.includes("anpr")
    ) {
      type = "ANALYTICS";
      severity = "high";
      const targetType = (alert.DetectionTarget || alert.targetType) === "vehicle" ? "VEHICLE" : "HUMAN";
      details = {
        analytics: {
          analyticsType: rawTypeLower.includes("line")
            ? "LINE_CROSSING"
            : rawTypeLower.includes("face")
            ? "FACE_DETECTED"
            : rawTypeLower.includes("anpr")
            ? "PLATE_RECOGNIZED"
            : "INTRUSION",
          confidence: 0.96,
          zoneName: (alert.DetectionRegionName as string) || "Hikvision AcuSense Zone",
          targetType,
        },
      };
    }
    // 7. RELAY
    else if (rawTypeLower.includes("io") || rawTypeLower.includes("relay") || rawTypeLower.includes("alarm")) {
      type = "RELAY";
      severity = "medium";
      details = {
        relay: {
          relayIndex: typeof alert.inputIOPortID === "number" ? alert.inputIOPortID : 1,
          relayState: "TRIGGERED",
          inputOrOutput: "INPUT",
        },
      };
    }
    // 8. DOOR / ACCESS
    else if (rawTypeLower.includes("access") || rawTypeLower.includes("door")) {
      type = "DOOR_ACCESS";
      const isForced = rawTypeLower.includes("forced");
      const isDenied = rawTypeLower.includes("denied");
      severity = isForced ? "critical" : isDenied ? "high" : "info";

      details = {
        access: {
          accessType: isForced
            ? "DOOR_FORCED_OPEN"
            : isDenied
            ? "ACCESS_DENIED"
            : "ACCESS_GRANTED",
          doorName: (alert.doorName as string) || (alert.doorNo as string),
          cardId: alert.cardNo as string,
        },
      };
    }
    // 9. MOTION
    else {
      type = "MOTION";
      severity = "low";
    }

    return this.buildDeviceEvent({
      tenantId: (raw.tenantId as string) || context?.tenantId,
      branchId: (raw.branchId as string) || context?.branchId,
      deviceId,
      cameraId,
      channel,
      type,
      sourceTimestamp,
      severity,
      details,
      rawEventCode: rawType,
      rawPayload: raw,
      context,
    });
  }
}
