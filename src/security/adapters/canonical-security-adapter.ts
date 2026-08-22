// FIXME: packages/security does not exist - this adapter needs to be refactored
// import { createCanonicalSecurityServices, type SecurityServiceRegistry } from '../../../packages/security/src/index.js';

export function createRootSecurityAdapter(registry?: any) {
  // Placeholder implementation until packages/security is created
  return {
    identityService: null,
    authorizationService: null,
    cryptoService: registry.crypto,
    observabilityService: registry.observability,
  };
}
