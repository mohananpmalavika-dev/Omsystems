import { EventEmitter } from "node:events";
import type {
  DeviceEvent,
  DeviceEventType,
  DeviceEventSeverity,
  NormalizationContext,
  VendorOrigin,
} from "../domain/device-event.types.js";
import { BaseDeviceEventAdapter } from "../adapters/base-adapter.js";
import { CpPlusDeviceEventAdapter } from "../adapters/cpplus-adapter.js";
import { DahuaDeviceEventAdapter } from "../adapters/dahua-adapter.js";
import { HikvisionDeviceEventAdapter } from "../adapters/hikvision-adapter.js";
import { AxisDeviceEventAdapter } from "../adapters/axis-adapter.js";
import { OnvifDeviceEventAdapter } from "../adapters/onvif-adapter.js";
import { EdgeAgentDeviceEventAdapter } from "../adapters/edge-agent-adapter.js";
import { GenericDeviceEventAdapter } from "../adapters/generic-adapter.js";
import { severityEvaluatorService, SeverityEvaluatorService } from "./severity-evaluator.service.js";

export interface EventFilterQuery {
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  cameraId?: string;
  type?: DeviceEventType;
  severity?: DeviceEventSeverity;
  from?: string;
  to?: string;
  limit?: number;
}

export class EventNormalizationService extends EventEmitter {
  private readonly adapters: BaseDeviceEventAdapter[];
  private readonly fallbackAdapter: GenericDeviceEventAdapter;
  private readonly severityEvaluator: SeverityEvaluatorService;
  private readonly eventStore: DeviceEvent[] = [];
  private readonly maxInMemoryEvents = 2000;

  constructor() {
    super();
    this.fallbackAdapter = new GenericDeviceEventAdapter();
    this.adapters = [
      new CpPlusDeviceEventAdapter(),
      new DahuaDeviceEventAdapter(),
      new HikvisionDeviceEventAdapter(),
      new AxisDeviceEventAdapter(),
      new OnvifDeviceEventAdapter(),
      new EdgeAgentDeviceEventAdapter(),
      this.fallbackAdapter,
    ];
    this.severityEvaluator = severityEvaluatorService;
  }

  /**
   * Normalizes raw event payload to canonical DeviceEvent without persisting.
   */
  normalizeEvent(
    rawPayload: Record<string, unknown>,
    context?: NormalizationContext,
    vendorHint?: VendorOrigin,
  ): DeviceEvent {
    let selectedAdapter: BaseDeviceEventAdapter = this.fallbackAdapter;

    if (vendorHint) {
      const match = this.adapters.find((a) => a.vendorOrigin === vendorHint);
      if (match) selectedAdapter = match;
    } else {
      for (const adapter of this.adapters) {
        if (adapter !== this.fallbackAdapter && adapter.canHandle(rawPayload)) {
          selectedAdapter = adapter;
          break;
        }
      }
    }

    const deviceEvent = selectedAdapter.normalize(rawPayload, context);

    // Apply context-aware severity evaluation
    deviceEvent.severity = this.severityEvaluator.evaluateSeverity(deviceEvent, context);

    return deviceEvent;
  }

  /**
   * Ingests a raw event: normalizes, persists in history buffer, and emits to listeners.
   */
  async ingestRawEvent(
    rawPayload: Record<string, unknown>,
    context?: NormalizationContext,
    vendorHint?: VendorOrigin,
  ): Promise<DeviceEvent> {
    const normalized = this.normalizeEvent(rawPayload, context, vendorHint);
    return this.recordEvent(normalized);
  }

  /**
   * Ingests an already normalized DeviceEvent envelope directly.
   */
  async recordEvent(event: DeviceEvent): Promise<DeviceEvent> {
    // Ring buffer storage
    this.eventStore.unshift(event);
    if (this.eventStore.length > this.maxInMemoryEvents) {
      this.eventStore.pop();
    }

    // Emit to real-time subscribers & incident engines
    this.emit("device_event", event);
    this.emit(`device_event:${event.type}`, event);
    if (event.branchId) {
      this.emit(`branch_event:${event.branchId}`, event);
    }

    return event;
  }

  /**
   * Batch ingests multiple raw events.
   */
  async batchIngest(
    rawEvents: Array<Record<string, unknown>>,
    context?: NormalizationContext,
    vendorHint?: VendorOrigin,
  ): Promise<{ ingested: DeviceEvent[]; count: number }> {
    const ingested: DeviceEvent[] = [];
    for (const raw of rawEvents) {
      const normalized = await this.ingestRawEvent(raw, context, vendorHint);
      ingested.push(normalized);
    }
    return { ingested, count: ingested.length };
  }

  /**
   * Query recent normalized events with multi-criteria filtering.
   */
  getRecentEvents(query?: EventFilterQuery): DeviceEvent[] {
    let result = [...this.eventStore];

    if (!query) return result.slice(0, 100);

    if (query.tenantId) {
      result = result.filter((e) => e.tenantId === query.tenantId);
    }
    if (query.branchId) {
      result = result.filter((e) => e.branchId === query.branchId);
    }
    if (query.deviceId) {
      result = result.filter((e) => e.deviceId === query.deviceId);
    }
    if (query.cameraId) {
      result = result.filter((e) => e.cameraId === query.cameraId);
    }
    if (query.type) {
      result = result.filter((e) => e.type === query.type);
    }
    if (query.severity) {
      result = result.filter((e) => e.severity === query.severity);
    }
    if (query.from) {
      const fromTime = new Date(query.from).getTime();
      result = result.filter((e) => new Date(e.sourceTimestamp).getTime() >= fromTime);
    }
    if (query.to) {
      const toTime = new Date(query.to).getTime();
      result = result.filter((e) => new Date(e.sourceTimestamp).getTime() <= toTime);
    }

    const limit = query.limit || 100;
    return result.slice(0, limit);
  }

  /**
   * Get supported normalization taxonomy definition.
   */
  getSupportedEventTaxonomy(): {
    types: DeviceEventType[];
    vendors: VendorOrigin[];
    severities: DeviceEventSeverity[];
  } {
    return {
      types: [
        "MOTION",
        "VIDEO_LOSS",
        "TAMPER",
        "STORAGE_FAULT",
        "CAMERA_OFFLINE",
        "RECORDING_FAILURE",
        "ANALYTICS",
        "RELAY",
        "DOOR_ACCESS",
      ],
      vendors: [
        "CP_PLUS",
        "DAHUA",
        "HIKVISION",
        "AXIS",
        "ONVIF",
        "EDGE_AGENT",
        "GENERIC",
      ],
      severities: ["info", "low", "medium", "high", "critical"],
    };
  }
}

export const eventNormalizationService = new EventNormalizationService();
