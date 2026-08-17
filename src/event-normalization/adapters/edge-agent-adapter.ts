import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * Sentinel Edge Agent Device Event Adapter
 * 
 * Normalizes local edge daemon telemetry, FFmpeg stream stalls, disk health, and local AI alerts.
 */
export class EdgeAgentDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "EDGE_AGENT";

  canHandle(raw: Record<string, unknown>): boolean {
    if (!raw || typeof raw !== "object") return false;
    const vendor = String(raw.Vendor || raw.vendor || raw.brand || "").toUpperCase();
    if (vendor === "EDGE_AGENT" || vendor === "SENTINEL_EDGE") return true;

    return "edgeGatewayId" in raw || "streamStallSeconds" in raw || "ffmpegExitCode" in raw;
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const rawType = String(raw.eventType || raw.type || raw.code || "STREAM_HEALTH");
    const rawTypeUpper = rawType.toUpperCase();

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.timestamp || raw.capturedAt || raw.sourceTimestamp,
    );

    const cameraId = (raw.cameraId as string) || context?.cameraId;
    const deviceId = (raw.edgeGatewayId as string) || (raw.deviceId as string) || context?.deviceId || "GW-EDGE-01";

    let type: DeviceEventType = "CAMERA_OFFLINE";
    let severity: DeviceEventSeverity = "high";
    let details: DeviceEvent["details"] = undefined;

    if (rawTypeUpper.includes("VIDEO_LOSS") || rawTypeUpper.includes("STREAM_STALL")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    } else if (rawTypeUpper.includes("TAMPER") || rawTypeUpper.includes("BLACK_FRAME") || rawTypeUpper.includes("FROZEN")) {
      type = "TAMPER";
      severity = "high";
      details = {
        tamper: {
          tamperType: rawTypeUpper.includes("FROZEN") ? "FROZEN_VIDEO" : rawTypeUpper.includes("BLACK") ? "BLACK_FRAME" : "MASKING_BLIND",
          confidence: 0.99,
        },
      };
    } else if (rawTypeUpper.includes("DISK") || rawTypeUpper.includes("STORAGE")) {
      type = "STORAGE_FAULT";
      severity = "critical";
      details = {
        storage: {
          storageFaultType: "DISK_FULL",
        },
      };
    } else if (rawTypeUpper.includes("RECORDING_FAILURE") || rawTypeUpper.includes("SEGMENT_DROP")) {
      type = "RECORDING_FAILURE";
      severity = "critical";
      details = {
        recording: {
          failureReason: "WRITE_TIMEOUT",
        },
      };
    } else if (rawTypeUpper.includes("ANALYTICS") || rawTypeUpper.includes("YOLO") || rawTypeUpper.includes("INTRUSION")) {
      type = "ANALYTICS";
      severity = "high";
      details = {
        analytics: {
          analyticsType: "INTRUSION",
          confidence: 0.96,
          zoneName: "Edge Vision Vault Zone",
          targetType: "HUMAN",
        },
      };
    } else if (rawTypeUpper.includes("RELAY") || rawTypeUpper.includes("IO")) {
      type = "RELAY";
      severity = "medium";
    } else if (rawTypeUpper.includes("MOTION")) {
      type = "MOTION";
      severity = "low";
    } else {
      type = "CAMERA_OFFLINE";
      severity = "high";
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
      rawEventCode: rawType,
      rawPayload: raw,
      context,
    });
  }
}
