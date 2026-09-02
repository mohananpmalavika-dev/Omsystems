/**
 * Capability Route Protection Middleware
 * 
 * Prevents execution of NOT_IMPLEMENTED, disabled BETA, or disabled EXPERIMENTAL capabilities.
 * Enforces release truth at the network API boundary.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCapabilityRegistry } from '../capabilities/capability-registry.js';
import { CapabilityMaturity, CapabilityRuntimeState } from '../../packages/contracts/src/capabilities/capability-types.js';

export interface RequireCapabilityOptions {
  customMessage?: string;
  allowDegraded?: boolean;
}

/**
 * Fastify preHandler middleware factory to guard routes by capability truth.
 */
export function requireCapability(
  capabilityId: string,
  options: RequireCapabilityOptions = {}
) {
  return async function capabilityGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const registry = getCapabilityRegistry();
    const capability = registry.get(capabilityId);

    // 1. Unregistered capability -> Fail Closed (404)
    if (!capability) {
      reply.status(404).send({
        error: 'CAPABILITY_NOT_FOUND',
        capability: capabilityId,
        message: options.customMessage || `Capability '${capabilityId}' is not registered in the platform matrix.`,
      });
      return;
    }

    // 2. NOT_IMPLEMENTED capability -> 404 Not Available
    if (capability.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
      reply.status(404).send({
        error: 'CAPABILITY_NOT_AVAILABLE',
        capability: capabilityId,
        maturity: CapabilityMaturity.NOT_IMPLEMENTED,
        message: options.customMessage || `Feature '${capability.name}' (${capabilityId}) is not implemented in this release.`,
      });
      return;
    }

    // 3. Check deployment policy (BETA / EXPERIMENTAL)
    const canUseCheck = registry.canUse(capabilityId);
    if (!canUseCheck.usable) {
      if (canUseCheck.reason === 'experimental_features_disabled' || canUseCheck.reason === 'beta_features_disabled') {
        reply.status(403).send({
          error: 'CAPABILITY_POLICY_DISALLOWED',
          capability: capabilityId,
          maturity: capability.maturity,
          reason: canUseCheck.reason,
          message: options.customMessage || `Capability '${capability.name}' (${capability.maturity}) is not permitted under the active deployment policy.`,
        });
        return;
      }

      if (canUseCheck.reason === 'runtime_service_down') {
        reply.status(503).send({
          error: 'CAPABILITY_RUNTIME_DOWN',
          capability: capabilityId,
          runtimeState: CapabilityRuntimeState.DOWN,
          message: options.customMessage || `The backend service backing capability '${capability.name}' is currently down.`,
        });
        return;
      }

      reply.status(503).send({
        error: 'CAPABILITY_UNUSABLE',
        capability: capabilityId,
        reason: canUseCheck.reason,
        message: options.customMessage || `Capability '${capability.name}' is currently unusable (${canUseCheck.reason}).`,
      });
      return;
    }

    // Permitted to execute
  };
}
