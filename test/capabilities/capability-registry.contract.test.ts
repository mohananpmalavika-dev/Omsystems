import { describe, it, expect } from 'vitest';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
  DeviceCapabilityState,
  type PlatformCapability,
} from '../../packages/contracts/src/capabilities/capability-types.js';
import { getCapabilityRegistry } from '../../src/capabilities/capability-registry.js';
import { PLATFORM_CAPABILITIES } from '../../config/capabilities/platform-capabilities.js';

describe('Canonical Capability Contract Verification', () => {
  it('defines the four canonical product maturity levels', () => {
    expect(CapabilityMaturity.PRODUCTION).toBe('PRODUCTION');
    expect(CapabilityMaturity.BETA).toBe('BETA');
    expect(CapabilityMaturity.EXPERIMENTAL).toBe('EXPERIMENTAL');
    expect(CapabilityMaturity.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED');
    expect(Object.keys(CapabilityMaturity)).toHaveLength(4);
  });

  it('defines the independent runtime state levels', () => {
    expect(CapabilityRuntimeState.HEALTHY).toBe('HEALTHY');
    expect(CapabilityRuntimeState.DEGRADED).toBe('DEGRADED');
    expect(CapabilityRuntimeState.DOWN).toBe('DOWN');
    expect(CapabilityRuntimeState.NOT_CONFIGURED).toBe('NOT_CONFIGURED');
    expect(CapabilityRuntimeState.DISABLED).toBe('DISABLED');
    expect(CapabilityRuntimeState.UNKNOWN).toBe('UNKNOWN');
  });

  it('defines the independent device capability states', () => {
    expect(DeviceCapabilityState.SUPPORTED).toBe('SUPPORTED');
    expect(DeviceCapabilityState.UNSUPPORTED).toBe('UNSUPPORTED');
    expect(DeviceCapabilityState.DEGRADED).toBe('DEGRADED');
    expect(DeviceCapabilityState.UNKNOWN).toBe('UNKNOWN');
  });

  it('guarantees all registered capabilities adhere to the PlatformCapability contract', () => {
    const registry = getCapabilityRegistry();
    const all = registry.getAll();

    expect(all.length).toBeGreaterThan(50);

    for (const cap of all) {
      expect(cap.id).toBeDefined();
      expect(typeof cap.id).toBe('string');
      expect(cap.id).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/);

      expect(cap.name).toBeDefined();
      expect(typeof cap.name).toBe('string');
      expect(cap.name.length).toBeGreaterThan(2);

      expect(cap.description).toBeDefined();
      expect(typeof cap.description).toBe('string');

      expect(Object.values(CapabilityMaturity)).toContain(cap.maturity);
      expect(Object.values(CapabilityRuntimeState)).toContain(cap.runtime.state);

      expect(cap.implementation).toBeDefined();
      expect(typeof cap.implementation.backend).toBe('boolean');
      expect(typeof cap.implementation.frontend).toBe('boolean');
      expect(typeof cap.implementation.api).toBe('boolean');

      expect(cap.verification).toBeDefined();
      expect(typeof cap.verification.unitTests).toBe('boolean');
      expect(typeof cap.verification.integrationTests).toBe('boolean');
      expect(typeof cap.verification.e2eTests).toBe('boolean');

      expect(cap.dependencies).toBeDefined();
    }
  });

  it('generates truthful summary statistics', () => {
    const registry = getCapabilityRegistry();
    const summary = registry.getSummary();

    expect(summary.total).toBe(registry.getAll().length);
    expect(
      summary.byMaturity.production +
      summary.byMaturity.beta +
      summary.byMaturity.experimental +
      summary.byMaturity.notImplemented
    ).toBe(summary.total);

    expect(
      summary.byRuntimeState.healthy +
      summary.byRuntimeState.degraded +
      summary.byRuntimeState.down +
      summary.byRuntimeState.notConfigured +
      summary.byRuntimeState.disabled +
      summary.byRuntimeState.unknown
    ).toBe(summary.total);
  });
});
