import { BaseDeviceEventAdapter } from "./base-adapter.js";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

/**
 * Generic Device Event Adapter
 * 
 * Catch-all adapter that parses arbitrary JSON payloads, mapping event names to
 * canonical DeviceEvent types (MOTION, VIDEO_LOSS, TAMPER, STORAGE_FAULT, CAMERA_OFFLINE,
 * RECORDING_FAILURE, ANALYTICS, RELAY, DOOR_ACCESS).
 */
export class GenericDeviceEventAdapter extends BaseDeviceEventAdapter {
  readonly vendorOrigin: VendorOrigin = "GENERIC";

  canHandle(_raw: Record<string, unknown>): boolean {
    return true; // Fallback adapter accepts all records
  }

  normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent {
    const rawType = String(
      raw.type || raw.eventType || raw.event || raw.code || raw.name || "MOTION",
    );
    const rawTypeUpper = rawType.toUpperCase();

    const sourceTimestamp = this.parseSourceTimestamp(
      raw.sourceTimestamp || raw.timestamp || raw.time || raw.dateTime || raw.occurredAt,
    );

    const cameraId = (raw.cameraId as string) || context?.cameraId;
    const channel = typeof raw.channel === "number" ? raw.channel : context?.channel;
    const deviceId =
      (raw.deviceId as string) ||
      (raw.nvrId as string) ||
      (raw.gatewayId as string) ||
      context?.deviceId ||
      "DEV-GENERIC-01";

    let type: DeviceEventType = "MOTION";
    let severity: DeviceEventSeverity = (raw.severity as DeviceEventSeverity) || "low";
    let details: DeviceEvent["details"] = (raw.details as DeviceEvent["details"]) || undefined;

    // Direct match or regex classification
    if (rawTypeUpper === "VIDEO_LOSS" || rawTypeUpper.includes("VIDEO_LOSS") || rawTypeUpper.includes("VIDEOLOSS")) {
      type = "VIDEO_LOSS";
      severity = "critical";
    } else if (rawTypeUpper === "TAMPER" || rawTypeUpper.includes("TAMPER") || rawTypeUpper.includes("BLIND")) {
      type = "TAMPER";
      severity = "high";
    } else if (rawTypeUpper === "STORAGE_FAULT" || rawTypeUpper.includes("STORAGE") || rawTypeUpper.includes("DISK")) {
      type = "STORAGE_FAULT";
      severity = "critical";
    } else if (rawTypeUpper === "CAMERA_OFFLINE" || rawTypeUpper.includes("OFFLINE") || rawTypeUpper.includes("DISCONNECT")) {
      type = "CAMERA_OFFLINE";
      severity = "high";
    } else if (rawTypeUpper === "RECORDING_FAILURE" || rawTypeUpper.includes("RECORDING_FAIL") || rawTypeUpper.includes("RECORD_ERROR")) {
      type = "RECORDING_FAILURE";
      severity = "critical";
    } else if (rawTypeUpper === "ANALYTICS" || rawTypeUpper.includes("INTRUSION") || rawTypeUpper.includes("LINE_CROSS")) {
      type = "ANALYTICS";
      severity = "high";
    } else if (rawTypeUpper === "RELAY" || rawTypeUpper.includes("RELAY") || rawTypeUpper.includes("ALARM_IN")) {
      type = "RELAY";
      severity = "medium";
    } else if (rawTypeUpper === "DOOR_ACCESS" || rawTypeUpper.includes("DOOR") || rawTypeUpper.includes("ACCESS")) {
      type = "DOOR_ACCESS";
      severity = rawTypeUpper.includes("FORCED") ? "critical" : rawTypeUpper.includes("DENIED") ? "high" : "info";
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
      rawEventCode: rawType,
      rawPayload: raw,
      metadata: raw.metadata as Record<string, unknown> | undefined,
      context,
    });
  }
}
