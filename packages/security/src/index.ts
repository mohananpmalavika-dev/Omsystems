import { createIdentityService, type IdentityService } from '../../identity/src/index.js';
import { createAuthorizationService, type AuthorizationService } from '../../authorization/src/index.js';
import { createCryptoService, type CryptoService } from '../../crypto/src/index.js';
import { createObservabilityService, type ObservabilityService } from '../../observability/src/index.js';

export interface SecurityServiceRegistry {
  identity: IdentityService;
  authorization: AuthorizationService;
  crypto: CryptoService;
  observability: ObservabilityService;
}

export function createCanonicalSecurityServices(): SecurityServiceRegistry {
  return {
    identity: createIdentityService(),
    authorization: createAuthorizationService(),
    crypto: createCryptoService(),
    observability: createObservabilityService()
  };
}
