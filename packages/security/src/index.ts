import { createIdentityService, type IdentityService } from '../../identity/src/index.ts';
import { createAuthorizationService, type AuthorizationService } from '../../authorization/src/index.ts';
import { createCryptoService, type CryptoService } from '../../crypto/src/index.ts';
import { createObservabilityService, type ObservabilityService } from '../../observability/src/index.ts';

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
