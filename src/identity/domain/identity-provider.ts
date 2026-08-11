/**
 * Identity Provider Domain Types
 * 
 * Defines the configuration and capabilities of external identity providers.
 */

import type { EnterpriseIdentityProvider } from './verified-external-identity.js';

/**
 * Identity provider configuration (discriminated union by type)
 */
export type IdentityProviderConfiguration =
  | OIDCProviderConfiguration
  | SAMLProviderConfiguration
  | LDAPProviderConfiguration
  | AzureADProviderConfiguration;

/**
 * Base provider configuration
 */
export interface BaseProviderConfiguration {
  /**
   * Provider type
   */
  type: EnterpriseIdentityProvider;

  /**
   * Whether this provider is enabled
   */
  enabled: boolean;

  /**
   * Display name
   */
  name: string;

  /**
   * Optional description
   */
  description?: string;
}

/**
 * OIDC Provider Configuration
 */
export interface OIDCProviderConfiguration extends BaseProviderConfiguration {
  type: 'OIDC';

  /**
   * OIDC issuer URL
   */
  issuer: string;

  /**
   * Client ID
   */
  clientId: string;

  /**
   * Client secret reference (stored separately)
   */
  clientSecretRef: string;

  /**
   * Redirect URI
   */
  redirectUri: string;

  /**
   * OIDC scopes
   */
  scopes: string[];

  /**
   * Authorization endpoint (discovered or explicit)
   */
  authorizationEndpoint?: string;

  /**
   * Token endpoint (discovered or explicit)
   */
  tokenEndpoint?: string;

  /**
   * UserInfo endpoint (discovered or explicit)
   */
  userinfoEndpoint?: string;

  /**
   * JWKS URI (discovered or explicit)
   */
  jwksUri?: string;

  /**
   * Whether to use PKCE
   */
  usePKCE: boolean;

  /**
   * Response type (default: 'code')
   */
  responseType?: string;

  /**
   * Response mode
   */
  responseMode?: 'query' | 'fragment' | 'form_post';
}

/**
 * Azure AD (Entra ID) Provider Configuration
 * 
 * Specialized OIDC configuration for Microsoft Entra ID
 */
export interface AzureADProviderConfiguration extends BaseProviderConfiguration {
  type: 'AZURE_AD';

  /**
   * Azure AD tenant ID
   */
  tenantId: string;

  /**
   * Application (client) ID
   */
  clientId: string;

  /**
   * Client secret reference
   */
  clientSecretRef: string;

  /**
   * Redirect URI
   */
  redirectUri: string;

  /**
   * Microsoft Graph API scopes
   */
  scopes: string[];

  /**
   * Whether to use v2.0 endpoint (default: true)
   */
  useV2Endpoint: boolean;

  /**
   * Whether to include groups in token
   */
  includeGroupsInToken: boolean;

  /**
   * Cloud instance (public, government, china, germany)
   */
  cloudInstance?: 'public' | 'us_government' | 'china' | 'germany';
}

/**
 * SAML Provider Configuration
 */
export interface SAMLProviderConfiguration extends BaseProviderConfiguration {
  type: 'SAML';

  /**
   * SAML Entity ID (SP)
   */
  entityId: string;

  /**
   * IdP SSO URL
   */
  ssoUrl: string;

  /**
   * IdP issuer/entity ID
   */
  issuer: string;

  /**
   * ACS (Assertion Consumer Service) URL
   */
  acsUrl: string;

  /**
   * IdP certificate (PEM format)
   */
  certificate: string;

  /**
   * SP private key reference (for signing)
   */
  privateKeyRef?: string;

  /**
   * Whether to require signed assertions
   */
  wantAssertionsSigned: boolean;

  /**
   * Whether to require signed responses
   */
  wantAuthnResponseSigned: boolean;

  /**
   * Whether to sign requests
   */
  signRequests: boolean;

  /**
   * NameID format
   */
  nameIdFormat?: string;

  /**
   * Attribute mappings (SAML attribute -> normalized field)
   */
  attributeMappings: Record<string, string>;

  /**
   * Group attribute name
   */
  groupAttribute?: string;

  /**
   * Single Logout Service URL
   */
  sloUrl?: string;
}

/**
 * LDAP Provider Configuration
 */
export interface LDAPProviderConfiguration extends BaseProviderConfiguration {
  type: 'LDAP';

  /**
   * LDAP server URL (ldap:// or ldaps://)
   */
  url: string;

  /**
   * Whether TLS is required
   */
  tlsRequired: boolean;

  /**
   * Whether to verify TLS certificates
   */
  verifyCertificate: boolean;

  /**
   * Service account bind DN
   */
  bindDn: string;

  /**
   * Service account password reference
   */
  bindSecretRef: string;

  /**
   * Base DN for searches
   */
  baseDn: string;

  /**
   * User search filter template
   * 
   * Use {username} placeholder, e.g.:
   * (sAMAccountName={username})
   * (&(objectClass=person)(uid={username}))
   */
  userFilter: string;

  /**
   * User search base (defaults to baseDn)
   */
  userSearchBase?: string;

  /**
   * Group search base DN
   */
  groupBaseDn?: string;

  /**
   * Group search filter template
   * 
   * Use {userDn} placeholder, e.g.:
   * (member={userDn})
   */
  groupFilter?: string;

  /**
   * Attribute mappings
   */
  attributeMappings: Record<string, string>;

  /**
   * Connection timeout (milliseconds)
   */
  connectTimeoutMs: number;

  /**
   * Operation timeout (milliseconds)
   */
  operationTimeoutMs: number;
}

/**
 * Identity provider entity (persisted)
 */
export interface IdentityProvider {
  /**
   * Provider identifier
   */
  id: string;

  /**
   * Tenant identifier
   */
  tenantId: string;

  /**
   * Provider configuration
   */
  configuration: IdentityProviderConfiguration;

  /**
   * Provisioning policy
   */
  provisioning: ProvisioningPolicy;

  /**
   * Authorization policy
   */
  authorization: AuthorizationPolicy;

  /**
   * Security policy
   */
  security: SecurityPolicy;

  /**
   * When provider was created
   */
  createdAt: Date;

  /**
   * When provider was last updated
   */
  updatedAt: Date;

  /**
   * Who created the provider
   */
  createdBy: string;

  /**
   * Who last updated the provider
   */
  updatedBy?: string;
}

/**
 * Provisioning policy for JIT user creation
 */
export interface ProvisioningPolicy {
  /**
   * Provisioning mode
   * 
   * - DISABLED: No JIT provisioning, must pre-create users
   * - JIT: Just-in-time provisioning on first login
   * - PREPROVISIONED_ONLY: Only allow pre-provisioned users
   */
  mode: 'DISABLED' | 'JIT' | 'PREPROVISIONED_ONLY';

  /**
   * Allowed email domains for JIT provisioning
   * 
   * If empty, any domain is allowed.
   * Example: ['company.com', 'subsidiary.com']
   */
  allowedDomains: string[];

  /**
   * Default role for JIT-provisioned users
   */
  defaultRoleId?: string;

  /**
   * Whether to update user attributes on login
   */
  syncAttributesOnLogin: boolean;

  /**
   * Which attributes to sync from provider
   */
  syncedAttributes: string[];
}

/**
 * Authorization policy
 */
export interface AuthorizationPolicy {
  /**
   * Whether to require at least one mapped role
   */
  requireMappedRole: boolean;

  /**
   * Default role if no groups map to roles
   * (only used if requireMappedRole is false)
   */
  defaultRoleId?: string;

  /**
   * Maximum number of concurrent sessions
   */
  maxConcurrentSessions?: number;

  /**
   * Allowed IP ranges (CIDR notation)
   */
  allowedIpRanges?: string[];
}

/**
 * Security policy
 */
export interface SecurityPolicy {
  /**
   * Whether to require MFA
   */
  requireMfa: boolean;

  /**
   * Maximum authentication age (seconds)
   * 
   * If authentication is older than this, step-up may be required
   * for sensitive operations.
   */
  maxAuthenticationAge?: number;

  /**
   * Minimum assurance level required
   */
  minAssuranceLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  /**
   * Whether to require phishing-resistant authentication
   */
  requirePhishingResistant?: boolean;

  /**
   * Session timeout (seconds)
   */
  sessionTimeout?: number;

  /**
   * Idle timeout (seconds)
   */
  idleTimeout?: number;
}

/**
 * Provider capabilities
 * 
 * Describes what features a provider supports.
 */
export interface IdentityProviderCapabilities {
  /**
   * Supports browser-based login flow
   */
  interactiveLogin: boolean;

  /**
   * Supports username/password authentication
   */
  passwordAuthentication: boolean;

  /**
   * Provides group/role claims
   */
  groupClaims: boolean;

  /**
   * Can verify MFA usage
   */
  mfaAssurance: boolean;

  /**
   * Supports single logout
   */
  logout: boolean;

  /**
   * Supports directory synchronization
   */
  directorySync: boolean;

  /**
   * Supports JIT provisioning
   */
  jitProvisioning: boolean;
}

/**
 * Provider health status
 */
export interface IdentityProviderHealth {
  /**
   * Provider ID
   */
  providerId: string;

  /**
   * Overall health status
   */
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'MISCONFIGURED';

  /**
   * Last successful authentication
   */
  lastSuccessfulAuth?: Date;

  /**
   * Last health check
   */
  lastHealthCheck: Date;

  /**
   * Health check details
   */
  checks: HealthCheck[];

  /**
   * Error message (if unhealthy)
   */
  error?: string;
}

/**
 * Individual health check result
 */
export interface HealthCheck {
  /**
   * Check name
   */
  name: string;

  /**
   * Check status
   */
  status: 'PASS' | 'FAIL' | 'WARN';

  /**
   * Status message
   */
  message: string;

  /**
   * Check timestamp
   */
  timestamp: Date;
}

/**
 * Provider readiness check result
 */
export type ProviderReadiness =
  | {
      ready: true;
    }
  | {
      ready: false;
      reasons: string[];
    };
