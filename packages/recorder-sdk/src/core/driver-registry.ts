/**
 * Driver Registry
 * 
 * Central registry for recorder drivers.
 * Handles driver selection and instantiation.
 */

import type {
  RecorderDriver,
  DriverDetector,
  DriverDetectionResult
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
   * Register a driver
   */
  register(
    protocol: RecorderProtocol,
    factory: () => RecorderDriver
  ): void {
    this.drivers.set(protocol, factory);
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
    
    const detection = await this.detector.detect(
      endpoint,
      credentials,
      options
    );
    
    const driver = this.getDriver(detection.protocol);
    
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
