import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * Dahua Device Event Adapter
 * 
 * Normalizes Dahua CGI event push / HTTP notifications.
 */
export class DahuaDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "DAHUA";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const vendor = String(raw.Vendor || raw.vendor || raw.brand || "").toUpperCase();
    if (vendor === "DAHUA") return true;

    const action = String(raw.action || raw.Action || "");
    const code = String(raw.code || raw.Code || "");
    return (
      (action === "Start" || action === "Stop" || action === "Pulse") &&
      (code.startsWith("CrossLine") ||
        code.startsWith("VideoBlind") ||
        code.startsWith("Storage") ||
        code.startsWith("Alarm"))
    );
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const code = String(raw.code || raw.Code || raw.Event || "Unknown");
    const codeUpper = code.toUpperCase();
    const data = (raw.data || raw.Data || raw) as Record<string, unknown>;

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.time || raw.Time || raw.timestamp || data.time || data.UTC,
    );

    const channel = typeof data.channel === "number"
      ? data.channel
      : typeof raw.channel === "number"
      ? raw.channel
      : undefined;

    const cameraId =
      (raw.cameraId as string) ||
      (data.cameraId as string) ||
      (context?.cameraId ? context.cameraId : channel !== undefined ? `CAM-${channel}` : undefined);

    const deviceId =
      (raw.deviceId as string) ||
      (raw.deviceSerial as string) ||
      context?.deviceId ||
      "NVR-DAHUA-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = "low";
    let details: DeviceEvent["details"] = undefined;

    if (codeUpper.includes("VIDEOLOSS")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    } else if (codeUpper.includes("VIDEOBLIND") || codeUpper.includes("BLIND")) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: "MASKING_BLIND",
          confidence: 0.96,
        },
      };
    } else if (codeUpper.includes("STORAGE")) {
      type = "STORAGE_FAULT";
      severity = "critical";
      details = {
        storage: {
          storageFaultType: codeUpper.includes("FULL") ? "DISK_FULL" : "DISK_ERROR",
        },
      };
    } else if (codeUpper.includes("OFFLINE")) {
      type = "CAMERA_OFFLINE";
      severity = "high";
    } else if (codeUpper.includes("RECORD")) {
      type = "RECORDING_FAILURE";
      severity = "critical";
    } else if (
      codeUpper.includes("CROSSLINE") ||
      codeUpper.includes("INTRUSION") ||
      codeUpper.includes("SMD")
    ) {
      type = "ANALYTICS";
      severity = "high";
      details = {
        analytics: {
          analyticsType: codeUpper.includes("CROSSLINE") ? "LINE_CROSSING" : "INTRUSION",
          confidence: 0.94,
          zoneName: (data.Name as string) || "Dahua SMD Perimeter",
          targetType: "HUMAN",
        },
      };
    } else if (codeUpper.includes("ALARM")) {
      type = "RELAY";
      severity = "medium";
      details = {
        relay: {
          relayIndex: typeof data.index === "number" ? data.index : 1,
          relayState: "TRIGGERED",
          inputOrOutput: "INPUT",
        },
      };
    } else if (codeUpper.includes("ACCESS") || codeUpper.includes("CARD")) {
      type = "DOOR_ACCESS";
      severity = "info";
      details = {
        access: {
          accessType: "ACCESS_GRANTED",
          cardId: String(data.CardNo || data.cardNo || ""),
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
      channel,
      type,
      sourceTimestamp,
      severity,
      details,
      rawEventCode: code,
      rawPayload: raw,
      context,
    });
  }
}
