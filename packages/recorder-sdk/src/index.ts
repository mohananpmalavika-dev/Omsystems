/**
 * Recorder SDK
 * 
 * Canonical recorder driver SDK for unified DVR/NVR integration.
 * 
 * @packageDocumentation
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Vendor and protocol types
  RecorderVendor,
  RecorderProtocol,
  RecorderIdentity,
  
  // Context and endpoints
  RecorderContext,
  DeviceEndpoint,
  CredentialRef,
  
  // Health and capability types
  HealthState,
  CapabilityState,
  RecorderCapabilities,
  
  // Device information
  DeviceInfo,
  
  // Storage types
  StorageType,
  StorageVolume,
  StorageStatus,
  
  // Channel types
  ChannelSourceType,
  ChannelConnectionState,
  ChannelRecordingState,
  RecorderChannel,
  
  // Stream types
  StreamProfile,
  StreamEndpoint,
  StreamRequest,
  
  // Recording types
  RecordingSegment,
  RecordingSearchRequest,
  RecordingSearchResult,
  
  // Probe results
  RecorderProbeResult,
  
  // Error types
  RecorderDriverErrorCode
} from "./core/recorder-driver.types.js";

export {
  // Error classes
  RecorderDriverError,
  RecorderConnectionError,
  RecorderAuthenticationError,
  RecorderTimeoutError,
  RecorderProtocolError,
  UnsupportedCapabilityError
} from "./core/recorder-driver.types.js";

// ============================================================================
// Driver Interface
// ============================================================================

export type {
  // Main driver interface
  RecorderDriver,
  
  // Operation options and results
  ProbeOptions,
  ChannelStatus,
  RecordingStatus,
  DeviceTimeResult,
  
  // Detection
  DriverDetectionResult,
  DriverDetector
} from "./core/recorder-driver.interface.js";

// ============================================================================
// Driver Registry
// ============================================================================

export {
  // Registry classes
  RecorderDriverRegistry,
  UnsupportedProtocolError,
  globalDriverRegistry
} from "./core/driver-registry.js";

// ============================================================================
// Driver Detector
// ============================================================================

export {
  DefaultDriverDetector
} from "./core/driver-detector.js";

// ============================================================================
// Transport Layer
// ============================================================================

export type {
  // HTTP transport types
  HttpTransportConfig,
  HttpRequestOptions,
  HttpResponse,
  
  // Authentication types
  AuthProvider
} from "./transport/recorder-http-transport.js";

export {
  // Transport configuration
  DEFAULT_HTTP_CONFIG,
  
  // Authentication providers
  BasicAuthProvider,
  DigestAuthProvider
} from "./transport/recorder-http-transport.js";

export {
  // HTTP client
  RecorderHttpClient,
  
  // Credential resolution
  type CredentialResolver,
  InMemoryCredentialResolver
} from "./transport/recorder-http-client.js";

// ============================================================================
// Drivers
// ============================================================================

// Dahua/CP PLUS driver
export {
  DahuaCGIDriver
} from "./drivers/dahua/dahua-cgi.driver.js";

// Hikvision driver
export {
  HikvisionISAPIDriver
} from "./drivers/hikvision/hikvision-isapi.driver.js";

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create and configure global driver registry with all available drivers
 */
export function setupGlobalRegistry(): RecorderDriverRegistry {
  const { globalDriverRegistry } = require("./core/driver-registry.js");
  const { DahuaCGIDriver } = require("./drivers/dahua/dahua-cgi.driver.js");
  const { HikvisionISAPIDriver } = require("./drivers/hikvision/hikvision-isapi.driver.js");
  const { DefaultDriverDetector } = require("./core/driver-detector.js");
  
  // Register drivers
  globalDriverRegistry.register("dahua-cgi", () => new DahuaCGIDriver());
  globalDriverRegistry.register("hikvision-isapi", () => new HikvisionISAPIDriver());
  
  // Set detector
  globalDriverRegistry.setDetector(new DefaultDriverDetector());
  
  return globalDriverRegistry;
}

/**
 * Create a recorder driver for a specific protocol
 */
export function createDriver(protocol: RecorderProtocol): RecorderDriver {
  const { globalDriverRegistry } = require("./core/driver-registry.js");
  return globalDriverRegistry.getDriver(protocol);
}

/**
 * Detect and create appropriate driver for a recorder
 */
export async function detectAndCreateDriver(
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
  }
): Promise<{
  driver: RecorderDriver;
  detection: DriverDetectionResult;
}> {
  const { globalDriverRegistry } = require("./core/driver-registry.js");
  
  return await globalDriverRegistry.detectAndGetDriver(
    endpoint,
    credentials,
    options
  );
}

// ============================================================================
// Re-export for type convenience
// ============================================================================

import type { RecorderDriver } from "./core/recorder-driver.interface.js";
import type { RecorderProtocol, DriverDetectionResult } from "./core/recorder-driver.types.js";
import type { RecorderDriverRegistry } from "./core/driver-registry.js";
