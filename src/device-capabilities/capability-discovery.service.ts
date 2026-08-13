/**
 * Capability Discovery Service
 * 
 * Orchestrates multiple capability probes to discover device capabilities.
 */

import type {
  CapabilityProbe,
  CapabilityProbeContext,
  CapabilityObservation,
  DeviceIdentity,
  ProbeResult,
} from "./capability-probe.interface.js";
import { ProbeError } from "./capability-probe.interface.js";
import type { CapabilityKey } from "./capability.types.js";

export interface DiscoveryOptions {
  /** Timeout for entire discovery in milliseconds */
  timeout?: number;

  /** Whether to perform active verification */
  activeVerification?: boolean;

  /** Specific probes to run (if not specified, runs all applicable) */
  probeIds?: string[];
}

export interface VerifyOptions {
  /** Timeout for verification in milliseconds */
  timeout?: number;
}

export class CapabilityDiscoveryService {
  private readonly probes: Map<string, CapabilityProbe> = new Map();

  constructor(probes: CapabilityProbe[] = []) {
    for (const probe of probes) {
      this.registerProbe(probe);
    }
  }

  /**
   * Register a capability probe.
   */
  registerProbe(probe: CapabilityProbe): void {
    this.probes.set(probe.id, probe);
  }

  /**
   * Unregister a capability probe.
   */
  unregisterProbe(probeId: string): boolean {
    return this.probes.delete(probeId);
  }

  /**
   * Discover capabilities from a device.
   */
  async discover(
    device: DeviceIdentity,
    options: DiscoveryOptions = {},
  ): Promise<CapabilityObservation[]> {
    const context: CapabilityProbeContext = {
      device,
      timeout: options.timeout,
      activeVerification: options.activeVerification ?? false,
    };

    // Get applicable probes
    const applicableProbes = this.getApplicableProbes(device, options.probeIds);

    // Sort by priority (highest first)
    applicableProbes.sort((a, b) => b.priority - a.priority);

    // Run probes
    const results = await this.runProbes(applicableProbes, context);

    // Collect all observations
    const observations: CapabilityObservation[] = [];
    for (const result of results) {
      if (result.success) {
        observations.push(...result.observations);
      }
    }

    return observations;
  }

  /**
   * Verify a specific capability.
   */
  async verify(
    device: DeviceIdentity,
    capability: CapabilityKey,
    options: VerifyOptions = {},
  ): Promise<CapabilityObservation | null> {
    const context: CapabilityProbeContext = {
      device,
      timeout: options.timeout,
      activeVerification: true,
    };

    // Find probes that can verify this capability
    const applicableProbes = this.getApplicableProbes(device);

    for (const probe of applicableProbes) {
      if (probe.verify) {
        try {
          const observation = await probe.verify(context, capability);
          if (observation) {
            return observation;
          }
        } catch (error) {
          // Continue to next probe
          console.warn(
            `Probe ${probe.id} failed to verify ${capability}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    return null;
  }

  /**
   * Get probe results for debugging.
   */
  async discoverWithResults(
    device: DeviceIdentity,
    options: DiscoveryOptions = {},
  ): Promise<{
    observations: CapabilityObservation[];
    results: ProbeResult[];
  }> {
    const context: CapabilityProbeContext = {
      device,
      timeout: options.timeout,
      activeVerification: options.activeVerification ?? false,
    };

    const applicableProbes = this.getApplicableProbes(device, options.probeIds);
    applicableProbes.sort((a, b) => b.priority - a.priority);

    const results = await this.runProbes(applicableProbes, context);

    const observations: CapabilityObservation[] = [];
    for (const result of results) {
      if (result.success) {
        observations.push(...result.observations);
      }
    }

    return { observations, results };
  }

  /**
   * Get list of registered probes.
   */
  listProbes(): Array<{ id: string; priority: number }> {
    return Array.from(this.probes.values()).map((probe) => ({
      id: probe.id,
      priority: probe.priority,
    }));
  }

  // ============ PRIVATE METHODS ============

  private getApplicableProbes(
    device: DeviceIdentity,
    probeIds?: string[],
  ): CapabilityProbe[] {
    const allProbes = Array.from(this.probes.values());

    // Filter by probe IDs if specified
    const filteredByIds = probeIds
      ? allProbes.filter((probe) => probeIds.includes(probe.id))
      : allProbes;

    // Filter by device support
    return filteredByIds.filter((probe) => probe.supports(device));
  }

  private async runProbes(
    probes: CapabilityProbe[],
    context: CapabilityProbeContext,
  ): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];

    for (const probe of probes) {
      const result = await this.runProbe(probe, context);
      results.push(result);
    }

    return results;
  }

  private async runProbe(
    probe: CapabilityProbe,
    context: CapabilityProbeContext,
  ): Promise<ProbeResult> {
    const startTime = Date.now();

    try {
      const observations = await probe.probe(context);
      const durationMs = Date.now() - startTime;

      return {
        probeId: probe.id,
        deviceId: context.device.deviceId,
        success: true,
        observationCount: observations.length,
        durationMs,
        observations,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        probeId: probe.id,
        deviceId: context.device.deviceId,
        success: false,
        observationCount: 0,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
        observations: [],
      };
    }
  }
}
