import { describe, it, expect } from 'vitest';
import {
  CapabilityMaturity,
  type CapabilityImplementationEvidence,
} from '../../packages/contracts/src/capabilities/capability-types.js';
import {
  determineMaximumAllowedMaturity,
  isCapabilityPermittedForPolicy,
} from '../../packages/contracts/src/capabilities/evidence-rules.js';

describe('Evidence-Based Maturity Rules (Fail-Closed)', () => {
  it('downgrades to NOT_IMPLEMENTED when backend implementation is missing', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: false,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: false,
      notImplementedException: false,
      unitTests: true,
      integrationTests: true,
      e2eTests: true,
      productionDependencyVerified: true,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.NOT_IMPLEMENTED);
  });

  it('downgrades to NOT_IMPLEMENTED when mock is used in production path', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: true,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: true,
      notImplementedException: false,
      unitTests: true,
      integrationTests: true,
      e2eTests: true,
      productionDependencyVerified: true,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.NOT_IMPLEMENTED);
  });

  it('downgrades to NOT_IMPLEMENTED when NotImplementedException or 501 is returned', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: true,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: false,
      notImplementedException: true,
      unitTests: true,
      integrationTests: true,
      e2eTests: true,
      productionDependencyVerified: true,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.NOT_IMPLEMENTED);
  });

  it('downgrades to BETA when integration tests or production verification are incomplete', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: true,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: false,
      notImplementedException: false,
      unitTests: true,
      integrationTests: false,
      e2eTests: false,
      productionDependencyVerified: false,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.BETA);
  });

  it('downgrades AI capability to EXPERIMENTAL when model quality is not validated', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: true,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: false,
      notImplementedException: false,
      unitTests: true,
      integrationTests: true,
      e2eTests: true,
      productionDependencyVerified: true,
      modelRequired: true,
      modelExists: true,
      realInferencePath: true,
      qualityValidated: false,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.EXPERIMENTAL);
  });

  it('upgrades to PRODUCTION only when all evidence criteria are fully satisfied', () => {
    const evidence: CapabilityImplementationEvidence = {
      backendImplementation: true,
      apiEndpointExists: true,
      frontendIntegrationExists: true,
      mockProductionPath: false,
      notImplementedException: false,
      unitTests: true,
      integrationTests: true,
      e2eTests: true,
      productionDependencyVerified: true,
      modelRequired: true,
      modelExists: true,
      realInferencePath: true,
      qualityValidated: true,
    };

    expect(determineMaximumAllowedMaturity(evidence)).toBe(CapabilityMaturity.PRODUCTION);
  });

  it('correctly enforces deployment policies', () => {
    const bankPolicy = { allowBeta: false, allowExperimental: false };
    const betaPolicy = { allowBeta: true, allowExperimental: false };
    const devPolicy = { allowBeta: true, allowExperimental: true };

    // PRODUCTION is permitted everywhere
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.PRODUCTION, bankPolicy)).toBe(true);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.PRODUCTION, betaPolicy)).toBe(true);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.PRODUCTION, devPolicy)).toBe(true);

    // BETA permitted only when policy allows
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.BETA, bankPolicy)).toBe(false);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.BETA, betaPolicy)).toBe(true);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.BETA, devPolicy)).toBe(true);

    // EXPERIMENTAL permitted only in dev/testing
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.EXPERIMENTAL, bankPolicy)).toBe(false);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.EXPERIMENTAL, betaPolicy)).toBe(false);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.EXPERIMENTAL, devPolicy)).toBe(true);

    // NOT_IMPLEMENTED is NEVER permitted
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.NOT_IMPLEMENTED, bankPolicy)).toBe(false);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.NOT_IMPLEMENTED, betaPolicy)).toBe(false);
    expect(isCapabilityPermittedForPolicy(CapabilityMaturity.NOT_IMPLEMENTED, devPolicy)).toBe(false);
  });
});
