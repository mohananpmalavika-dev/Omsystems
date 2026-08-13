/**
 * Capability Policy Enforcement Middleware
 * 
 * Ensures operations are only executed if the device supports the required capability.
 */

import type { Request, Response, NextFunction } from "express";
import type { DeviceCapabilityRegistry, CapabilityKey } from "../device-capabilities/index.js";
import {
  CapabilityNotSupportedError,
  CapabilityUnavailableError,
  CapabilityUnknownError,
} from "../device-capabilities/index.js";

/**
 * Capability requirement configuration.
 */
export interface CapabilityRequirement {
  /** The capability key required */
  capability: CapabilityKey;

  /** Whether to allow degraded state (default: false) */
  allowDegraded?: boolean;

  /** Whether to allow unknown state (default: false) */
  allowUnknown?: boolean;

  /** Custom error message */
  errorMessage?: string;
}

/**
 * Options for capability policy middleware.
 */
export interface CapabilityPolicyOptions {
  /** Capability registry instance */
  registry: DeviceCapabilityRegistry;

  /** How to extract device ID from request */
  deviceIdExtractor?: (req: Request) => string;

  /** How to extract tenant ID from request */
  tenantIdExtractor?: (req: Request) => string;

  /** Whether to skip enforcement in development */
  skipInDevelopment?: boolean;
}

/**
 * Create capability policy enforcement middleware.
 */
export function createCapabilityPolicy(options: CapabilityPolicyOptions) {
  const {
    registry,
    deviceIdExtractor = (req) => req.params.deviceId || req.params.cameraId,
    tenantIdExtractor = (req) => (req as any).tenantId || req.query.tenantId as string,
    skipInDevelopment = false,
  } = options;

  /**
   * Require a specific capability for an operation.
   */
  function requireCapability(requirement: CapabilityRequirement | CapabilityKey) {
    const req: CapabilityRequirement =
      typeof requirement === "string" ? { capability: requirement } : requirement;

    return async (request: Request, response: Response, next: NextFunction) => {
      // Skip in development if configured
      if (skipInDevelopment && process.env.NODE_ENV === "development") {
        return next();
      }

      try {
        const deviceId = deviceIdExtractor(request);
        const tenantId = tenantIdExtractor(request);

        if (!deviceId) {
          return response.status(400).json({
            error: "device_id_required",
            message: "Device ID is required",
          });
        }

        if (!tenantId) {
          return response.status(400).json({
            error: "tenant_id_required",
            message: "Tenant ID is required",
          });
        }

        // Check capability
        const capability = await registry.getCapability(
          tenantId,
          deviceId,
          req.capability,
        );

        // Check state
        if (capability.state === "UNSUPPORTED") {
          throw new CapabilityNotSupportedError(
            deviceId,
            req.capability,
            capability.state,
          );
        }

        if (capability.state === "UNKNOWN" && !req.allowUnknown) {
          throw new CapabilityUnknownError(deviceId, req.capability);
        }

        if (capability.state === "DEGRADED" && !req.allowDegraded) {
          return response.status(503).json({
            error: "capability_degraded",
            message:
              req.errorMessage ||
              `Device capability ${req.capability} is degraded`,
            capability: req.capability,
            state: capability.state,
            limitations: capability.limitations,
          });
        }

        // Check availability
        if (!capability.available) {
          throw new CapabilityUnavailableError(
            deviceId,
            req.capability,
            capability.limitations?.join("; "),
          );
        }

        // Store capability in request for use by handlers
        (request as any).deviceCapability = capability;

        next();
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return response.status(400).json({
            error: "capability_not_supported",
            message:
              req.errorMessage ||
              `Device does not support ${req.capability}`,
            capability: req.capability,
            state: error.state,
          });
        }

        if (error instanceof CapabilityUnavailableError) {
          return response.status(503).json({
            error: "capability_unavailable",
            message:
              req.errorMessage ||
              `Device capability ${req.capability} is currently unavailable`,
            capability: req.capability,
            reason: error.reason,
          });
        }

        if (error instanceof CapabilityUnknownError) {
          return response.status(409).json({
            error: "capability_unknown",
            message:
              req.errorMessage ||
              `Device capability ${req.capability} state is unknown - verification required`,
            capability: req.capability,
          });
        }

        // Other errors
        next(error);
      }
    };
  }

  /**
   * Require multiple capabilities.
   */
  function requireCapabilities(requirements: CapabilityRequirement[]) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        const deviceId = deviceIdExtractor(request);
        const tenantId = tenantIdExtractor(request);

        if (!deviceId || !tenantId) {
          return response.status(400).json({
            error: "missing_parameters",
            message: "Device ID and Tenant ID are required",
          });
        }

        // Check all capabilities
        const results = await Promise.all(
          requirements.map(async (req) => {
            const capability = await registry.getCapability(
              tenantId,
              deviceId,
              req.capability,
            );

            return {
              requirement: req,
              capability,
              supported:
                capability.state === "SUPPORTED" ||
                (capability.state === "DEGRADED" && req.allowDegraded) ||
                (capability.state === "UNKNOWN" && req.allowUnknown),
              available: capability.available,
            };
          }),
        );

        // Check for unsupported capabilities
        const unsupported = results.filter((r) => !r.supported);
        if (unsupported.length > 0) {
          return response.status(400).json({
            error: "capabilities_not_supported",
            message: "One or more required capabilities are not supported",
            unsupported: unsupported.map((r) => ({
              capability: r.requirement.capability,
              state: r.capability.state,
            })),
          });
        }

        // Check for unavailable capabilities
        const unavailable = results.filter((r) => !r.available);
        if (unavailable.length > 0) {
          return response.status(503).json({
            error: "capabilities_unavailable",
            message: "One or more required capabilities are currently unavailable",
            unavailable: unavailable.map((r) => ({
              capability: r.requirement.capability,
              state: r.capability.state,
              limitations: r.capability.limitations,
            })),
          });
        }

        // Store capabilities in request
        (request as any).deviceCapabilities = results.map((r) => r.capability);

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    requireCapability,
    requireCapabilities,
  };
}

/**
 * Helper to check capability programmatically within handlers.
 */
export async function checkCapability(
  registry: DeviceCapabilityRegistry,
  tenantId: string,
  deviceId: string,
  capability: CapabilityKey,
  options: {
    allowDegraded?: boolean;
    allowUnknown?: boolean;
  } = {},
): Promise<
  | { allowed: true; capability: any }
  | { allowed: false; reason: string; state: string }
> {
  try {
    const cap = await registry.getCapability(tenantId, deviceId, capability);

    if (cap.state === "UNSUPPORTED") {
      return {
        allowed: false,
        reason: `Device does not support ${capability}`,
        state: cap.state,
      };
    }

    if (cap.state === "UNKNOWN" && !options.allowUnknown) {
      return {
        allowed: false,
        reason: `Capability ${capability} state is unknown`,
        state: cap.state,
      };
    }

    if (cap.state === "DEGRADED" && !options.allowDegraded) {
      return {
        allowed: false,
        reason: `Capability ${capability} is degraded`,
        state: cap.state,
      };
    }

    if (!cap.available) {
      return {
        allowed: false,
        reason: cap.limitations?.join("; ") || `Capability ${capability} is unavailable`,
        state: cap.state,
      };
    }

    return { allowed: true, capability: cap };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "Unknown error",
      state: "UNKNOWN",
    };
  }
}
