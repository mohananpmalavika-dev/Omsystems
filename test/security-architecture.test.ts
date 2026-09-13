import { describe, expect, it } from 'vitest';
import { createCanonicalSecurityServices } from '../packages/security/src/index.js';
import { createRootSecurityAdapter } from '../src/security/adapters/canonical-security-adapter.js';

describe('security architecture', () => {
  it('routes production applications through the canonical security package', () => {
    const registry = createCanonicalSecurityServices();
    const rootAdapter = createRootSecurityAdapter(registry);

    expect(rootAdapter.identityService).toBe(registry.identity);
    expect(rootAdapter.authorizationService).toBe(registry.authorization);
    expect(rootAdapter.cryptoService).toBe(registry.crypto);
    expect(rootAdapter.observabilityService).toBe(registry.observability);
  });
});
