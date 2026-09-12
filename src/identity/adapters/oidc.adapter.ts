/**
 * OpenID Connect (OIDC) Identity Adapter
 * 
 * Production adapter handling authentication via Google Workspace, Okta,
 * and generic OIDC compliant Identity Providers.
 * 
 * Key responsibilities:
 * - OIDC authorization code flow with PKCE
 * - Cryptographic token verification (JWKS, issuer, audience, nonce)
 * - Domain validation (Google Workspace hosted domain 'hd', allowed domains whitelist)
 * - Claims normalization to VerifiedExternalIdentity
 * - Group and role mapping resolution
 * - Connectivity and discovery health checks
 */

import type {
  EnterpriseIdentityAdapter,
  EnterpriseAuthenticationInput,
  OIDCCallbackInput,
} from './identity-adapter.js';
import type {
  VerifiedExternalIdentity,
  AuthenticationAssurance,
} from '../domain/verified-external-identity.js';
import type {
  IdentityProvider,
  OIDCProviderConfiguration,
  IdentityProviderCapabilities,
  IdentityProviderHealth,
  ProviderReadiness,
} from '../domain/identity-provider.js';
import {
  InvalidTokenError,
  ProtocolValidationError,
  IdentityProviderError,
  ConfigurationError,
} from '../domain/auth-errors.js';
import { oidcProvider, type OIDCTenantConfig } from '../../security/oidc-provider.js';

export class OIDCIdentityAdapter implements EnterpriseIdentityAdapter {
  readonly type = 'OIDC' as const;

  /**
   * Authenticate via OIDC callback or authorization code
   */
  async authenticate(input: EnterpriseAuthenticationInput): Promise<VerifiedExternalIdentity> {
    const config = this.getConfiguration(input.provider);
    const callbackInput = input.request as OIDCCallbackInput;

    if (!callbackInput || !callbackInput.code || !callbackInput.state) {
      throw new ProtocolValidationError(
        'STATE_MISMATCH',
        'OIDC callback requires authorization code and state parameter',
        'OIDC',
      );
    }

    // Ensure tenant is registered in oidcProvider
    const tenantConfig = this.mapToTenantConfig(input.provider.id, config);
    await oidcProvider.registerTenant(tenantConfig);

    // Perform authorization code grant exchange with PKCE and JWKS verification
    try {
      const result = await oidcProvider.handleCallback({
        code: callbackInput.code,
        state: callbackInput.state,
      });

      return this.normalizeProfile(input.provider.id, config, result.profile);
    } catch (error: any) {
      if (error instanceof ProtocolValidationError || error instanceof InvalidTokenError) {
        throw error;
      }
      throw new IdentityProviderError(
        'PROVIDER_UNAVAILABLE',
        error.message || 'OIDC callback authentication failed',
        undefined,
        { cause: error },
      );
    }
  }

  /**
   * Check adapter readiness
   */
  checkReadiness(provider: IdentityProvider): ProviderReadiness {
    const errors: string[] = [];

    if (!provider.configuration) {
      return {
        ready: false,
        reasons: ['Provider configuration is missing'],
      };
    }

    const config = provider.configuration as OIDCProviderConfiguration;
    if (!config.issuer) errors.push('OIDC issuer URL is required');
    if (!config.clientId) errors.push('OIDC clientId is required');
    if (!config.redirectUri) errors.push('OIDC redirectUri is required');

    if (process.env.NODE_ENV === 'production') {
      if (config.issuer && !config.issuer.startsWith('https://')) {
        errors.push('OIDC issuer must use HTTPS in production');
      }
      if (config.redirectUri && !config.redirectUri.startsWith('https://')) {
        errors.push('OIDC redirectUri must use HTTPS in production');
      }
    }

    if (errors.length > 0) {
      return { ready: false, reasons: errors };
    }

    return { ready: true };
  }

  /**
   * Health check for OIDC provider (metadata discovery and JWKS)
   */
  async healthCheck(provider: IdentityProvider): Promise<IdentityProviderHealth> {
    const config = this.getConfiguration(provider);
    const tenantConfig = this.mapToTenantConfig(provider.id, config);
    const checks: any[] = [];

    try {
      const health = await oidcProvider.testDiscovery(tenantConfig);
      checks.push({
        name: 'OIDC Discovery',
        status: health.healthy ? 'PASS' : 'FAIL',
        message: health.healthy ? 'Discovery endpoint reachable' : (health.error || 'Failed'),
        timestamp: new Date(),
      });
      return {
        providerId: provider.id,
        status: health.healthy ? 'HEALTHY' : 'DEGRADED',
        lastHealthCheck: new Date(),
        checks,
      };
    } catch (error: any) {
      checks.push({
        name: 'OIDC Discovery',
        status: 'FAIL',
        message: error.message || 'Discovery connection failed',
        timestamp: new Date(),
      });
      return {
        providerId: provider.id,
        status: 'DEGRADED',
        lastHealthCheck: new Date(),
        checks,
      };
    }
  }

  /**
   * Capabilities supported by this OIDC adapter
   */
  getCapabilities(): IdentityProviderCapabilities {
    return {
      interactiveLogin: true,
      passwordAuthentication: false,
      groupClaims: true,
      mfaAssurance: true,
      logout: true,
      directorySync: false,
      jitProvisioning: true,
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration(provider: IdentityProvider): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = provider.configuration as OIDCProviderConfiguration;

    if (!config) {
      return { valid: false, errors: ['Configuration is missing'] };
    }

    if (!config.issuer) {
      errors.push('Issuer URL is required');
    } else {
      try {
        const u = new URL(config.issuer);
        if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') {
          errors.push('Issuer URL must use HTTPS');
        }
      } catch {
        errors.push('Invalid issuer URL');
      }
    }

    if (!config.clientId) errors.push('Client ID is required');
    if (!config.redirectUri) {
      errors.push('Redirect URI is required');
    } else {
      try {
        const u = new URL(config.redirectUri);
        if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') {
          errors.push('Redirect URI must use HTTPS');
        }
      } catch {
        errors.push('Invalid redirect URI');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private getConfiguration(provider: IdentityProvider): OIDCProviderConfiguration {
    if (provider.configuration.type !== 'OIDC') {
      throw new ConfigurationError(`Provider is not OIDC (type: ${provider.configuration.type})`);
    }
    return provider.configuration as OIDCProviderConfiguration;
  }

  private mapToTenantConfig(tenantId: string, config: OIDCProviderConfiguration): OIDCTenantConfig {
    const rawVariant = (config as any).providerVariant || (config as any).provider || 'generic';
    const provider = ['google', 'okta', 'azure-ad', 'auth0', 'keycloak', 'generic'].includes(rawVariant)
      ? rawVariant
      : config.issuer.includes('google.com')
        ? 'google'
        : config.issuer.includes('okta.com')
          ? 'okta'
          : 'generic';

    return {
      tenantId,
      provider,
      issuerUrl: config.issuer,
      clientId: config.clientId,
      clientSecret: (config as any).clientSecret,
      redirectUri: config.redirectUri,
      scopes: config.scopes?.length ? config.scopes : ['openid', 'profile', 'email'],
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      userinfoEndpoint: config.userinfoEndpoint,
      jwksUri: config.jwksUri,
      hostedDomain: (config as any).hostedDomain,
      allowedDomains: (config as any).allowedDomains || [],
      attributeMapping: (config as any).attributeMapping,
      roleMapping: (config as any).roleMapping,
      defaultRole: (config as any).defaultRole,
      requirePKCE: config.usePKCE !== false,
    };
  }

  private normalizeProfile(
    providerId: string,
    config: OIDCProviderConfiguration,
    profile: any,
  ): VerifiedExternalIdentity {
    const claims = profile.rawClaims || {};
    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];

    const assurance: AuthenticationAssurance = {
      mfa: amr.some((m: string) => ['mfa', 'otp', 'sms', 'fido', 'hwk'].includes(m.toLowerCase())),
      phishingResistant: amr.some((m: string) => ['fido', 'hwk', 'webauthn'].includes(m.toLowerCase())),
      authenticationMethods: amr,
      acr: typeof claims.acr === 'string' ? claims.acr : undefined,
      amr,
    };

    return {
      providerId,
      providerType: 'OIDC',
      subject: profile.userId,
      tenantHint: (config as any).tenantId || profile.hostedDomain,
      email: profile.email,
      emailVerified: claims.email_verified !== false,
      username: profile.email.split('@')[0] || profile.userId,
      displayName: profile.displayName || profile.email,
      givenName: profile.firstName,
      familyName: profile.lastName,
      groups: profile.groups || [],
      claims,
      authenticatedAt: new Date(),
      assurance,
    };
  }
}

export { OIDCIdentityAdapter as OIDCAdapter };
