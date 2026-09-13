import { type SecurityServiceRegistry } from '../../../packages/security/src/index.js';

export function createRootSecurityAdapter(registry: SecurityServiceRegistry) {
  return {
    identityService: registry.identity,
    authorizationService: registry.authorization,
    cryptoService: registry.crypto,
    observabilityService: registry.observability,
  };
}
