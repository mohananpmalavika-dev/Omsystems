/**
 * Device Capability Probe Interface
 * 
 * Probes discover device capabilities from various sources (ONVIF, RTSP, vendor APIs, etc.).
 * Each probe is specialized for a particular protocol or device type.
 */

import type {
  CapabilityEvidence,
  DeviceCapabilitySet,
} from "./capability.types.js";

/**
 * Device identity information for probe selection.
 */
export interface DeviceIdentity {
  deviceId: string;
  tenantId: string;
  vendor?: string;
  model?: string;
  protocol?: string;
  ipAddress?: string;
  onvifEndpoint?: string;
  rtspUri?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

/**
 * Context passed to probes during discovery.
 */
export interface CapabilityProbeContext {
  device: DeviceIdentity;
  timeout?: number;
  /** Whether to perform active verification (execute commands) */
  activeVerification?: boolean;
  /** Previously discovered capabilities (for incremental probing) */
  existingCapabilities?: DeviceCapabilitySet;
}

/**
 * Result from a single capability observation.
 */
export interface CapabilityObservation {
  /** Capability path (e.g., "video.liveVideo", "ptz.presets") */
  capabilityPath: string;

  /** Evidence supporting this observation */
  evidence: CapabilityEvidence;

  /** Optional value for parameterized capabilities */
  value?: unknown;
}

/**
 * Interface for capability probe implementations.
 */
export interface CapabilityProbe {
  /** Unique probe identifier */
  readonly id: string;

  /** Probe priority (higher = runs first) */
  readonly priority: number;

  /**
   * Determine if this probe can handle the given device.
   */
  supports(device: DeviceIdentity): boolean;

  /**
   * Probe the device and return capability observations.
   * 
   * @throws ProbeError if probing fails
   */
  probe(context: CapabilityProbeContext): Promise<CapabilityObservation[]>;

  /**
   * Verify a specific capability (optional - for runtime verification).
   */
  verify?(
    context: CapabilityProbeContext,
    capabilityPath: string,
  ): Promise<CapabilityObservation | null>;
}

/**
 * Probe error with context.
 */
export class ProbeError extends Error {
  constructor(
    public readonly probeId: string,
    public readonly deviceId: string,
    message: string,
    public readonly cause?: Error,
  ) {
    super(`Probe ${probeId} failed for device ${deviceId}: ${message}`);
    this.name = "ProbeError";
  }
}

/**
 * Probe result summary.
 */
export interface ProbeResult {
  probeId: string;
  deviceId: string;
  success: boolean;
  observationCount: number;
  durationMs: number;
  error?: string;
  observations: CapabilityObservation[];
}
