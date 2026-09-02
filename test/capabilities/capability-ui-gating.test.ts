import { describe, it, expect } from 'vitest';
import { getCapabilityRegistry } from '../../src/capabilities/capability-registry.js';
import { CapabilityMaturity, CapabilityRuntimeState } from '../../packages/contracts/src/capabilities/capability-types.js';

describe('UI Gating & Usability Logic Tests', () => {
  it('disallows usage when capability is NOT_IMPLEMENTED', () => {
    const registry = getCapabilityRegistry();
    const result = registry.canUse('security.tpm_attestation');
    expect(result.usable).toBe(false);
    expect(result.reason).toBe('feature_not_implemented');
  });

  it('permits usage when capability is PRODUCTION and HEALTHY', () => {
    const registry = getCapabilityRegistry();
    const result = registry.canUse('video.live_view');
    expect(result.usable).toBe(true);
  });

  it('fails closed when capability ID is unknown', () => {
    const registry = getCapabilityRegistry();
    const result = registry.canUse('unknown.feature.xyz');
    expect(result.usable).toBe(false);
    expect(result.reason).toBe('capability_not_registered');
  });

  it('correctly disables BETA features when bank policy disallows Beta', () => {
    const registry = getCapabilityRegistry();
    registry.setDeploymentPolicy({ allowBeta: false, allowExperimental: false });

    const betaResult = registry.canUse('video.synchronized_playback');
    expect(betaResult.usable).toBe(false);
    expect(betaResult.reason).toBe('beta_features_disabled');

    // Restore standard policy
    registry.setDeploymentPolicy({ allowBeta: true, allowExperimental: false });
  });

  it('disallows usage when runtime state is DOWN', () => {
    const registry = getCapabilityRegistry();
    registry.updateRuntimeState('video.recording', CapabilityRuntimeState.DOWN, 'Storage volume unmounted');

    const result = registry.canUse('video.recording');
    expect(result.usable).toBe(false);
    expect(result.reason).toBe('runtime_service_down');

    // Restore healthy
    registry.updateRuntimeState('video.recording', CapabilityRuntimeState.HEALTHY);
  });
});
