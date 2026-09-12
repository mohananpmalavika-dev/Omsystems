import { describe, it, expect, beforeEach } from 'vitest';
import { getCapabilityRegistry, resetCapabilityRegistry } from '../../src/capabilities/capability-registry.js';
import { CapabilityMaturity, CapabilityRuntimeState } from '../../packages/contracts/src/capabilities/capability-types.js';

describe('UI Gating & Usability Logic Tests', () => {
  beforeEach(() => {
    resetCapabilityRegistry();
  });
  it('disallows usage when capability is NOT_IMPLEMENTED', () => {
    const registry = getCapabilityRegistry();
    const result = registry.canUse('security.tpm_attestation');
    expect(result.usable).toBe(false);
    expect(result.reason).toBe('feature_not_implemented');
  });

  it('permits usage when capability is PRODUCTION and HEALTHY', () => {
    const registry = getCapabilityRegistry();
    registry.updateRuntimeState('video.live_view', CapabilityRuntimeState.HEALTHY, 'Verified by test runtime reporter');
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

    // security.saml is BETA and HEALTHY, so it must be disabled when allowBeta is false
    const betaResult = registry.canUse('security.saml');
    expect(betaResult.usable).toBe(false);
    expect(betaResult.reason).toBe('beta_features_disabled');

    // security.abac is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('security.abac', CapabilityRuntimeState.HEALTHY);
    const abacResult = registry.canUse('security.abac');
    expect(abacResult.usable).toBe(true);

    // ha.recording_failover is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('ha.recording_failover', CapabilityRuntimeState.HEALTHY);
    const recordingFailoverResult = registry.canUse('ha.recording_failover');
    expect(recordingFailoverResult.usable).toBe(true);

    // ha.media_failover is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('ha.media_failover', CapabilityRuntimeState.HEALTHY);
    const mediaFailoverResult = registry.canUse('ha.media_failover');
    expect(mediaFailoverResult.usable).toBe(true);

    // recording.storage_failover is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('recording.storage_failover', CapabilityRuntimeState.HEALTHY);
    const failoverResult = registry.canUse('recording.storage_failover');
    expect(failoverResult.usable).toBe(true);

    // recording.recovery is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('recording.recovery', CapabilityRuntimeState.HEALTHY);
    const recoveryResult = registry.canUse('recording.recovery');
    expect(recoveryResult.usable).toBe(true);

    // video.synchronized_playback is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('video.synchronized_playback', CapabilityRuntimeState.HEALTHY);
    const syncResult = registry.canUse('video.synchronized_playback');
    expect(syncResult.usable).toBe(true);

    // recording.archive is PRODUCTION, so when HEALTHY it remains usable even when allowBeta is false
    registry.updateRuntimeState('recording.archive', CapabilityRuntimeState.HEALTHY);
    const archiveResult = registry.canUse('recording.archive');
    expect(archiveResult.usable).toBe(true);

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
