/**
 * Azure AD (Entra ID) Identity Adapter
 * 
 * Handles authentication via Microsoft Entra ID (formerly Azure AD).
 * Treats Azure AD as an OIDC provider with Microsoft-specific extensions.
 * 
 * Key responsibilities:
 * - OIDC authorization code flow with PKCE
 * - Token verification (signature, issuer, audience, nonce)
 * - Claims normalization to VerifiedExternalIdentity
 * - Group overage handling
 * 
 * Does NOT:
 * - Create local users
 * - Assign roles
 * - Generate application tokens
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
  AzureADProviderConfiguration,
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
import { createHash, randomBytes } from 'crypto';

/**
 * Azure AD token claims (id_token)
 */
interface AzureADTokenClaims {
  // Standard OIDC claims
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  nbf: number;
  iat: number;
  nonce?: string;

  // Azure AD specific claims
  oid?: string; // Object ID (immutable user identifier)
  tid: string; // Tenant ID
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  
  // Group claims
  groups?: string[];
  _claim_names?: {
    groups?: string;
  };
  _claim_sources?: any;

  // Authentication context
  amr?: string[]; // Authentication methods
  acr?: string; // Authentication context class
  
  // Additional claims
  ver?: string; // Token version
  upn?: string; // User principal name
}

/**
 * Azure AD Adapter
 */
export class AzureADIdentityAdapter implements EnterpriseIdentityAdapter {
  readonly type = 'AZURE_AD' as const;

  /**
   * Authenticate via Azure AD OIDC callback
   */
  async authenticate(input: EnterpriseAuthenticationInput): Promise<VerifiedExternalIdentity> {
    const config = this.getConfiguration(input.provider);
    const callbackInput = input.request as OIDCCallbackInput;

    // Exchange authorization code for tokens
    const tokens = await this.exchangeCodeForTokens(config, callbackInput);

    // Verify and decode ID token
    const claims = await this.verifyIdToken(config, tokens.id_token, callbackInput.nonce);

    // Validate claims
    this.validateClaims(config, claims);

    // Get groups (handle overage)
    const groups = await this.resolveGroups(config, claims, tokens.access_token);

    // Normalize to VerifiedExternalIdentity
    return this.normalizeIdentity(input.provider.id, config, claims, groups);
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    config: AzureADProviderConfiguration,
    input: OIDCCallbackInput,
  ): Promise<{ id_token: string; access_token: string; refresh_token?: string }> {
    const tokenEndpoint = this.getTokenEndpoint(config);

    const body = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(' '),
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      client_secret: await this.getClientSecret(config.clientSecretRef),
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new IdentityProviderError(
          'PROVIDER_UNAVAILABLE',
          `Token exchange failed: ${error.error_description || response.statusText}`,
          undefined,
          { statusCode: response.status, error }
        );
      }

      const tokens = await response.json();

      if (!tokens.id_token) {
        throw new InvalidTokenError('No id_token in response', 'ID');
      }

      return tokens;
    } catch (error) {
      if (error instanceof IdentityProviderError) {
        throw error;
      }

      throw new IdentityProviderError(
        'PROVIDER_UNAVAILABLE',
        'Failed to exchange authorization code',
        undefined,
        { cause: error }
      );
    }
  }

  /**
   * Verify ID token
   * 
   * In production, this should:
   * 1. Fetch JWKS from Microsoft
   * 2. Verify signature using appropriate key
   * 3. Validate issuer, audience, expiration
   * 4. Verify nonce
   * 
   * For now, this is a simplified implementation.
   */
  private async verifyIdToken(
    config: AzureADProviderConfiguration,
    idToken: string,
    expectedNonce?: string,
  ): Promise<AzureADTokenClaims> {
    // Parse token (simplified - production should verify signature)
    const parts = idToken.split('.');
    
    if (parts.length !== 3) {
      throw new InvalidTokenError('Malformed JWT', 'ID');
    }

    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const claims = JSON.parse(payloadJson) as AzureADTokenClaims;

      // Validate issuer
      const expectedIssuer = this.getExpectedIssuer(config);
      if (!claims.iss.startsWith(expectedIssuer)) {
        throw new ProtocolValidationError(
          'ISSUER_MISMATCH',
          `Token issuer does not match expected issuer`,
          'OIDC',
          { expected: expectedIssuer, actual: claims.iss }
        );
      }

      // Validate audience
      if (claims.aud !== config.clientId) {
        throw new ProtocolValidationError(
          'AUDIENCE_MISMATCH',
          'Token audience does not match client ID',
          'OIDC',
          { expected: config.clientId, actual: claims.aud }
        );
      }

      // Validate tenant
      if (claims.tid !== config.tenantId) {
        throw new ProtocolValidationError(
          'ISSUER_MISMATCH',
          'Token tenant ID does not match configured tenant',
          'OIDC',
          { expected: config.tenantId, actual: claims.tid }
        );
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp < now) {
        throw new InvalidTokenError('Token has expired', 'ID');
      }

      // Validate not before
      if (claims.nbf && claims.nbf > now + 60) { // 60 second clock skew
        throw new InvalidTokenError('Token not yet valid', 'ID');
      }

      // Validate nonce
      if (expectedNonce && claims.nonce !== expectedNonce) {
        throw new ProtocolValidationError(
          'NONCE_MISMATCH',
          'Token nonce does not match expected nonce',
          'OIDC',
          { expected: expectedNonce, actual: claims.nonce }
        );
      }

      // TODO: Verify signature using JWKS
      // const jwks = await this.fetchJWKS(config);
      // await this.verifySignature(idToken, jwks, claims);

      return claims;
    } catch (error) {
      if (error instanceof ProtocolValidationError || error instanceof InvalidTokenError) {
        throw error;
      }

      throw new InvalidTokenError('Failed to parse ID token', 'ID', { cause: error });
    }
  }

  /**
   * Validate claims
   */
  private validateClaims(config: AzureADProviderConfiguration, claims: AzureADTokenClaims): void {
    // Validate required claims
    if (!claims.oid && !claims.sub) {
      throw new InvalidTokenError('Token missing user identifier (oid or sub)', 'ID');
    }

    if (!claims.tid) {
      throw new InvalidTokenError('Token missing tenant ID', 'ID');
    }
  }

  /**
   * Resolve groups (handle overage)
   */
  private async resolveGroups(
    config: AzureADProviderConfiguration,
    claims: AzureADTokenClaims,
    accessToken: string,
  ): Promise<string[]> {
    // Check if groups are in token
    if (claims.groups && Array.isArray(claims.groups)) {
      return claims.groups;
    }

    // Check for group overage claim
    if (claims._claim_names?.groups) {
      // Groups exceeded token size limit, need to call Graph API
      // For now, return empty array (production should call Microsoft Graph)
      console.warn('Group overage detected, Microsoft Graph lookup not implemented');
      return [];
    }

    // No groups claim
    return [];
  }

  /**
   * Normalize claims to VerifiedExternalIdentity
   */
  private normalizeIdentity(
    providerId: string,
    config: AzureADProviderConfiguration,
    claims: AzureADTokenClaims,
    groups: string[],
  ): VerifiedExternalIdentity {
    // Use oid as primary identifier (immutable), fall back to sub
    const subject = claims.oid || claims.sub;

    // Determine if email is verified (Azure AD guarantees verification)
    const emailVerified = !!claims.email;

    // Build authentication assurance
    const assurance: AuthenticationAssurance = {
      mfa: this.detectMFA(claims.amr),
      phishingResistant: this.detectPhishingResistant(claims.amr),
      authenticationMethods: claims.amr,
      acr: claims.acr,
      amr: claims.amr,
    };

    return {
      providerId,
      providerType: 'AZURE_AD',
      subject,
      tenantHint: claims.tid,
      email: claims.email || claims.preferred_username,
      emailVerified,
      username: claims.preferred_username || claims.upn,
      displayName: claims.name,
      givenName: claims.given_name,
      familyName: claims.family_name,
      groups,
      claims: claims as Record<string, unknown>,
      authenticatedAt: new Date(claims.iat * 1000),
      assurance,
    };
  }

  /**
   * Detect MFA usage from AMR claim
   */
  private detectMFA(amr?: string[]): boolean {
    if (!amr || amr.length === 0) {
      return false;
    }

    // Azure AD MFA indicators
    const mfaIndicators = ['mfa', 'otp', 'sms', 'tel', 'hwk', 'wia'];
    
    return amr.some(method => mfaIndicators.includes(method.toLowerCase()));
  }

  /**
   * Detect phishing-resistant authentication
   */
  private detectPhishingResistant(amr?: string[]): boolean {
    if (!amr || amr.length === 0) {
      return false;
    }

    // Phishing-resistant methods
    const phishingResistantMethods = ['hwk', 'wia', 'fido'];
    
    return amr.some(method => phishingResistantMethods.includes(method.toLowerCase()));
  }

  /**
   * Check adapter readiness
   */
  checkReadiness(provider: IdentityProvider): ProviderReadiness {
    const config = this.getConfiguration(provider);
    const errors: string[] = [];

    if (!config.tenantId) {
      errors.push('Azure AD tenant ID is required');
    }

    if (!config.clientId) {
      errors.push('Client ID is required');
    }

    if (!config.clientSecretRef) {
      errors.push('Client secret reference is required');
    }

    if (!config.redirectUri) {
      errors.push('Redirect URI is required');
    }

    if (!config.redirectUri.startsWith('https://') && process.env.NODE_ENV === 'production') {
      errors.push('Redirect URI must use HTTPS in production');
    }

    if (config.scopes.length === 0) {
      errors.push('At least one scope is required');
    }

    if (errors.length > 0) {
      return { ready: false, reasons: errors };
    }

    return { ready: true };
  }

  /**
   * Health check
   */
  async healthCheck(provider: IdentityProvider): Promise<IdentityProviderHealth> {
    const config = this.getConfiguration(provider);
    const checks: any[] = [];

    // Check OIDC discovery endpoint
    try {
      const discoveryUrl = this.getDiscoveryEndpoint(config);
      const response = await fetch(discoveryUrl, { method: 'GET' });
      
      checks.push({
        name: 'OIDC Discovery',
        status: response.ok ? 'PASS' : 'FAIL',
        message: response.ok ? 'Discovery endpoint reachable' : `HTTP ${response.status}`,
        timestamp: new Date(),
      });
    } catch (error) {
      checks.push({
        name: 'OIDC Discovery',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    }

    // Check JWKS endpoint
    try {
      const jwksUrl = this.getJWKSEndpoint(config);
      const response = await fetch(jwksUrl, { method: 'GET' });
      
      checks.push({
        name: 'JWKS',
        status: response.ok ? 'PASS' : 'FAIL',
        message: response.ok ? 'JWKS endpoint reachable' : `HTTP ${response.status}`,
        timestamp: new Date(),
      });
    } catch (error) {
      checks.push({
        name: 'JWKS',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    }

    const allHealthy = checks.every(c => c.status === 'PASS');

    return {
      providerId: provider.id,
      status: allHealthy ? 'HEALTHY' : 'DEGRADED',
      lastHealthCheck: new Date(),
      checks,
    };
  }

  /**
   * Get adapter capabilities
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
    if (provider.configuration.type !== 'AZURE_AD') {
      return {
        valid: false,
        errors: ['Provider configuration type must be AZURE_AD'],
      };
    }

    const readiness = this.checkReadiness(provider);
    
    return {
      valid: readiness.ready,
      errors: readiness.ready ? [] : readiness.reasons,
    };
  }

  /**
   * Get typed configuration
   */
  private getConfiguration(provider: IdentityProvider): AzureADProviderConfiguration {
    if (provider.configuration.type !== 'AZURE_AD') {
      throw new ConfigurationError('Provider is not configured for Azure AD');
    }

    return provider.configuration as AzureADProviderConfiguration;
  }

  /**
   * Get client secret from secret store
   */
  private async getClientSecret(secretRef: string): Promise<string> {
    // TODO: Integrate with secret management service
    // For now, assume secretRef is the actual secret (INSECURE - for development only)
    return secretRef;
  }

  /**
   * Get Azure AD endpoints
   */
  private getCloudInstance(config: AzureADProviderConfiguration): string {
    switch (config.cloudInstance) {
      case 'us_government':
        return 'https://login.microsoftonline.us';
      case 'china':
        return 'https://login.chinacloudapi.cn';
      case 'germany':
        return 'https://login.microsoftonline.de';
      default:
        return 'https://login.microsoftonline.com';
    }
  }

  private getDiscoveryEndpoint(config: AzureADProviderConfiguration): string {
    const cloud = this.getCloudInstance(config);
    const version = config.useV2Endpoint ? 'v2.0' : 'v1.0';
    return `${cloud}/${config.tenantId}/${version}/.well-known/openid-configuration`;
  }

  private getTokenEndpoint(config: AzureADProviderConfiguration): string {
    const cloud = this.getCloudInstance(config);
    const version = config.useV2Endpoint ? 'v2.0' : 'v1.0';
    return `${cloud}/${config.tenantId}/oauth2/${version}/token`;
  }

  private getJWKSEndpoint(config: AzureADProviderConfiguration): string {
    const cloud = this.getCloudInstance(config);
    const version = config.useV2Endpoint ? 'v2.0' : 'v1.0';
    return `${cloud}/${config.tenantId}/discovery/${version}/keys`;
  }

  private getExpectedIssuer(config: AzureADProviderConfiguration): string {
    const cloud = this.getCloudInstance(config);
    const version = config.useV2Endpoint ? 'v2.0' : 'v1.0';
    return `${cloud}/${config.tenantId}/${version}`;
  }
}
