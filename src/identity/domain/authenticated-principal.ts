/**
 * Authenticated Principal
 * 
 * Represents a fully resolved local identity with effective permissions.
 * This is what the SessionService uses to create application sessions.
 * 
 * A principal is created AFTER:
 * 1. External identity verification
 * 2. Identity linking
 * 3. Local user resolution
 * 4. Tenant membership validation
 * 5. Role mapping
 * 6. Permission calculation
 */

export type AuthenticationSource =
  | 'PASSWORD'
  | 'OIDC'
  | 'SAML'
  | 'AZURE_AD'
  | 'LDAP'
  | 'API_KEY'
  | 'CERTIFICATE'
  | 'MFA';

export type AccountStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DISABLED'
  | 'LOCKED'
  | 'PENDING_ACTIVATION';

export type MembershipStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DISABLED'
  | 'PENDING';

/**
 * Represents an authenticated user with resolved tenant membership
 * and effective permissions.
 * 
 * This is the canonical representation of "who is accessing the system"
 * that flows through the application after authentication.
 */
export interface AuthenticatedPrincipal {
  /**
   * Local user identifier (immutable)
   */
  userId: string;

  /**
   * Tenant identifier for this session
   */
  tenantId: string;

  /**
   * Tenant membership identifier
   */
  membershipId: string;

  /**
   * User account status
   */
  userStatus: AccountStatus;

  /**
   * Tenant membership status
   */
  membershipStatus: MembershipStatus;

  /**
   * User information
   */
  user: PrincipalUser;

  /**
   * Effective roles in this tenant
   * 
   * These are LOCAL role identifiers, not external groups.
   */
  roles: string[];

  /**
   * Effective permissions (flattened from roles)
   * 
   * These are the actual permissions the user has.
   * Used for authorization checks.
   */
  permissions: string[];

  /**
   * Authentication context for this session
   */
  authentication: AuthenticationContext;

  /**
   * Additional metadata
   */
  metadata?: PrincipalMetadata;
}

/**
 * User information embedded in principal
 */
export interface PrincipalUser {
  /**
   * User identifier
   */
  id: string;

  /**
   * Primary email (may differ from external email)
   */
  email: string;

  /**
   * Display name
   */
  displayName: string;

  /**
   * Given name
   */
  givenName?: string;

  /**
   * Family name
   */
  familyName?: string;

  /**
   * Avatar URL or identifier
   */
  avatar?: string;

  /**
   * Preferred locale
   */
  locale?: string;

  /**
   * Preferred timezone
   */
  timezone?: string;
}

/**
 * Authentication context for the principal
 * 
 * Describes how and when the user was authenticated.
 */
export interface AuthenticationContext {
  /**
   * Authentication source/method
   */
  source: AuthenticationSource;

  /**
   * External identity provider ID (if applicable)
   */
  providerId?: string;

  /**
   * Whether MFA was used during authentication
   */
  mfa: boolean;

  /**
   * Authentication assurance level
   */
  assuranceLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  /**
   * Whether authentication is phishing-resistant
   */
  phishingResistant?: boolean;

  /**
   * When authentication occurred
   */
  authenticatedAt: Date;

  /**
   * Maximum authentication age policy (seconds)
   * 
   * If set, the principal should not be used for sensitive
   * operations beyond this age without re-authentication.
   */
  maxAuthenticationAge?: number;

  /**
   * Authentication methods used
   */
  authenticationMethods?: string[];
}

/**
 * Additional principal metadata
 */
export interface PrincipalMetadata {
  /**
   * External identity link ID (if authenticated via enterprise SSO)
   */
  identityLinkId?: string;

  /**
   * External subject identifier (immutable provider ID)
   */
  externalSubject?: string;

  /**
   * External groups at time of authentication
   */
  externalGroups?: string[];

  /**
   * Last password change (if using password auth)
   */
  lastPasswordChange?: Date;

  /**
   * Last activity timestamp
   */
  lastActivity?: Date;

  /**
   * Account creation timestamp
   */
  createdAt?: Date;

  /**
   * Additional custom attributes
   */
  customAttributes?: Record<string, unknown>;
}

/**
 * Principal resolver options
 */
export interface ResolvePrincipalOptions {
  /**
   * Include permission details
   */
  includePermissions?: boolean;

  /**
   * Include extended metadata
   */
  includeMetadata?: boolean;

  /**
   * Validate account status (throw if not active)
   */
  requireActive?: boolean;

  /**
   * Validate membership status (throw if not active)
   */
  requireActiveMembership?: boolean;
}
