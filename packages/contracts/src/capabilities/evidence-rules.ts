/**
 * Evidence-based Capability Maturity Determination Rules
 * 
 * Rules fail closed: when evidence is missing or uncertain,
 * maturity MUST be downgraded, never upgraded.
 */

import {
  CapabilityMaturity,
  type CapabilityImplementationEvidence,
} from './capability-types.js';

/**
 * Determine the maximum allowed product maturity given implementation evidence.
 */
export function determineMaximumAllowedMaturity(
  evidence: CapabilityImplementationEvidence
): CapabilityMaturity {
  // 1. Missing backend implementation -> NOT_IMPLEMENTED
  if (!evidence.backendImplementation) {
    return CapabilityMaturity.NOT_IMPLEMENTED;
  }

  // 2. Mock in production path -> NOT_IMPLEMENTED
  if (evidence.mockProductionPath) {
    return CapabilityMaturity.NOT_IMPLEMENTED;
  }

  // 3. NotImplementedException / 501 stub -> NOT_IMPLEMENTED
  if (evidence.notImplementedException) {
    return CapabilityMaturity.NOT_IMPLEMENTED;
  }

  // 4. Missing API endpoint -> NOT_IMPLEMENTED
  if (!evidence.apiEndpointExists) {
    return CapabilityMaturity.NOT_IMPLEMENTED;
  }

  // 5. AI model-dependent checks
  if (evidence.modelRequired) {
    if (!evidence.modelExists || !evidence.realInferencePath) {
      return CapabilityMaturity.NOT_IMPLEMENTED;
    }
    if (!evidence.qualityValidated) {
      return CapabilityMaturity.EXPERIMENTAL;
    }
  }

  // 6. Hardware-dependent checks
  if (evidence.hasHardwareDependency && !evidence.hardwareVerified) {
    return CapabilityMaturity.NOT_IMPLEMENTED;
  }

  // 7. Missing integration tests or production dependency verification -> BETA or EXPERIMENTAL
  if (!evidence.integrationTests || !evidence.productionDependencyVerified) {
    if (!evidence.unitTests) {
      return CapabilityMaturity.EXPERIMENTAL;
    }
    return CapabilityMaturity.BETA;
  }

  // 8. Unit tests required for PRODUCTION
  if (!evidence.unitTests) {
    return CapabilityMaturity.BETA;
  }

  // All criteria met for PRODUCTION
  return CapabilityMaturity.PRODUCTION;
}

/**
 * Check if a capability is permissible for execution under a given deployment policy.
 */
export function isCapabilityPermittedForPolicy(
  maturity: CapabilityMaturity,
  policy: { allowBeta: boolean; allowExperimental: boolean }
): boolean {
  switch (maturity) {
    case CapabilityMaturity.PRODUCTION:
      return true;
    case CapabilityMaturity.BETA:
      return Boolean(policy.allowBeta);
    case CapabilityMaturity.EXPERIMENTAL:
      return Boolean(policy.allowExperimental);
    case CapabilityMaturity.NOT_IMPLEMENTED:
    default:
      return false;
  }
}
