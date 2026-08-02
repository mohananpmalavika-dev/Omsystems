/**
 * Maintenance health collection coordinator.
 *
 * Device health is measured by the Branch Gateway and ingested through the
 * operational telemetry APIs. The former implementation generated random
 * temperatures, latency, disk, bandwidth, and UPS values; that could make an
 * unmeasured branch look healthy. This coordinator therefore reports the real
 * ingestion mode and never synthesizes device evidence in the control plane.
 */

import type { ControlPlaneStore } from "../control-plane-store.js";

export interface HealthMetric {
  componentId: string;
  componentType: "camera" | "storage" | "network" | "ups" | "recorder";
  metricName: string;
  value: number;
  unit: string;
  timestamp: Date;
  status: "healthy" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}

export class HealthCollectorService {
  private isRunning = false;

  constructor(
    // Retained in the constructor contract for compatibility with the service
    // bootstrap. Measurements are written by authenticated gateway ingestion.
    private readonly store: ControlPlaneStore,
    private readonly logger: any = console,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info({
      source: "authenticated-edge-telemetry",
      syntheticMetrics: false,
    }, "Maintenance health collection uses Branch Gateway telemetry");
  }

  stop(): void {
    this.isRunning = false;
  }

  getStatus(): {
    running: boolean;
    collectors: string[];
    source: "authenticated-edge-telemetry";
    syntheticMetrics: false;
  } {
    // Touch the dependency to keep the coordinator's ownership explicit.
    void this.store;
    return {
      running: this.isRunning,
      collectors: ["edge-agent", "camera", "recorder", "storage", "network"],
      source: "authenticated-edge-telemetry",
      syntheticMetrics: false,
    };
  }
}

let healthCollectorInstance: HealthCollectorService | null = null;

export function initHealthCollector(store: ControlPlaneStore, logger?: any): HealthCollectorService {
  if (!healthCollectorInstance) healthCollectorInstance = new HealthCollectorService(store, logger);
  return healthCollectorInstance;
}

export function getHealthCollector(): HealthCollectorService | null {
  return healthCollectorInstance;
}
