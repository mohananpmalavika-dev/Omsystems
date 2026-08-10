/**
 * Telemetry Event Normalizer
 * 
 * Converts various telemetry sources into a normalized OperationalEvent format
 * for consistent processing by the RCA engine.
 */

import type { CommandTimelineEvent } from "../types.js";
import type { OperationalEvent } from "./types.js";

/**
 * Normalize timeline events into operational events
 */
export function normalizeTimelineEvents(events: CommandTimelineEvent[]): OperationalEvent[] {
  return events
    .filter(event => event.category === "telemetry")
    .map(normalizeEvent)
    .filter((event): event is OperationalEvent => event !== null);
}

/**
 * Normalize a single timeline event
 */
function normalizeEvent(event: CommandTimelineEvent): OperationalEvent | null {
  // Map event type to entity type
  const entityType = mapEntityType(event.entityType);
  if (!entityType) return null;
  
  // Map severity
  const severity = mapSeverity(event.severity, event.eventType);
  
  // Extract metrics
  const metrics = extractMetrics(event);
  
  // Calculate confidence based on source quality
  const confidence = calculateConfidence(event);
  
  return {
    id: event.id,
    tenantId: event.tenantId || "unknown",
    timestamp: event.occurredAt,
    entity: {
      type: entityType,
      id: event.entityId || "unknown",
      name: extractEntityName(event),
    },
    branchId: event.branchId,
    eventType: mapEventType(event.eventType),
    severity,
    metrics,
    source: mapSource(event.source),
    confidence,
  };
}

/**
 * Map entity type to normalized format
 */
function mapEntityType(
  type: string
): OperationalEvent["entity"]["type"] | null {
  const mapping: Record<string, OperationalEvent["entity"]["type"]> = {
    camera: "camera",
    recorder: "dvr",
    dvr: "dvr",
    network: "network",
    router: "router",
    switch: "switch",
    "edge-agent": "edge_agent",
    ups: "ups",
    disk: "storage",
    branch: "branch",
  };
  
  return mapping[type] || null;
}

/**
 * Map event type to normalized format
 */
function mapEventType(type: string): OperationalEvent["eventType"] {
  const mapping: Record<string, OperationalEvent["eventType"]> = {
    camera_offline: "camera_offline",
    recorder_unavailable: "dvr_offline",
    recorder_degraded: "recorder_degraded",
    recording_degraded: "recording_stopped",
    network_unavailable: "wan_down",
    network_degraded: "network_degraded",
    packet_loss: "packet_loss",
    latency_high: "latency_high",
    edge_agent_offline: "edge_agent_offline",
    power_loss: "power_loss",
    power_on_battery: "power_on_battery",
    disk_failure: "disk_failure",
    wan_down: "wan_down",
  };
  
  return mapping[type] || "network_degraded";
}

/**
 * Map severity to normalized format
 */
function mapSeverity(
  severity: "info" | "warning" | "critical",
  eventType: string
): "P1" | "P2" | "P3" | "P4" {
  // Critical infrastructure failures
  if (severity === "critical") {
    if (eventType.includes("power") || eventType.includes("wan")) {
      return "P1";
    }
    return "P2";
  }
  
  if (severity === "warning") {
    return "P3";
  }
  
  return "P4";
}

/**
 * Extract metrics from timeline event
 */
function extractMetrics(event: CommandTimelineEvent): OperationalEvent["metrics"] {
  const raw = event.raw.metrics;
  if (!raw || typeof raw !== "object") return {};
  
  const metrics: OperationalEvent["metrics"] = {};
  
  // Extract known metrics
  if ("latencyMs" in raw && typeof raw.latencyMs === "number") {
    metrics.latencyMs = raw.latencyMs;
  }
  
  if ("packetLossPercent" in raw && typeof raw.packetLossPercent === "number") {
    metrics.packetLoss = raw.packetLossPercent;
  }
  
  if ("jitterMs" in raw && typeof raw.jitterMs === "number") {
    metrics.jitterMs = raw.jitterMs;
  }
  
  if ("uptime" in raw && typeof raw.uptime === "number") {
    metrics.uptime = raw.uptime;
  }
  
  if ("batteryChargePercent" in raw && typeof raw.batteryChargePercent === "number") {
    metrics.batteryPercent = raw.batteryChargePercent;
  }
  
  if ("diskUsagePercent" in raw && typeof raw.diskUsagePercent === "number") {
    metrics.diskUsagePercent = raw.diskUsagePercent;
  }
  
  return metrics;
}

/**
 * Calculate confidence based on data quality
 */
function calculateConfidence(event: CommandTimelineEvent): number {
  const source = event.source.toLowerCase();
  
  // Verified telemetry - highest confidence
  if (source.includes("verified")) return 0.95;
  
  // Direct telemetry
  if (source.includes("telemetry")) return 0.85;
  
  // Estimated values
  if (source.includes("estimated")) return 0.65;
  
  // Derived or system-generated
  if (source.includes("derived") || source.includes("system")) return 0.75;
  
  // Unsupported or unavailable
  if (source.includes("unsupported") || source.includes("unavailable")) return 0.40;
  
  // Default
  return 0.70;
}

/**
 * Map source to normalized format
 */
function mapSource(source: string): OperationalEvent["source"] {
  const lower = source.toLowerCase();
  
  if (lower.includes("camera")) return "camera";
  if (lower.includes("dvr") || lower.includes("recorder")) return "dvr";
  if (lower.includes("edge")) return "edge";
  if (lower.includes("network")) return "network";
  if (lower.includes("ai")) return "ai";
  if (lower.includes("telemetry")) return "telemetry";
  
  return "system";
}

/**
 * Extract entity name from event
 */
function extractEntityName(event: CommandTimelineEvent): string | undefined {
  // Try to extract from title or detail
  const title = event.title;
  
  // Pattern: "Camera X reported..."
  const match = title.match(/^(\w+\s+[\w-]+)/);
  if (match) {
    return match[1];
  }
  
  return undefined;
}

/**
 * Group events by entity
 */
export function groupByEntity(events: OperationalEvent[]): Map<string, OperationalEvent[]> {
  const grouped = new Map<string, OperationalEvent[]>();
  
  for (const event of events) {
    const key = `${event.entity.type}:${event.entity.id}`;
    const existing = grouped.get(key) || [];
    existing.push(event);
    grouped.set(key, existing);
  }
  
  return grouped;
}

/**
 * Group events by branch
 */
export function groupByBranch(events: OperationalEvent[]): Map<string, OperationalEvent[]> {
  const grouped = new Map<string, OperationalEvent[]>();
  
  for (const event of events) {
    if (!event.branchId) continue;
    
    const existing = grouped.get(event.branchId) || [];
    existing.push(event);
    grouped.set(event.branchId, existing);
  }
  
  return grouped;
}

/**
 * Filter events by time window
 */
export function filterByTimeWindow(
  events: OperationalEvent[],
  startTime: string,
  endTime: string
): OperationalEvent[] {
  return events.filter(
    event => event.timestamp >= startTime && event.timestamp <= endTime
  );
}

/**
 * Filter events by entity type
 */
export function filterByEntityType(
  events: OperationalEvent[],
  type: OperationalEvent["entity"]["type"]
): OperationalEvent[] {
  return events.filter(event => event.entity.type === type);
}

/**
 * Sort events chronologically
 */
export function sortChronologically(events: OperationalEvent[]): OperationalEvent[] {
  return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
