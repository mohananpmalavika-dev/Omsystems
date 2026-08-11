/**
 * Identity Adapter Interface
 * 
 * Defines the contract for external identity provider adapters.
 * 
 * Adapters are responsible for:
 * - Verifying external credentials/tokens/assertions
 * - Normalizing provider-specific claims to VerifiedExternalIdentity
 * - Protocol validation (signature, nonce, state, etc.)
 * - Health checks
 * 
 * Adapters should NOT:
 * - Create local users
 * - Assign roles
 * - Generate application JWTs
 * - Create sessions
 * - Make authorization decisions
 */

import type {
  VerifiedExternalIdentity,
  EnterpriseIdentityProvider,
} from '../domain/verified-external-identity.js';
import type {
  IdentityProvider,
  IdentityProviderCapabilities,
  IdentityProviderHealth,
  ProviderReadiness,
} from '../domain/identity-provider.js';

/**
 * Authentication input for adapters
 */
export interface EnterpriseAuthenticationInput {
  /**
   * Provider configuration
   */
  provider: IdentityProvider;

  /**
   * Authentication request payload (adapter-specific)
   */
  request: any;
}

/**
 * OIDC callback input
 */
export interface OIDCCallbackInput {
  code: string;
  state: string;
  nonce?: string;
  redirectUri: string;
}

/**
 * SAML callback input
 */
export interface SAMLCallbackInput {
  samlResponse: string;
  relayState?: string;
}

/**
 * LDAP credentials input
 */
export interface LDAPCredentialsInput {
  username: string;
  password: string;
}

/**
 * Identity Adapter Interface
 * 
 * All identity adapters must implement this interface.
 */
export interface EnterpriseIdentityAdapter {
  /**
   * Adapter type
   */
  readonly type: EnterpriseIdentityProvider;

  /**
   * Authenticate and verify external identity
   * 
   * This is the main method that:
   * 1. Verifies the authentication (signature, credentials, etc.)
   * 2. Validates protocol requirements (nonce, state, audience, etc.)
   * 3. Normalizes claims to VerifiedExternalIdentity
   * 
   * @throws InvalidTokenError, ProtocolValidationError, InvalidCredentialsError
   */
  authenticate(input: EnterpriseAuthenticationInput): Promise<VerifiedExternalIdentity>;

  /**
   * Check adapter readiness
   * 
   * Validates configuration and returns whether adapter is ready to use.
   */
  checkReadiness(provider: IdentityProvider): ProviderReadiness;

  /**
   * Perform health check
   * 
   * Checks connectivity and configuration without performing authentication.
   */
  healthCheck(provider: IdentityProvider): Promise<IdentityProviderHealth>;

  /**
   * Get adapter capabilities
   * 
   * Describes what features this adapter supports.
   */
  getCapabilities(): IdentityProviderCapabilities;

  /**
   * Validate provider configuration
   * 
   * Checks if configuration is valid for this adapter type.
   */
  validateConfiguration(provider: IdentityProvider): {
    valid: boolean;
    errors: string[];
  };
}

/**
 * Adapter registry for managing multiple adapters
 */
export class EnterpriseIdentityAdapterRegistry {
  private adapters = new Map<EnterpriseIdentityProvider, EnterpriseIdentityAdapter>();

  /**
   * Register an adapter
   */
  register(adapter: EnterpriseIdentityAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Get adapter by type
   */
  get(type: EnterpriseIdentityProvider): EnterpriseIdentityAdapter {
    const adapter = this.adapters.get(type);

    if (!adapter) {
      throw new Error(`No adapter registered for type: ${type}`);
    }

    return adapter;
  }

  /**
   * Check if adapter is registered
   */
  has(type: EnterpriseIdentityProvider): boolean {
    return this.adapters.has(type);
  }

  /**
   * Get all registered adapter types
   */
  getRegisteredTypes(): EnterpriseIdentityProvider[] {
    return Array.from(this.adapters.keys());
  }
}
