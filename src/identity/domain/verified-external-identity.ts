/**
 * Verified External Identity
 * 
 * Represents a cryptographically or credential-verified identity from an external
 * identity provider. This is the normalized output of all identity adapters
 * (OIDC, SAML, LDAP, etc.) after successful authentication.
 * 
 * CRITICAL: This identity has been verified by the external provider, but it does
 * not yet represent authorization or a local user account.
 */

export type EnterpriseIdentityProvider =
  | 'OIDC'
  | 'SAML'
  | 'AZURE_AD'
  | 'LDAP';

/**
 * Normalized external identity after successful verification by the adapter.
 * 
 * Every adapter (Azure AD, SAML, LDAP) must produce this structure.
 * The application should not care about provider-specific claim formats
 * beyond this point.
 */
export interface VerifiedExternalIdentity {
  /**
   * Identity provider instance identifier (tenant-scoped)
   */
  providerId: string;

  /**
   * Type of provider
   */
  providerType: EnterpriseIdentityProvider;

  /**
   * Immutable identifier issued by the provider.
   * 
   * CRITICAL: Never use email or displayName as the subject.
   * 
   * Examples:
   * - Azure AD: oid (object ID) or sub
   * - SAML: NameID (when persistent or entity format)
   * - LDAP: entryUUID or objectGUID
   * 
   * This is the canonical identity key for linking.
   */
  subject: string;

  /**
   * Provider's tenant identifier (if multi-tenant provider)
   * 
   * For Azure AD: tid claim
   * For others: may be derived from issuer or configuration
   */
  tenantHint?: string;

  /**
   * Email address from provider
   */
  email?: string;

  /**
   * Whether email has been verified by the provider
   * 
   * Some providers (like Azure AD) guarantee verification.
   * Others may return unverified emails.
   */
  emailVerified?: boolean;

  /**
   * Username from provider (may differ from email)
   * 
   * Examples:
   * - Azure AD: preferred_username
   * - LDAP: sAMAccountName or uid
   * - SAML: configured username attribute
   */
  username?: string;

  /**
   * Display name from provider
   */
  displayName?: string;

  /**
   * Given name / first name
   */
  givenName?: string;

  /**
   * Family name / last name
   */
  familyName?: string;

  /**
   * External groups or roles the user belongs to.
   * 
   * These are raw provider group identifiers, not local roles.
   * Role mapping happens separately.
   * 
   * Examples:
   * - Azure AD: groups claim (displayName or object ID)
   * - LDAP: memberOf DNs or group CNs
   * - SAML: group attribute values
   */
  groups: string[];

  /**
   * Raw claims from the provider for audit and debugging.
   * 
   * Should not be used for authorization decisions directly.
   * Use typed fields above instead.
   */
  claims: Record<string, unknown>;

  /**
   * When this identity was authenticated by the provider
   */
  authenticatedAt: Date;

  /**
   * Authentication assurance information
   */
  assurance?: AuthenticationAssurance;
}

/**
 * Authentication assurance and context information.
 * 
 * Represents how strongly the user was authenticated and what
 * methods were used.
 */
export interface AuthenticationAssurance {
  /**
   * Whether multi-factor authentication was used
   */
  mfa: boolean;

  /**
   * Whether authentication used phishing-resistant methods
   * (hardware keys, Windows Hello, etc.)
   */
  phishingResistant?: boolean;

  /**
   * Authentication methods used (AMR - Authentication Methods Reference)
   * 
   * Examples: ['pwd', 'mfa'], ['cert'], ['hwk']
   */
  authenticationMethods?: string[];

  /**
   * Authentication Context Class Reference (ACR)
   * 
   * Provider-specific assurance level indicator
   */
  acr?: string;

  /**
   * Raw AMR claim from provider
   */
  amr?: string[];
}

/**
 * Additional provider-specific metadata
 */
export interface ProviderMetadata {
  /**
   * Issuer URL (for OIDC/SAML)
   */
  issuer?: string;

  /**
   * Audience (for OIDC/SAML)
   */
  audience?: string;

  /**
   * Session identifier from provider
   */
  sessionId?: string;

  /**
   * Original token or assertion ID (for correlation)
   */
  tokenId?: string;

  /**
   * Token expiration (if applicable)
   */
  expiresAt?: Date;
}
