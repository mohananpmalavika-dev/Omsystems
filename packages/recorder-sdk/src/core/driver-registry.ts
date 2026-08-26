/**
 * Driver Registry
 * 
 * Central registry for recorder drivers.
 * Handles driver selection and instantiation.
 */

import type {
  RecorderDriver,
  DriverDetector,
  DriverDetectionResult,
} from "./recorder-driver.interface.js";
import type { RecorderProtocol } from "./recorder-driver.types.js";

/**
 * Driver registry
 * 
 * Maintains available drivers and provides lookup.
 */
export class RecorderDriverRegistry {
  private drivers = new Map<RecorderProtocol, () => RecorderDriver>();
  private detector?: DriverDetector;

  /**
   * Register a driver or factory
   */
  register(driverOrProtocol: RecorderDriver | RecorderProtocol, factory?: () => RecorderDriver): void {
    if (typeof driverOrProtocol === "string") {
      if (factory) {
        this.drivers.set(driverOrProtocol, factory);
      }
    } else {
      const driver = driverOrProtocol;
      this.drivers.set(driver.protocol, () => driver);
    }
  }

  /**
   * Set driver detector
   */
  setDetector(detector: DriverDetector): void {
    this.detector = detector;
  }

  /**
   * Get driver by protocol
   */
  getDriver(protocol: RecorderProtocol): RecorderDriver {
    const factory = this.drivers.get(protocol);
    if (!factory) {
      throw new UnsupportedProtocolError(protocol);
    }
    return factory();
  }

  get(protocol: RecorderProtocol): RecorderDriver | undefined {
    const factory = this.drivers.get(protocol);
    return factory ? factory() : undefined;
  }

  has(protocol: RecorderProtocol): boolean {
    return this.drivers.has(protocol);
  }

  size(): number {
    return this.drivers.size;
  }

  /**
   * Detect and get driver
   * 
   * Automatically detects protocol and returns appropriate driver.
   */
  async detectAndGetDriver(
    endpoint: {
      host: string;
      port: number;
      scheme: "http" | "https";
    },
    credentials: {
      username: string;
      password: string;
    },
    options?: {
      timeoutMs?: number;
      tryAllDrivers?: boolean;
    }
  ): Promise<{
    driver: RecorderDriver;
    detection: DriverDetectionResult;
  }> {
    if (!this.detector) {
      throw new Error("Driver detector not configured");
    }

    const detection = await this.detector.detect(endpoint, credentials, options);
    // Detection must never make an otherwise reachable recorder unusable.
    // Unknown brands and white-label models can still expose a standards-based
    // RTSP stream, so use the generic driver whenever no specialised protocol
    // driver has been registered.
    const driver = this.get(detection.protocol) ?? this.getDriver("generic-rtsp");
    return { driver, detection };
  }

  /**
   * List available protocols
   */
  getAvailableProtocols(): RecorderProtocol[] {
    return Array.from(this.drivers.keys());
  }

  /**
   * Check if protocol is supported
   */
  isSupported(protocol: RecorderProtocol): boolean {
    return this.drivers.has(protocol);
  }
}

export { RecorderDriverRegistry as DriverRegistry };

/**
 * Unsupported protocol error
 */
export class UnsupportedProtocolError extends Error {
  constructor(protocol: RecorderProtocol) {
    super(`Unsupported recorder protocol: ${protocol}`);
    this.name = "UnsupportedProtocolError";
  }
}

/**
 * Global driver registry instance
 */
export const globalDriverRegistry = new RecorderDriverRegistry();
