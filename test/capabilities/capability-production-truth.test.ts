import { describe, it, expect } from 'vitest';
import { PLATFORM_CAPABILITIES } from '../../config/capabilities/platform-capabilities.js';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
} from '../../packages/contracts/src/capabilities/capability-types.js';

describe('Authoritative Capability Production Truth Invariants', () => {
  it('guarantees no duplicate capability IDs exist', () => {
    const ids = PLATFORM_CAPABILITIES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('guarantees no NOT_IMPLEMENTED capability reports runtime state HEALTHY', () => {
    for (const cap of PLATFORM_CAPABILITIES) {
      if (cap.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
        expect(cap.runtime.state).not.toBe(CapabilityRuntimeState.HEALTHY);
      }
    }
  });

  it('guarantees all PRODUCTION capabilities have backend, api, and unit test verification', () => {
    for (const cap of PLATFORM_CAPABILITIES) {
      if (cap.maturity === CapabilityMaturity.PRODUCTION) {
        expect(cap.implementation.backend).toBe(true);
        expect(cap.implementation.api).toBe(true);
        expect(cap.verification.unitTests).toBe(true);

        if (cap.implementation.persistenceRequired) {
          expect(cap.implementation.persistenceImplemented).toBe(true);
        }
      }
    }
  });

  it('guarantees required domains are fully covered in the truth matrix', () => {
    const categories = new Set(PLATFORM_CAPABILITIES.map((c) => c.category));
    expect(categories.has('VIDEO')).toBe(true);
    expect(categories.has('RECORDING')).toBe(true);
    expect(categories.has('EVIDENCE')).toBe(true);
    expect(categories.has('ANALYTICS')).toBe(true);
    expect(categories.has('HA')).toBe(true);
    expect(categories.has('SECURITY')).toBe(true);
    expect(categories.has('OPERATIONS')).toBe(true);
    expect(categories.has('EDGE')).toBe(true);
    expect(categories.has('STORAGE')).toBe(true);
    expect(categories.has('INTEGRATION')).toBe(true);
  });
});
