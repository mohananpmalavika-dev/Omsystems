import { describe, expect, it } from 'vitest';
import { createCanonicalSecurityServices } from '../packages/security/src/index.js';
import { createRootSecurityAdapter } from '../src/security/adapters/canonical-security-adapter.js';
import { createBackendSecurityAdapter } from '../backend/src/security/adapters/canonical-security-adapter.js';

describe('security architecture', () => {
  it('routes both applications through the canonical security package', () => {
    const registry = createCanonicalSecurityServices();
    const rootAdapter = createRootSecurityAdapter(registry);
    const backendAdapter = createBackendSecurityAdapter(registry);

    expect(rootAdapter.identityService).toBe(registry.identity);
    expect(rootAdapter.authorizationService).toBe(registry.authorization);
    expect(backendAdapter.identityService).toBe(registry.identity);
    expect(backendAdapter.authorizationService).toBe(registry.authorization);
    expect(rootAdapter.cryptoService).toBe(registry.crypto);
    expect(backendAdapter.observabilityService).toBe(registry.observability);
  });
});
