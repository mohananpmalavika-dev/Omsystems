import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * CP PLUS Device Event Adapter
 * 
 * Normalizes DHIP / CP PLUS NVR & IP Camera event JSON streams.
 */
export class CpPlusDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "CP_PLUS";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const code = String(raw.Code || raw.code || raw.Event || raw.event || "");
    const vendor = String(raw.Vendor || raw.vendor || raw.brand || "").toUpperCase();
    if (vendor === "CP_PLUS" || vendor === "CPPLUS") return true;

    // Signature CP PLUS / Dahua protocol event codes
    const cpCodes = [
      "VideoLoss",
      "VideoBlind",
      "BlindDetect",
      "MotionDetect",
      "StorageNotExist",
      "StorageFailure",
      "DiskFull",
      "IPCDisConnect",
      "RecordFailure",
      "CrossLineDetection",
      "IntrusionDetection",
      "AlarmLocal",
      "AccessControl",
      "Defocus",
    ];
    return cpCodes.some((c) => code.toLowerCase() === c.toLowerCase());
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const rawCode = String(raw.Code || raw.code || raw.Event || raw.event || "Unknown");
    const rawCodeUpper = rawCode.toUpperCase();
    const data = (raw.Data || raw.data || raw.Params || raw) as Record<string, unknown>;

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.UTC || raw.Time || raw.timestamp || data.Time || data.UTC,
    );

    const channel = typeof data.Channel === "number"
      ? data.Channel
      : typeof raw.channel === "number"
      ? raw.channel
      : undefined;

    const cameraId =
      (raw.cameraId as string) ||
      (data.CameraId as string) ||
      (context?.cameraId ? context.cameraId : channel ? `CAM-${channel}` : undefined);

    const deviceId =
      (raw.deviceId as string) ||
      (raw.nvrId as string) ||
      (data.DeviceId as string) ||
      context?.deviceId ||
      "NVR-CPPLUS-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = "low";
    let details: DeviceEvent["details"] = undefined;

    // 1. VIDEO LOSS
    if (rawCodeUpper.includes("VIDEOLOSS") || rawCodeUpper.includes("VIDEO_LOSS")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    }
    // 2. TAMPER
    else if (
      rawCodeUpper.includes("BLIND") ||
      rawCodeUpper.includes("SHELTER") ||
      rawCodeUpper.includes("DEFOCUS") ||
      rawCodeUpper.includes("TAMPER")
    ) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: rawCodeUpper.includes("DEFOCUS") ? "DEFOCUS" : "MASKING_BLIND",
          confidence: 0.95,
        },
      };
    }
    // 3. STORAGE FAULT
    else if (
      rawCodeUpper.includes("STORAGE") ||
      rawCodeUpper.includes("DISK") ||
      rawCodeUpper.includes("HDD")
    ) {
      type = "STORAGE_FAULT";
      severity = "critical";
      details = {
        storage: {
          storageFaultType: rawCodeUpper.includes("FULL") ? "DISK_FULL" : "DISK_ERROR",
          diskIndex: typeof data.DiskIndex === "number" ? data.DiskIndex : 0,
        },
      };
    }
    // 4. CAMERA OFFLINE
    else if (
      rawCodeUpper.includes("IPCDISCONNECT") ||
      rawCodeUpper.includes("OFFLINE") ||
      rawCodeUpper.includes("DEVICEDISCONNECT")
    ) {
      type = "CAMERA_OFFLINE";
      severity = "high";
    }
    // 5. RECORDING FAILURE
    else if (
      rawCodeUpper.includes("RECORDFAILURE") ||
      rawCodeUpper.includes("RECORD_FAIL") ||
      rawCodeUpper.includes("WRITE_ERROR")
    ) {
      type = "RECORDING_FAILURE";
      severity = "critical";
      details = {
        recording: {
          failureReason: "ENCODER_STALL",
        },
      };
    }
    // 6. ANALYTICS (IVS)
    else if (
      rawCodeUpper.includes("CROSSLINE") ||
      rawCodeUpper.includes("INTRUSION") ||
      rawCodeUpper.includes("IVS") ||
      rawCodeUpper.includes("FACE") ||
      rawCodeUpper.includes("PLATE")
    ) {
      type = "ANALYTICS";
      severity = "high";
      const analyticsType = rawCodeUpper.includes("CROSSLINE")
        ? "LINE_CROSSING"
        : rawCodeUpper.includes("FACE")
        ? "FACE_DETECTED"
        : rawCodeUpper.includes("PLATE")
        ? "PLATE_RECOGNIZED"
        : "INTRUSION";

      details = {
        analytics: {
          analyticsType,
          confidence: typeof data.Confidence === "number" ? data.Confidence : 0.92,
          zoneName: (data.RuleName as string) || (data.Zone as string) || "Vault Perimeter",
          targetType: "HUMAN",
        },
      };
    }
    // 7. RELAY
    else if (rawCodeUpper.includes("ALARM") || rawCodeUpper.includes("RELAY")) {
      type = "RELAY";
      severity = "medium";
      details = {
        relay: {
          relayIndex: typeof data.Index === "number" ? data.Index : 1,
          relayState: "TRIGGERED",
          inputOrOutput: "INPUT",
        },
      };
    }
    // 8. DOOR / ACCESS
    else if (
      rawCodeUpper.includes("ACCESS") ||
      rawCodeUpper.includes("CARD") ||
      rawCodeUpper.includes("DOOR")
    ) {
      type = "DOOR_ACCESS";
      const isForced = rawCodeUpper.includes("FORCED") || rawCodeUpper.includes("BREAK");
      const isDenied = rawCodeUpper.includes("DENIED") || rawCodeUpper.includes("INVALID");
      severity = isForced ? "critical" : isDenied ? "high" : "info";

      details = {
        access: {
          accessType: isForced
            ? "DOOR_FORCED_OPEN"
            : isDenied
            ? "ACCESS_DENIED"
            : "ACCESS_GRANTED",
          cardId: (data.CardNo as string) || (data.CardNumber as string),
          userId: data.UserID ? String(data.UserID) : undefined,
          userName: (data.UserName as string) || (data.Name as string),
        },
      };
    }
    // 9. MOTION (Default)
    else {
      type = "MOTION";
      severity = "low";
      details = {
        motion: {
          motionLevel: typeof data.Level === "number" ? data.Level : 0.75,
        },
      };
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
      rawEventCode: rawCode,
      rawPayload: raw,
      context,
    });
  }
}
