/**
 * Session Service
 * 
 * Central service for all session and token management.
 * This is the ONLY place where JWTs and refresh tokens are issued.
 * 
 * Used by:
 * - Password authentication
 * - Enterprise SSO (Azure AD, SAML, LDAP)
 * - API key authentication
 * - Certificate authentication
 * - Any other authentication method
 * 
 * CRITICAL: No route or adapter should generate tokens directly.
 */

import type { Pool } from 'pg';
import { randomBytes, createHash } from 'crypto';
import { sign, verify } from 'jsonwebtoken';
import type {
  AuthenticatedPrincipal,
  AuthenticationSource,
} from '../domain/authenticated-principal.js';
import {
  SessionError,
  ConfigurationError,
} from '../domain/auth-errors.js';

/**
 * Session creation result
 */
export interface CreatedSession {
  /**
   * Session identifier
   */
  sessionId: string;

  /**
   * Short-lived access token (JWT)
   */
  accessToken: string;

  /**
   * Opaque high-entropy refresh token
   */
  refreshToken: string;

  /**
   * Access token expiry (seconds from now)
   */
  expiresIn: number;

  /**
   * Token type (always 'Bearer')
   */
  tokenType: 'Bearer';

  /**
   * When access token expires
   */
  accessTokenExpiresAt: Date;

  /**
   * When refresh token expires
   */
  refreshTokenExpiresAt: Date;
}

/**
 * Access token payload (JWT claims)
 */
export interface AccessTokenPayload {
  /**
   * Subject (user ID)
   */
  sub: string;

  /**
   * Session ID
   */
  sid: string;

  /**
   * Tenant ID
   */
  tid: string;

  /**
   * Issued at (Unix timestamp)
   */
  iat: number;

  /**
   * Expiration (Unix timestamp)
   */
  exp: number;

  /**
   * Issuer
   */
  iss: string;

  /**
   * Audience
   */
  aud: string;

  /**
   * Token ID (for revocation tracking)
   */
  jti?: string;
}

/**
 * Session context (metadata for session creation)
 */
export interface SessionContext {
  /**
   * IP address of client
   */
  ipAddress?: string;

  /**
   * User agent string
   */
  userAgent?: string;

  /**
   * Device identifier
   */
  deviceId?: string;

  /**
   * Geographic location
   */
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

/**
 * Persisted session record
 */
interface SessionRecord {
  id: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  refreshTokenHash: string;
  authenticationMethod: AuthenticationSource;
  providerId?: string;
  mfa: boolean;
  authenticatedAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  location?: any;
}

/**
 * Session service configuration
 */
export interface SessionServiceConfig {
  /**
   * JWT signing secret
   */
  jwtSecret: string;

  /**
   * Access token lifetime (seconds)
   * Default: 900 (15 minutes)
   */
  accessTokenLifetime?: number;

  /**
   * Refresh token lifetime (seconds)
   * Default: 2592000 (30 days)
   */
  refreshTokenLifetime?: number;

  /**
   * JWT issuer
   */
  issuer?: string;

  /**
   * JWT audience
   */
  audience?: string;

  /**
   * Enable refresh token rotation
   * Default: true
   */
  refreshTokenRotation?: boolean;

  /**
   * Maximum concurrent sessions per user
   * Default: unlimited
   */
  maxConcurrentSessions?: number;
}

/**
 * Centralized Session Service
 * 
 * Responsibilities:
 * - Session creation
 * - Access token (JWT) issuance
 * - Refresh token generation and rotation
 * - Session validation
 * - Session revocation
 * - Session cleanup
 */
export class SessionService {
  private pool: Pool;
  private config: Required<SessionServiceConfig>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(pool: Pool, config: SessionServiceConfig) {
    this.pool = pool;

    // Validate required configuration
    if (!config.jwtSecret || config.jwtSecret.length < 32) {
      throw new ConfigurationError(
        'JWT secret must be at least 32 characters long'
      );
    }

    // Set defaults
    this.config = {
      jwtSecret: config.jwtSecret,
      accessTokenLifetime: config.accessTokenLifetime || 900, // 15 minutes
      refreshTokenLifetime: config.refreshTokenLifetime || 2592000, // 30 days
      issuer: config.issuer || process.env.JWT_ISSUER || 'sentinel-grid',
      audience: config.audience || process.env.JWT_AUDIENCE || 'sentinel-grid-api',
      refreshTokenRotation: config.refreshTokenRotation ?? true,
      maxConcurrentSessions: config.maxConcurrentSessions || 0, // 0 = unlimited
    };

    // Start cleanup task
    this.startCleanupTask();
  }

  /**
   * Create a new session for an authenticated principal
   * 
   * This is the canonical entry point for session creation after
   * successful authentication (password, SSO, etc.)
   */
  async create(
    principal: AuthenticatedPrincipal,
    context: SessionContext = {},
  ): Promise<CreatedSession> {
    // Check session limits
    if (this.config.maxConcurrentSessions > 0) {
      await this.enforceSessionLimit(principal.userId, this.config.maxConcurrentSessions);
    }

    // Generate session ID and tokens
    const sessionId = this.generateId();
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);

    // Calculate expiry times
    const now = new Date();
    const accessTokenExpiresAt = new Date(
      now.getTime() + this.config.accessTokenLifetime * 1000
    );
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.config.refreshTokenLifetime * 1000
    );

    // Persist session
    await this.pool.query(
      `INSERT INTO auth_sessions (
        id, user_id, tenant_id, membership_id,
        refresh_token_hash, authentication_method, provider_id,
        mfa, authenticated_at, created_at, last_used_at, expires_at,
        ip_address, user_agent, device_id, location
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )`,
      [
        sessionId,
        principal.userId,
        principal.tenantId,
        principal.membershipId,
        refreshTokenHash,
        principal.authentication.source,
        principal.authentication.providerId,
        principal.authentication.mfa,
        principal.authentication.authenticatedAt,
        now,
        now,
        refreshTokenExpiresAt,
        context.ipAddress,
        context.userAgent,
        context.deviceId,
        context.location ? JSON.stringify(context.location) : null,
      ]
    );

    // Generate access token
    const accessToken = this.signAccessToken(principal, sessionId, accessTokenExpiresAt);

    return {
      sessionId,
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenLifetime,
      tokenType: 'Bearer',
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Refresh an existing session using refresh token
   * 
   * Implements refresh token rotation for enhanced security.
   */
  async refresh(
    refreshToken: string,
    principal: AuthenticatedPrincipal,
    context: SessionContext = {},
  ): Promise<CreatedSession> {
    // Hash provided token
    const tokenHash = this.hashToken(refreshToken);

    // Find active session with this refresh token
    const result = await this.pool.query<SessionRecord>(
      `SELECT 
        id, user_id as "userId", tenant_id as "tenantId",
        membership_id as "membershipId", refresh_token_hash as "refreshTokenHash",
        authentication_method as "authenticationMethod", provider_id as "providerId",
        mfa, authenticated_at as "authenticatedAt",
        created_at as "createdAt", last_used_at as "lastUsedAt",
        expires_at as "expiresAt", revoked_at as "revokedAt",
        revoked_reason as "revokedReason"
      FROM auth_sessions
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new SessionError(
        'REFRESH_TOKEN_INVALID',
        'Invalid refresh token'
      );
    }

    const session = result.rows[0];

    // Check expiration
    if (session.expiresAt < new Date()) {
      throw new SessionError(
        'REFRESH_TOKEN_EXPIRED',
        'Refresh token has expired',
        session.id
      );
    }

    // Verify session belongs to principal
    if (session.userId !== principal.userId || session.tenantId !== principal.tenantId) {
      throw new SessionError(
        'REFRESH_TOKEN_INVALID',
        'Refresh token does not match principal',
        session.id
      );
    }

    // Check if principal is still active
    if (principal.userStatus !== 'ACTIVE' || principal.membershipStatus !== 'ACTIVE') {
      await this.revoke(session.id, 'Principal no longer active');
      throw new SessionError(
        'SESSION_REVOKED',
        'Session revoked due to account status',
        session.id
      );
    }

    // Refresh token rotation: generate new refresh token
    let newRefreshToken = refreshToken;
    let newRefreshTokenHash = tokenHash;

    if (this.config.refreshTokenRotation) {
      newRefreshToken = this.generateRefreshToken();
      newRefreshTokenHash = this.hashToken(newRefreshToken);

      await this.pool.query(
        `UPDATE auth_sessions
         SET refresh_token_hash = $1,
             last_used_at = $2
         WHERE id = $3`,
        [newRefreshTokenHash, new Date(), session.id]
      );
    } else {
      // Just update last used time
      await this.pool.query(
        `UPDATE auth_sessions
         SET last_used_at = $1
         WHERE id = $2`,
        [new Date(), session.id]
      );
    }

    // Generate new access token
    const accessTokenExpiresAt = new Date(
      Date.now() + this.config.accessTokenLifetime * 1000
    );
    const accessToken = this.signAccessToken(principal, session.id, accessTokenExpiresAt);

    return {
      sessionId: session.id,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.config.accessTokenLifetime,
      tokenType: 'Bearer',
      accessTokenExpiresAt,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = verify(token, this.config.jwtSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as AccessTokenPayload;

      // Check if session is still valid
      const session = await this.getSession(payload.sid);

      if (!session || session.revokedAt) {
        return null;
      }

      return payload;
    } catch (error) {
      // Token verification failed (expired, invalid signature, etc.)
      return null;
    }
  }

  /**
   * Revoke a session (logout)
   */
  async revoke(sessionId: string, reason: string = 'User logout'): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = $1,
           revoked_reason = $2
       WHERE id = $3
         AND revoked_at IS NULL`,
      [new Date(), reason, sessionId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = $1,
           revoked_reason = $2
       WHERE user_id = $3
         AND revoked_at IS NULL`,
      [new Date(), reason, userId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Revoke all sessions for a tenant membership
   */
  async revokeAllForMembership(membershipId: string, reason: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = $1,
           revoked_reason = $2
       WHERE membership_id = $3
         AND revoked_at IS NULL`,
      [new Date(), reason, membershipId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Revoke all sessions authenticated via specific provider
   */
  async revokeAllForProvider(providerId: string, reason: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = $1,
           revoked_reason = $2
       WHERE provider_id = $3
         AND revoked_at IS NULL`,
      [new Date(), reason, providerId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionRecord[]> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT 
        id, user_id as "userId", tenant_id as "tenantId",
        membership_id as "membershipId",
        authentication_method as "authenticationMethod",
        provider_id as "providerId", mfa,
        authenticated_at as "authenticatedAt",
        created_at as "createdAt", last_used_at as "lastUsedAt",
        expires_at as "expiresAt",
        ip_address as "ipAddress", user_agent as "userAgent",
        device_id as "deviceId"
      FROM auth_sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > $2
      ORDER BY last_used_at DESC`,
      [userId, new Date()]
    );

    return result.rows;
  }

  /**
   * Get a specific session
   */
  private async getSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT 
        id, user_id as "userId", tenant_id as "tenantId",
        membership_id as "membershipId", refresh_token_hash as "refreshTokenHash",
        authentication_method as "authenticationMethod", provider_id as "providerId",
        mfa, authenticated_at as "authenticatedAt",
        created_at as "createdAt", last_used_at as "lastUsedAt",
        expires_at as "expiresAt", revoked_at as "revokedAt",
        revoked_reason as "revokedReason"
      FROM auth_sessions
      WHERE id = $1`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Sign access token (JWT)
   */
  private signAccessToken(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    expiresAt: Date,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);

    const payload: AccessTokenPayload = {
      sub: principal.userId,
      sid: sessionId,
      tid: principal.tenantId,
      iat: now,
      exp,
      iss: this.config.issuer,
      aud: this.config.audience,
    };

    return sign(payload, this.config.jwtSecret, {
      algorithm: 'HS256',
    });
  }

  /**
   * Generate cryptographically secure refresh token
   */
  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate session ID
   */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Enforce maximum concurrent session limit
   */
  private async enforceSessionLimit(userId: string, maxSessions: number): Promise<void> {
    // Get active session count
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM auth_sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > $2`,
      [userId, new Date()]
    );

    const currentCount = parseInt(result.rows[0].count, 10);

    if (currentCount >= maxSessions) {
      // Revoke oldest sessions to make room
      const sessionsToRevoke = currentCount - maxSessions + 1;

      await this.pool.query(
        `UPDATE auth_sessions
         SET revoked_at = $1,
             revoked_reason = 'Session limit exceeded'
         WHERE id IN (
           SELECT id
           FROM auth_sessions
           WHERE user_id = $2
             AND revoked_at IS NULL
             AND expires_at > $3
           ORDER BY last_used_at ASC
           LIMIT $4
         )`,
        [new Date(), userId, new Date(), sessionsToRevoke]
      );
    }
  }

  /**
   * Start background cleanup task
   */
  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        const result = await this.pool.query(
          `DELETE FROM auth_sessions
           WHERE expires_at < $1
             OR (revoked_at IS NOT NULL AND revoked_at < $2)`,
          [
            new Date(),
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Keep revoked sessions for 30 days
          ]
        );

        if (result.rowCount && result.rowCount > 0) {
          console.log(`[SessionService] Cleaned up ${result.rowCount} expired sessions`);
        }
      } catch (error) {
        console.error('[SessionService] Cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Stop cleanup task (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
