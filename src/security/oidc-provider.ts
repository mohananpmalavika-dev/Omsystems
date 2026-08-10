/**
 * OpenID Connect (OIDC) Authentication Provider
 * 
 * Supports:
 * - Authorization Code Flow with PKCE
 * - Multiple providers: Azure AD, Okta, Auth0, Keycloak, Google Workspace
 * - Token validation and refresh
 * - Userinfo endpoint integration
 * - Dynamic tenant configuration
 * 
 * Standards:
 * - OpenID Connect Core 1.0
 * - OAuth 2.0 RFC 6749
 * - PKCE RFC 7636
 */

import { Issuer, Client, generators, TokenSet, UserinfoResponse } from 'openid-client';
import crypto from 'crypto';

export interface OIDCTenantConfig {
  tenantId: string;
  provider: 'azure-ad' | 'okta' | 'auth0' | 'keycloak' | 'google' | 'generic';
  
  // Discovery URL (auto-configures endpoints)
  issuerUrl: string; // e.g., https://login.microsoftonline.com/{tenant}/v2.0
  
  // Client credentials
  clientId: string;
  clientSecret: string;
  
  // Callback URL
  redirectUri: string; // e.g., https://sentinel.example.com/api/v1/auth/oidc/callback
  
  // Scopes
  scopes?: string[]; // Default: ['openid', 'profile', 'email']
  
  // User attribute mapping
  attributeMapping?: {
    userId?: string;      // Default: 'sub'
    email?: string;       // Default: 'email'
    firstName?: string;   // Default: 'given_name'
    lastName?: string;    // Default: 'family_name'
    displayName?: string; // Default: 'name'
    groups?: string;      // Default: 'groups'
  };
  
  // Security options
  requirePKCE?: boolean;        // Default: true
  requireStateValidation?: boolean; // Default: true
  clockTolerance?: number;      // Default: 60 seconds
  
  // Session settings
  sessionDurationSeconds?: number; // Default: 3600
}

interface OIDCSession {
  state: string;
  nonce: string;
  codeVerifier?: string; // For PKCE
  tenantId: string;
  redirectUrl?: string;
  createdAt: number;
}

export interface OIDCUserProfile {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  groups?: string[];
  rawClaims: Record<string, any>;
}

export class OIDCProvider {
  private clients: Map<string, Client> = new Map();
  private sessions: Map<string, OIDCSession> = new Map();
  private configs: Map<string, OIDCTenantConfig> = new Map();
  
  constructor() {
    // Clean up expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }
  
  /**
   * Register tenant OIDC configuration
   */
  async registerTenant(config: OIDCTenantConfig): Promise<void> {
    try {
      // Discover OIDC endpoints
      const issuer = await Issuer.discover(config.issuerUrl);
      
      // Create client
      const client = new issuer.Client({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uris: [config.redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post'
      });
      
      // Set clock tolerance
      client[Symbol.for('openid-client.custom.clock_tolerance')] = 
        config.clockTolerance ?? 60;
      
      this.clients.set(config.tenantId, client);
      this.configs.set(config.tenantId, config);
      
      console.log(`[OIDC] Registered tenant: ${config.tenantId} (${config.provider})`);
    } catch (error) {
      console.error(`[OIDC] Failed to register tenant ${config.tenantId}:`, error);
      throw new Error(`OIDC tenant registration failed: ${error.message}`);
    }
  }
  
  /**
   * Initiate OIDC authentication flow
   * Returns authorization URL to redirect user to
   */
  async initiateLogin(
    tenantId: string,
    redirectUrl?: string
  ): Promise<{ authUrl: string; state: string }> {
    const client = this.clients.get(tenantId);
    const config = this.configs.get(tenantId);
    
    if (!client || !config) {
      throw new Error(`OIDC tenant not configured: ${tenantId}`);
    }
    
    // Generate security tokens
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = config.requirePKCE !== false 
      ? generators.codeVerifier() 
      : undefined;
    const codeChallenge = codeVerifier 
      ? generators.codeChallenge(codeVerifier) 
      : undefined;
    
    // Store session
    const session: OIDCSession = {
      state,
      nonce,
      codeVerifier,
      tenantId,
      redirectUrl,
      createdAt: Date.now()
    };
    this.sessions.set(state, session);
    
    // Build authorization URL
    const scopes = config.scopes ?? ['openid', 'profile', 'email'];
    const authUrl = client.authorizationUrl({
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallenge ? 'S256' : undefined
    });
    
    return { authUrl, state };
  }
  
  /**
   * Handle OIDC callback after user authentication
   */
  async handleCallback(
    callbackUrl: string,
    state: string
  ): Promise<{ profile: OIDCUserProfile; tenantId: string; redirectUrl?: string }> {
    // Retrieve session
    const session = this.sessions.get(state);
    if (!session) {
      throw new Error('Invalid or expired OIDC state');
    }
    
    const client = this.clients.get(session.tenantId);
    const config = this.configs.get(session.tenantId);
    
    if (!client || !config) {
      throw new Error(`OIDC tenant not configured: ${session.tenantId}`);
    }
    
    try {
      // Exchange authorization code for tokens
      const params = client.callbackParams(callbackUrl);
      const tokenSet = await client.callback(
        config.redirectUri,
        params,
        {
          state: session.state,
          nonce: session.nonce,
          code_verifier: session.codeVerifier
        }
      );
      
      // Fetch user profile
      const profile = await this.getUserProfile(client, tokenSet, config);
      
      // Clean up session
      this.sessions.delete(state);
      
      return {
        profile,
        tenantId: session.tenantId,
        redirectUrl: session.redirectUrl
      };
    } catch (error) {
      this.sessions.delete(state);
      console.error(`[OIDC] Callback failed for tenant ${session.tenantId}:`, error);
      throw new Error(`OIDC authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Fetch user profile from userinfo endpoint
   */
  private async getUserProfile(
    client: Client,
    tokenSet: TokenSet,
    config: OIDCTenantConfig
  ): Promise<OIDCUserProfile> {
    const userinfo: UserinfoResponse = await client.userinfo(tokenSet);
    const claims = tokenSet.claims();
    
    // Merge ID token claims with userinfo
    const allClaims = { ...claims, ...userinfo };
    
    // Map attributes
    const mapping = config.attributeMapping ?? {};
    
    return {
      userId: allClaims[mapping.userId ?? 'sub'],
      email: allClaims[mapping.email ?? 'email'],
      firstName: allClaims[mapping.firstName ?? 'given_name'],
      lastName: allClaims[mapping.lastName ?? 'family_name'],
      displayName: allClaims[mapping.displayName ?? 'name'] || 
                   `${allClaims['given_name'] || ''} ${allClaims['family_name'] || ''}`.trim(),
      groups: allClaims[mapping.groups ?? 'groups'],
      rawClaims: allClaims
    };
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshToken(
    tenantId: string,
    refreshToken: string
  ): Promise<TokenSet> {
    const client = this.clients.get(tenantId);
    if (!client) {
      throw new Error(`OIDC tenant not configured: ${tenantId}`);
    }
    
    try {
      const tokenSet = await client.refresh(refreshToken);
      return tokenSet;
    } catch (error) {
      console.error(`[OIDC] Token refresh failed for tenant ${tenantId}:`, error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
  
  /**
   * Validate access token
   */
  async validateToken(
    tenantId: string,
    accessToken: string
  ): Promise<boolean> {
    const client = this.clients.get(tenantId);
    if (!client) {
      throw new Error(`OIDC tenant not configured: ${tenantId}`);
    }
    
    try {
      await client.userinfo(accessToken);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Initiate OIDC logout (RP-initiated logout)
   */
  async initiateLogout(
    tenantId: string,
    idToken: string,
    postLogoutRedirectUri?: string
  ): Promise<string | null> {
    const client = this.clients.get(tenantId);
    if (!client) {
      throw new Error(`OIDC tenant not configured: ${tenantId}`);
    }
    
    // Check if provider supports end_session_endpoint
    const issuer = client.issuer;
    if (!issuer.end_session_endpoint) {
      return null; // Provider doesn't support logout
    }
    
    return client.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: postLogoutRedirectUri
    });
  }
  
  /**
   * Get tenant configuration
   */
  getTenantConfig(tenantId: string): OIDCTenantConfig | undefined {
    return this.configs.get(tenantId);
  }
  
  /**
   * Remove tenant configuration
   */
  removeTenant(tenantId: string): void {
    this.clients.delete(tenantId);
    this.configs.delete(tenantId);
    console.log(`[OIDC] Removed tenant: ${tenantId}`);
  }
  
  /**
   * Clean up expired sessions (> 10 minutes old)
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    let cleaned = 0;
    for (const [state, session] of this.sessions.entries()) {
      if (now - session.createdAt > maxAge) {
        this.sessions.delete(state);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[OIDC] Cleaned up ${cleaned} expired sessions`);
    }
  }
  
  /**
   * Get provider-specific configuration examples
   */
  static getProviderExample(provider: string): Partial<OIDCTenantConfig> {
    switch (provider) {
      case 'azure-ad':
        return {
          provider: 'azure-ad',
          issuerUrl: 'https://login.microsoftonline.com/{tenant-id}/v2.0',
          scopes: ['openid', 'profile', 'email', 'offline_access'],
          attributeMapping: {
            userId: 'oid',
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            displayName: 'name',
            groups: 'groups'
          }
        };
      
      case 'okta':
        return {
          provider: 'okta',
          issuerUrl: 'https://{your-domain}.okta.com/oauth2/default',
          scopes: ['openid', 'profile', 'email', 'groups'],
          attributeMapping: {
            userId: 'sub',
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            displayName: 'name',
            groups: 'groups'
          }
        };
      
      case 'auth0':
        return {
          provider: 'auth0',
          issuerUrl: 'https://{your-tenant}.auth0.com',
          scopes: ['openid', 'profile', 'email'],
          attributeMapping: {
            userId: 'sub',
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            displayName: 'name'
          }
        };
      
      case 'keycloak':
        return {
          provider: 'keycloak',
          issuerUrl: 'https://{your-domain}/auth/realms/{realm-name}',
          scopes: ['openid', 'profile', 'email', 'roles'],
          attributeMapping: {
            userId: 'sub',
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            displayName: 'name',
            groups: 'groups'
          }
        };
      
      case 'google':
        return {
          provider: 'google',
          issuerUrl: 'https://accounts.google.com',
          scopes: ['openid', 'profile', 'email'],
          attributeMapping: {
            userId: 'sub',
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            displayName: 'name'
          }
        };
      
      default:
        return {
          provider: 'generic',
          scopes: ['openid', 'profile', 'email']
        };
    }
  }
}

// Singleton instance
export const oidcProvider = new OIDCProvider();
