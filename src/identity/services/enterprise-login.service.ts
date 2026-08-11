/**
 * Enterprise Login Service
 * 
 * Central orchestration service for enterprise authentication.
 * 
 * This is the ONLY service that coordinates the complete flow:
 *   External Identity → Local Principal → Application Session
 * 
 * Flow:
 * 1. Adapter authenticates external identity (OIDC/SAML/LDAP)
 * 2. Identity link service finds or creates link
 * 3. Provisioning service creates/updates user
 * 4. Role mapping service maps external groups to roles
 * 5. Principal service resolves effective permissions
 * 6. Session service creates application session
 * 7. Audit service records authentication event
 * 
 * CRITICAL: Routes should call this service, not build authentication logic inline.
 */

import type { Pool } from 'pg';
import type {
  VerifiedExternalIdentity,
  EnterpriseIdentityProvider,
} from '../domain/verified-external-identity.js';
import type { IdentityProvider } from '../domain/identity-provider.js';
import type { AuthenticatedPrincipal } from '../domain/authenticated-principal.js';
import type { CreatedSession, SessionContext } from './session.service.js';
import { SessionService } from './session.service.js';
import { IdentityLinkService } from './identity-link.service.js';
import { IdentityProvisioningService } from './identity-provisioning.service.js';
import { RoleMappingService } from './role-mapping.service.js';
import { PrincipalService } from './principal.service.js';
import {
  IdentityProviderError,
  AuthenticationPolicyError,
  EnterpriseAuthError,
} from '../domain/auth-errors.js';

/**
 * Enterprise authentication input
 */
export interface EnterpriseAuthenticationInput {
  /**
   * Tenant identifier
   */
  tenantId: string;

  /**
   * Identity provider identifier
   */
  providerId: string;

  /**
   * Verified external identity (from adapter)
   */
  identity: VerifiedExternalIdentity;

  /**
   * Session context
   */
  context: SessionContext;
}

/**
 * Enterprise authentication result
 */
export interface EnterpriseAuthenticationResult {
  /**
   * Created session
   */
  session: CreatedSession;

  /**
   * Authenticated principal
   */
  principal: AuthenticatedPrincipal;

  /**
   * Whether user was just created
   */
  userWasCreated: boolean;

  /**
   * Identity link ID
   */
  identityLinkId: string;
}

/**
 * Credential-based authentication input (LDAP)
 */
export interface CredentialAuthenticationInput {
  tenantId: string;
  providerId: string;
  username: string;
  password: string;
  context: SessionContext;
}

/**
 * Enterprise Login Service
 */
export class EnterpriseLoginService {
  private sessionService: SessionService;
  private identityLinks: IdentityLinkService;
  private provisioning: IdentityProvisioningService;
  private roleMapping: RoleMappingService;
  private principalService: PrincipalService;

  constructor(
    private pool: Pool,
    sessionServiceConfig: {
      jwtSecret: string;
      accessTokenLifetime?: number;
      refreshTokenLifetime?: number;
    },
  ) {
    this.sessionService = new SessionService(pool, sessionServiceConfig);
    this.identityLinks = new IdentityLinkService(pool);
    this.provisioning = new IdentityProvisioningService(pool);
    this.roleMapping = new RoleMappingService(pool);
    this.principalService = new PrincipalService(pool);
  }

  /**
   * Complete enterprise authentication
   * 
   * This is the main entry point after adapter has verified external identity.
   * 
   * Called by:
   * - OIDC callback handler
   * - SAML ACS handler
   * - Azure AD callback handler
   */
  async completeAuthentication(
    input: EnterpriseAuthenticationInput,
  ): Promise<EnterpriseAuthenticationResult> {
    // Get provider configuration
    const provider = await this.getEnabledProvider(input.tenantId, input.providerId);

    // Validate authentication policy
    await this.validateAuthenticationPolicy(provider, input.identity);

    // Resolve or provision user
    const provisioned = await this.provisioning.resolveOrProvision(
      input.tenantId,
      provider,
      input.identity,
    );

    // Map external groups to roles
    const resolvedRoles = await this.roleMapping.resolveRoles(
      input.tenantId,
      provider.id,
      input.identity,
      {
        defaultRoleId: provider.authorization.defaultRoleId,
        requireMappedRole: provider.authorization.requireMappedRole,
      },
    );

    // Assign roles to membership
    if (resolvedRoles.roleIds.length > 0) {
      await this.principalService.assignRoles(
        provisioned.membershipId,
        resolvedRoles.roleIds,
      );
    }

    // Build principal
    const principal = await this.principalService.resolve(
      provisioned.userId,
      input.tenantId,
      {
        source: this.mapProviderTypeToAuthSource(input.identity.providerType),
        providerId: provider.id,
        mfa: input.identity.assurance?.mfa ?? false,
        assuranceLevel: this.determineAssuranceLevel(input.identity.assurance),
        phishingResistant: input.identity.assurance?.phishingResistant,
        authenticatedAt: input.identity.authenticatedAt,
        authenticationMethods: input.identity.assurance?.authenticationMethods,
      },
      {
        requireActive: true,
        requireActiveMembership: true,
        includePermissions: true,
      },
    );

    // Additional policy checks
    await this.enforceSecurityPolicy(provider, principal);

    // Create session
    const session = await this.sessionService.create(principal, input.context);

    // Record audit event (would be implemented separately)
    await this.recordAuthenticationSuccess(
      input.tenantId,
      provider.id,
      principal.userId,
      session.sessionId,
      input.identity,
      input.context,
    );

    return {
      session,
      principal,
      userWasCreated: provisioned.wasCreated,
      identityLinkId: provisioned.identityLinkId,
    };
  }

  /**
   * Credential-based authentication (LDAP)
   * 
   * This method handles the full flow for username/password authentication
   * via LDAP or similar directory services.
   */
  async loginWithCredentials(
    input: CredentialAuthenticationInput,
  ): Promise<EnterpriseAuthenticationResult> {
    // Get provider
    const provider = await this.getEnabledProvider(input.tenantId, input.providerId);

    if (provider.configuration.type !== 'LDAP') {
      throw new IdentityProviderError(
        'PROVIDER_MISCONFIGURED',
        'Provider does not support credential authentication',
        provider.id,
      );
    }

    // Authenticate via LDAP adapter (would be injected)
    // For now, this is a placeholder showing the expected flow
    throw new EnterpriseAuthError(
      'INTERNAL_ERROR',
      'LDAP adapter integration pending',
    );

    // The actual implementation would be:
    // const adapter = this.getLDAPAdapter(provider);
    // const identity = await adapter.authenticate(input.username, input.password);
    //
    // return this.completeAuthentication({
    //   tenantId: input.tenantId,
    //   providerId: input.providerId,
    //   identity,
    //   context: input.context,
    // });
  }

  /**
   * Get enabled identity provider
   */
  private async getEnabledProvider(
    tenantId: string,
    providerId: string,
  ): Promise<IdentityProvider> {
    const result = await this.pool.query<any>(
      `SELECT 
        id, tenant_id as "tenantId",
        configuration, provisioning, authorization, security,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM identity_providers
      WHERE id = $1
        AND tenant_id = $2`,
      [providerId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new IdentityProviderError(
        'PROVIDER_NOT_FOUND',
        'Identity provider not found',
        providerId,
      );
    }

    const provider = result.rows[0];

    if (!provider.configuration.enabled) {
      throw new IdentityProviderError(
        'PROVIDER_DISABLED',
        'Identity provider is disabled',
        providerId,
      );
    }

    return provider;
  }

  /**
   * Validate authentication policy
   */
  private async validateAuthenticationPolicy(
    provider: IdentityProvider,
    identity: VerifiedExternalIdentity,
  ): Promise<void> {
    const policy = provider.security;

    // Check MFA requirement
    if (policy.requireMfa && !identity.assurance?.mfa) {
      throw new AuthenticationPolicyError(
        'MFA_REQUIRED',
        'Multi-factor authentication is required for this provider',
        {
          providerId: provider.id,
          mfaUsed: identity.assurance?.mfa,
        },
      );
    }

    // Check phishing-resistant requirement
    if (policy.requirePhishingResistant && !identity.assurance?.phishingResistant) {
      throw new AuthenticationPolicyError(
        'PHISHING_RESISTANT_REQUIRED',
        'Phishing-resistant authentication is required',
        {
          providerId: provider.id,
        },
      );
    }

    // Check authentication age
    if (policy.maxAuthenticationAge) {
      const ageSeconds = (Date.now() - identity.authenticatedAt.getTime()) / 1000;

      if (ageSeconds > policy.maxAuthenticationAge) {
        throw new AuthenticationPolicyError(
          'AUTHENTICATION_TOO_OLD',
          'Authentication is too old',
          {
            providerId: provider.id,
            ageSeconds,
            maxAge: policy.maxAuthenticationAge,
          },
        );
      }
    }
  }

  /**
   * Enforce security policy on principal
   */
  private async enforceSecurityPolicy(
    provider: IdentityProvider,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    const policy = provider.authorization;

    // Check IP restrictions
    if (policy.allowedIpRanges && policy.allowedIpRanges.length > 0) {
      // Would implement IP range checking here
      // For now, skip
    }

    // Check concurrent session limit
    if (policy.maxConcurrentSessions && policy.maxConcurrentSessions > 0) {
      const activeSessions = await this.sessionService.getUserSessions(principal.userId);

      if (activeSessions.length >= policy.maxConcurrentSessions) {
        throw new AuthenticationPolicyError(
          'SESSION_LIMIT_EXCEEDED',
          'Maximum concurrent sessions exceeded',
          {
            providerId: provider.id,
            activeSessionCount: activeSessions.length,
            maxSessions: policy.maxConcurrentSessions,
          },
        );
      }
    }
  }

  /**
   * Map provider type to authentication source
   */
  private mapProviderTypeToAuthSource(
    providerType: EnterpriseIdentityProvider,
  ): 'OIDC' | 'SAML' | 'AZURE_AD' | 'LDAP' {
    return providerType;
  }

  /**
   * Determine assurance level from authentication assurance
   */
  private determineAssuranceLevel(
    assurance?: {
      mfa: boolean;
      phishingResistant?: boolean;
      authenticationMethods?: string[];
    },
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!assurance) {
      return 'LOW';
    }

    if (assurance.phishingResistant) {
      return 'HIGH';
    }

    if (assurance.mfa) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Record successful authentication (audit)
   */
  private async recordAuthenticationSuccess(
    tenantId: string,
    providerId: string,
    userId: string,
    sessionId: string,
    identity: VerifiedExternalIdentity,
    context: SessionContext,
  ): Promise<void> {
    // This would integrate with your audit service
    // For now, just log to database
    try {
      await this.pool.query(
        `INSERT INTO audit_events (
          event_type, tenant_id, user_id, provider_id,
          session_id, ip_address, user_agent,
          event_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          'ENTERPRISE_LOGIN_SUCCESS',
          tenantId,
          userId,
          providerId,
          sessionId,
          context.ipAddress,
          context.userAgent,
          JSON.stringify({
            providerType: identity.providerType,
            externalSubject: identity.subject,
            mfa: identity.assurance?.mfa,
            assuranceLevel: this.determineAssuranceLevel(identity.assurance),
          }),
        ]
      );
    } catch (error) {
      // Don't fail authentication if audit fails
      console.error('Failed to record authentication audit event:', error);
    }
  }

  /**
   * Record failed authentication (audit)
   */
  async recordAuthenticationFailure(
    tenantId: string,
    providerId: string,
    error: Error,
    context: SessionContext,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_events (
          event_type, tenant_id, provider_id,
          ip_address, user_agent,
          event_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [
          'ENTERPRISE_LOGIN_FAILURE',
          tenantId,
          providerId,
          context.ipAddress,
          context.userAgent,
          JSON.stringify({
            errorName: error.name,
            errorMessage: error.message,
          }),
        ]
      );
    } catch (auditError) {
      console.error('Failed to record authentication failure audit event:', auditError);
    }
  }

  /**
   * Get session service (for external access if needed)
   */
  getSessionService(): SessionService {
    return this.sessionService;
  }

  /**
   * Cleanup (for graceful shutdown)
   */
  destroy(): void {
    this.sessionService.destroy();
  }
}
