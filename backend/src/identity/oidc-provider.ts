/**
 * OpenID Connect (OIDC) Authentication Provider
 * Implements Authorization Code Flow with PKCE, token validation, and user info retrieval
 * Supports Azure AD, Auth0, Okta, Google, Keycloak, and any OIDC-compliant provider
 */

import { Issuer, Client, generators, TokenSet, UserinfoResponse } from 'openid-client';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface OIDCConfiguration {
  // Provider Discovery
  issuer: string;
  discoveryUrl?: string; // Usually {issuer}/.well-known/openid-configuration
  
  // Client Registration
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;
  
  // Scopes
  scopes: string[]; // e.g., ['openid', 'profile', 'email', 'groups']
  
  // PKCE
  usePKCE?: boolean; // Recommended: true
  
  // Token Validation
  clockTolerance?: number; // seconds
  
  // Attribute Mapping
  attributeMapping: {
    userId?: string; // claim for user ID (default: 'sub')
    email: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
    roles?: string;
  };
  
  // Session
  sessionDurationMinutes?: number;
}

export interface OIDCUser {
  sub: string; // Subject (unique user identifier)
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  roles?: string[];
  claims: Record<string, any>;
}

export interface OIDCSession {
  id: string;
  tenantId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  expiresAt: Date;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationRequest {
  authUrl: string;
  state: string;
  nonce: string;
  codeVerifier?: string; // For PKCE
}

export class OIDCAuthProvider {
  private config: OIDCConfiguration;
  private pool: Pool;
  private issuer: Issuer | null = null;
  private client: Client | null = null;
  private pendingRequests: Map<string, { 
    codeVerifier?: string; 
    nonce: string; 
    createdAt: Date;
  }> = new Map();

  constructor(config: OIDCConfiguration, pool: Pool) {
    this.config = {
      ...config,
      usePKCE: config.usePKCE ?? true,
      clockTolerance: config.clockTolerance ?? 60,
      sessionDurationMinutes: config.sessionDurationMinutes ?? 480, // 8 hours
      scopes: config.scopes || ['openid', 'profile', 'email']
    };
    this.pool = pool;
  }

  /**
   * Initialize OIDC provider by discovering endpoints
   */
  async initialize(): Promise<void> {
    try {
      const discoveryUrl = this.config.discoveryUrl || 
        `${this.config.issuer}/.well-known/openid-configuration`;
      
      logger.info('Discovering OIDC configuration', { discoveryUrl });
      
      this.issuer = await Issuer.discover(discoveryUrl);
      
      this.client = new this.issuer.Client({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uris: [this.config.redirectUri],
        post_logout_redirect_uris: this.config.postLogoutRedirectUri 
          ? [this.config.postLogoutRedirectUri]
          : undefined,
        response_types: ['code'],
        token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_basic' : 'none'
      });

      logger.info('OIDC provider initialized', {
        issuer: this.issuer.metadata.issuer,
        authorizationEndpoint: this.issuer.metadata.authorization_endpoint,
        tokenEndpoint: this.issuer.metadata.token_endpoint,
        userinfoEndpoint: this.issuer.metadata.userinfo_endpoint
      });

    } catch (error) {
      logger.error('Failed to initialize OIDC provider', { error });
      throw new Error('OIDC initialization failed');
    }
  }

  /**
   * Generate authorization URL for login
   */
  async getAuthorizationUrl(relayState?: string): Promise<AuthorizationRequest> {
    if (!this.client) {
      throw new Error('OIDC provider not initialized');
    }

    const state = generators.state();
    const nonce = generators.nonce();
    
    let authParams: any = {
      scope: this.config.scopes.join(' '),
      state,
      nonce
    };

    let codeVerifier: string | undefined;

    // Add PKCE if enabled
    if (this.config.usePKCE) {
      codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      authParams.code_challenge = codeChallenge;
      authParams.code_challenge_method = 'S256';
    }

    const authUrl = this.client.authorizationUrl(authParams);

    // Store pending request
    this.pendingRequests.set(state, {
      codeVerifier,
      nonce,
      createdAt: new Date()
    });

    // Cleanup old requests (older than 5 minutes)
    this.cleanupPendingRequests();

    return {
      authUrl,
      state,
      nonce,
      codeVerifier
    };
  }

  /**
   * Handle callback and exchange code for tokens
   */
  async handleCallback(
    code: string,
    state: string,
    tenantId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<OIDCSession> {
    if (!this.client) {
      throw new Error('OIDC provider not initialized');
    }

    // Retrieve pending request
    const pending = this.pendingRequests.get(state);
    if (!pending) {
      throw new Error('Invalid or expired state parameter');
    }

    this.pendingRequests.delete(state);

    try {
      // Exchange authorization code for tokens
      const tokenParams: any = {
        code,
        redirect_uri: this.config.redirectUri
      };

      if (this.config.usePKCE && pending.codeVerifier) {
        tokenParams.code_verifier = pending.codeVerifier;
      }

      const tokenSet: TokenSet = await this.client.callback(
        this.config.redirectUri,
        { code, state },
        { nonce: pending.nonce, state }
      );

      // Validate ID token
      const claims = tokenSet.claims();
      
      if (!claims.sub) {
        throw new Error('Missing subject claim in ID token');
      }

      // Fetch additional user info if available
      let userinfo: UserinfoResponse | null = null;
      if (this.issuer?.metadata.userinfo_endpoint && tokenSet.access_token) {
        userinfo = await this.client.userinfo(tokenSet.access_token);
      }

      // Extract user information
      const user = this.extractUserFromClaims(claims, userinfo);

      // Get or create user in database
      const dbUser = await this.getOrCreateUser(tenantId, user);

      // Create session
      const session = await this.createSession(
        tenantId,
        dbUser.id,
        tokenSet,
        metadata
      );

      logger.info('OIDC authentication successful', {
        tenantId,
        userId: dbUser.id,
        sub: user.sub
      });

      return session;

    } catch (error) {
      logger.error('OIDC callback handling failed', { error });
      throw error;
    }
  }

  /**
   * Extract user information from ID token claims and userinfo
   */
  private extractUserFromClaims(
    claims: any,
    userinfo: UserinfoResponse | null
  ): OIDCUser {
    const mapping = this.config.attributeMapping;
    
    // Merge claims and userinfo
    const allClaims = { ...claims, ...(userinfo || {}) };

    const email = allClaims[mapping.email] || allClaims.email;
    const displayName = allClaims[mapping.displayName] || 
                        allClaims.name || 
                        allClaims.preferred_username ||
                        email;

    const firstName = mapping.firstName ? allClaims[mapping.firstName] : allClaims.given_name;
    const lastName = mapping.lastName ? allClaims[mapping.lastName] : allClaims.family_name;

    // Extract groups
    let groups: string[] = [];
    if (mapping.groups && allClaims[mapping.groups]) {
      const groupValue = allClaims[mapping.groups];
      groups = Array.isArray(groupValue) ? groupValue : [groupValue];
    }

    // Extract roles
    let roles: string[] = [];
    if (mapping.roles && allClaims[mapping.roles]) {
      const roleValue = allClaims[mapping.roles];
      roles = Array.isArray(roleValue) ? roleValue : [roleValue];
    }

    return {
      sub: claims.sub,
      email,
      displayName,
      firstName,
      lastName,
      groups,
      roles,
      claims: allClaims
    };
  }

  /**
   * Get or create user from OIDC claims
   */
  private async getOrCreateUser(
    tenantId: string,
    oidcUser: OIDCUser
  ): Promise<{ id: string }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user exists by OIDC sub or email
      let result = await client.query(
        `SELECT id, status FROM users 
         WHERE tenant_id = $1 AND (oidc_sub = $2 OR email = $3)`,
        [tenantId, oidcUser.sub, oidcUser.email]
      );

      let userId: string;

      if (result.rows.length > 0) {
        const user = result.rows[0];
        
        if (user.status !== 'active') {
          throw new Error('User account is not active');
        }

        userId = user.id;

        // Update user attributes
        await client.query(
          `UPDATE users 
           SET display_name = $1,
               oidc_sub = $2,
               oidc_claims = $3,
               last_login_at = NOW()
           WHERE id = $4`,
          [oidcUser.displayName, oidcUser.sub, JSON.stringify(oidcUser.claims), userId]
        );

      } else {
        // Create new user
        result = await client.query(
          `INSERT INTO users (
            tenant_id, email, display_name,
            auth_provider, oidc_sub, oidc_claims,
            status, role
          ) VALUES ($1, $2, $3, 'oidc', $4, $5, 'active', 'operator')
          RETURNING id`,
          [
            tenantId,
            oidcUser.email,
            oidcUser.displayName,
            oidcUser.sub,
            JSON.stringify(oidcUser.claims)
          ]
        );

        userId = result.rows[0].id;

        logger.info('Created new OIDC user', {
          tenantId,
          userId,
          email: oidcUser.email,
          sub: oidcUser.sub
        });
      }

      // Sync group memberships
      if (oidcUser.groups && oidcUser.groups.length > 0) {
        await this.syncGroupMemberships(client, tenantId, userId, oidcUser.groups);
      }

      await client.query('COMMIT');

      return { id: userId };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync group memberships from OIDC claims
   */
  private async syncGroupMemberships(
    client: any,
    tenantId: string,
    userId: string,
    groups: string[]
  ): Promise<void> {
    // Remove old group memberships
    await client.query(
      `DELETE FROM user_group_memberships 
       WHERE user_id = $1 AND source = 'oidc'`,
      [userId]
    );

    // Add new group memberships
    for (const groupName of groups) {
      // Get or create group
      let result = await client.query(
        `SELECT id FROM user_groups 
         WHERE tenant_id = $1 AND name = $2`,
        [tenantId, groupName]
      );

      let groupId: string;

      if (result.rows.length === 0) {
        result = await client.query(
          `INSERT INTO user_groups (tenant_id, name, source)
           VALUES ($1, $2, 'oidc')
           RETURNING id`,
          [tenantId, groupName]
        );
        groupId = result.rows[0].id;
      } else {
        groupId = result.rows[0].id;
      }

      await client.query(
        `INSERT INTO user_group_memberships (user_id, group_id, source)
         VALUES ($1, $2, 'oidc')
         ON CONFLICT (user_id, group_id) DO NOTHING`,
        [userId, groupId]
      );
    }
  }

  /**
   * Create OIDC session
   */
  private async createSession(
    tenantId: string,
    userId: string,
    tokenSet: TokenSet,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<OIDCSession> {
    const expiresIn = tokenSet.expires_in || this.config.sessionDurationMinutes! * 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const result = await this.pool.query(
      `INSERT INTO oidc_sessions (
        tenant_id, user_id, access_token, refresh_token, id_token,
        expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at`,
      [
        tenantId,
        userId,
        tokenSet.access_token,
        tokenSet.refresh_token,
        tokenSet.id_token,
        expiresAt,
        metadata?.ipAddress,
        metadata?.userAgent
      ]
    );

    return {
      id: result.rows[0].id,
      tenantId,
      userId,
      accessToken: tokenSet.access_token!,
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token!,
      expiresAt,
      createdAt: result.rows[0].created_at,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshSession(sessionId: string): Promise<OIDCSession | null> {
    if (!this.client) {
      throw new Error('OIDC provider not initialized');
    }

    const session = await this.getSession(sessionId);
    if (!session || !session.refreshToken) {
      return null;
    }

    try {
      const tokenSet = await this.client.refresh(session.refreshToken);

      const expiresIn = tokenSet.expires_in || this.config.sessionDurationMinutes! * 60;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      await this.pool.query(
        `UPDATE oidc_sessions 
         SET access_token = $1,
             refresh_token = $2,
             id_token = $3,
             expires_at = $4
         WHERE id = $5`,
        [
          tokenSet.access_token,
          tokenSet.refresh_token || session.refreshToken,
          tokenSet.id_token,
          expiresAt,
          sessionId
        ]
      );

      return {
        ...session,
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token || session.refreshToken,
        idToken: tokenSet.id_token!,
        expiresAt
      };

    } catch (error) {
      logger.error('Token refresh failed', { sessionId, error });
      return null;
    }
  }

  /**
   * Get session by ID
   */
  private async getSession(sessionId: string): Promise<OIDCSession | null> {
    const result = await this.pool.query(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId",
        access_token as "accessToken", refresh_token as "refreshToken",
        id_token as "idToken", expires_at as "expiresAt",
        created_at as "createdAt", ip_address as "ipAddress",
        user_agent as "userAgent"
       FROM oidc_sessions
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Revoke session (logout)
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE oidc_sessions 
       SET revoked_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    logger.info('OIDC session revoked', { sessionId });
  }

  /**
   * Get end session (logout) URL
   */
  async getLogoutUrl(idToken: string): Promise<string | null> {
    if (!this.issuer?.metadata.end_session_endpoint) {
      return null;
    }

    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: this.config.postLogoutRedirectUri || this.config.redirectUri
    });

    return `${this.issuer.metadata.end_session_endpoint}?${params.toString()}`;
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string): Promise<OIDCSession | null> {
    const result = await this.pool.query(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId",
        access_token as "accessToken", refresh_token as "refreshToken",
        id_token as "idToken", expires_at as "expiresAt",
        created_at as "createdAt", ip_address as "ipAddress",
        user_agent as "userAgent"
       FROM oidc_sessions
       WHERE id = $1 
         AND expires_at > NOW()
         AND revoked_at IS NULL`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Clean up pending authorization requests
   */
  private cleanupPendingRequests(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    for (const [state, request] of this.pendingRequests.entries()) {
      if (request.createdAt < fiveMinutesAgo) {
        this.pendingRequests.delete(state);
      }
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE oidc_sessions 
       SET revoked_at = NOW()
       WHERE expires_at < NOW() 
         AND revoked_at IS NULL
       RETURNING id`
    );

    logger.info('Cleaned up expired OIDC sessions', { count: result.rowCount });
    return result.rowCount || 0;
  }
}
