import { randomUUID } from "node:crypto";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";

export abstract class BaseDeviceEventAdapter {
  abstract readonly vendorOrigin: VendorOrigin;

  abstract canHandle(raw: Record<string, unknown>): boolean;

  abstract normalize(
    raw: Record<string, unknown>,
    context?: NormalizationContext,
  ): DeviceEvent;

  /**
   * Helper to safely parse diverse vendor timestamps to ISO 8601 string.
   */
  protected parseSourceTimestamp(value: unknown): string {
    if (!value) return new Date().toISOString();

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === "number") {
      // If seconds epoch (10 digits), convert to ms
      const ms = value < 10_000_000_000 ? value * 1000 : value;
      return new Date(ms).toISOString();
    }

    if (typeof value === "string") {
      // Check standard ISO
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }

      // Check space-separated format: YYYY-MM-DD HH:mm:ss
      const spaceRegex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
      const match = value.match(spaceRegex);
      if (match) {
        const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
        const dt = Date.parse(iso);
        if (!Number.isNaN(dt)) {
          return new Date(dt).toISOString();
        }
      }
    }

    return new Date().toISOString();
  }

  /**
   * Calculates clock offset between source hardware clock and ingestion clock.
   */
  protected calculateClockOffsetMs(
    sourceTimestampIso: string,
    receivedTimestampIso: string,
  ): number {
    const src = new Date(sourceTimestampIso).getTime();
    const recv = new Date(receivedTimestampIso).getTime();
    return Math.abs(recv - src);
  }

  /**
   * Base template to construct standardized DeviceEvent envelope.
   */
  protected buildDeviceEvent(params: {
    tenantId?: string;
    branchId?: string;
    deviceId?: string;
    cameraId?: string;
    channel?: number;
    type: DeviceEventType;
    sourceTimestamp: string;
    receivedTimestamp?: string;
    severity: DeviceEventSeverity;
    details?: DeviceEvent["details"];
    rawEventCode?: string;
    rawPayload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    context?: NormalizationContext;
  }): DeviceEvent {
    const receivedTimestamp = params.receivedTimestamp || new Date().toISOString();
    const sourceTimestamp = params.sourceTimestamp;
    const offsetMs = this.calculateClockOffsetMs(sourceTimestamp, receivedTimestamp);

    const tenantId =
      params.tenantId ||
      params.context?.tenantId ||
      "00000000-0000-0000-0000-000000000000";

    const branchId =
      params.branchId ||
      params.context?.branchId ||
      "BR-GLOBAL";

    const deviceId =
      params.deviceId ||
      params.context?.deviceId ||
      (params.cameraId ? `NVR-${params.cameraId.split("-")[0]}` : "GW-DEFAULT");

    const cameraId = params.cameraId || params.context?.cameraId;
    const channel = params.channel ?? params.context?.channel;

    return {
      id: randomUUID(),
      tenantId,
      branchId,
      deviceId,
      ...(cameraId ? { cameraId } : {}),
      ...(channel !== undefined ? { channel } : {}),
      type: params.type,
      sourceTimestamp,
      receivedTimestamp,
      severity: params.severity,
      ...(params.details ? { details: params.details } : {}),
      observedClockOffsetMs: offsetMs,
      vendorOrigin: this.vendorOrigin,
      ...(params.rawEventCode ? { rawEventCode: params.rawEventCode } : {}),
      rawPayload: params.rawPayload,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };
  }
}
