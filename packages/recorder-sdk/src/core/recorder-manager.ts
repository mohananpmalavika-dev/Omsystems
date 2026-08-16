/**
 * Central Recorder Manager & Driver Resolver
 * 
 * Orchestrates driver discovery, staged protocol resolution, circuit breaker isolation,
 * and authenticated session caching.
 */

import type {
  RecorderDriver,
  DriverDetectionResult,
} from "./recorder-driver.interface.js";
import type {
  RecorderContext,
  RecorderProtocol,
  RecorderVendor,
} from "./recorder-driver.types.js";
import { DriverRegistry } from "./driver-registry.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { RecorderSession } from "./recorder-session.js";
import { DahuaCGIDriver } from "../drivers/dahua/dahua-cgi.driver.js";
import { HikvisionISAPIDriver } from "../drivers/hikvision/hikvision-isapi.driver.js";
import { ONVIFDriver } from "../drivers/onvif/onvif.driver.js";
import { UniviewDriver } from "../drivers/uniview/uniview.driver.js";
import { GenericRecorderDriver } from "../drivers/generic/generic-rtsp.driver.js";

export class RecorderManager {
  private registry: DriverRegistry;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private activeSessions = new Map<string, RecorderSession>();

  constructor(registry?: DriverRegistry) {
    this.registry = registry ?? new DriverRegistry();
    this.registerDefaultDrivers();
  }

  private registerDefaultDrivers(): void {
    if (this.registry.size() === 0) {
      this.registry.register(new DahuaCGIDriver());
      this.registry.register(new HikvisionISAPIDriver());
      this.registry.register(new ONVIFDriver());
      this.registry.register(new UniviewDriver());
      this.registry.register(new GenericRecorderDriver());
    }
  }

  getRegistry(): DriverRegistry {
    return this.registry;
  }

  getCircuitBreaker(recorderId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(recorderId);
    if (!cb) {
      cb = new CircuitBreaker();
      this.circuitBreakers.set(recorderId, cb);
    }
    return cb;
  }

  /**
   * Opens or returns an active session for a recorder
   */
  async openSession(ctx: RecorderContext): Promise<RecorderSession> {
    const existing = this.activeSessions.get(ctx.recorderId);
    if (existing && Date.now() - existing.openedAt < 60_000) {
      return existing;
    }

    const driver = this.registry.get(ctx.protocol) ?? this.registry.get("generic-rtsp")!;
    const cb = this.getCircuitBreaker(ctx.recorderId);
    const session = new RecorderSession(ctx, driver, cb);

    this.activeSessions.set(ctx.recorderId, session);
    return session;
  }

  /**
   * Resolves the best driver for a connection using staged probing
   */
  async resolveDriver(
    vendorHint?: RecorderVendor,
    protocolHint?: RecorderProtocol
  ): Promise<{ driver: RecorderDriver; protocol: RecorderProtocol; confidence: number }> {
    // 1. Check explicit protocol hint
    if (protocolHint && protocolHint !== "unknown" && this.registry.has(protocolHint)) {
      return {
        driver: this.registry.get(protocolHint)!,
        protocol: protocolHint,
        confidence: 0.98,
      };
    }

    // 2. Check vendor identity mapping
    if (vendorHint === "cp-plus" || vendorHint === "dahua") {
      return {
        driver: this.registry.get("dahua-cgi")!,
        protocol: "dahua-cgi",
        confidence: 0.95,
      };
    }

    if (vendorHint === "hikvision" || vendorHint === "prama") {
      return {
        driver: this.registry.get("hikvision-isapi")!,
        protocol: "hikvision-isapi",
        confidence: 0.95,
      };
    }

    if (vendorHint === "uniview") {
      return {
        driver: this.registry.get("uniview-api")!,
        protocol: "uniview-api",
        confidence: 0.9,
      };
    }

    if (vendorHint === "onvif") {
      return {
        driver: this.registry.get("onvif")!,
        protocol: "onvif",
        confidence: 0.9,
      };
    }

    // Fallback generic RTSP
    return {
      driver: this.registry.get("generic-rtsp")!,
      protocol: "generic-rtsp",
      confidence: 0.5,
    };
  }

  closeSession(recorderId: string): void {
    this.activeSessions.delete(recorderId);
  }

  clearAllSessions(): void {
    this.activeSessions.clear();
  }
}

// Export singleton instance
export const recorderManager = new RecorderManager();
