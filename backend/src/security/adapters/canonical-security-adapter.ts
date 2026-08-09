import { createCanonicalSecurityServices, type SecurityServiceRegistry } from '../../../../packages/security/src/index.js';

export function createBackendSecurityAdapter(registry: SecurityServiceRegistry = createCanonicalSecurityServices()) {
  return {
    identityService: registry.identity,
    authorizationService: registry.authorization,
    cryptoService: registry.crypto,
    observabilityService: registry.observability,
  };
}
