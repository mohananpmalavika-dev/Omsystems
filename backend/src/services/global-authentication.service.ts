/**
 * Global Authentication Service
 * Provides Single Sign-On (SSO) across all federated servers
 */

import { Pool } from 'pg';
import { randomBytes, createHash } from 'crypto';
import { sign, verify } from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

export interface GlobalUserIdentity {
  id: string;
  tenantId: string;
  globalUserId: string;
  username: string;
  email: string;
  localUserId?: string;
  preferredServerId?: string;
  globalRole: string;
  canAccessAllRegions: boolean;
  accessibleRegions?: string[];
  lastLoginServerId?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GlobalSession {
  id: string;
  tenantId: string;
  globalUserId: string;
  token: string;
  originatingServerId: string;
  validOnServers: string[];
  issuedAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticationResult {
  success: boolean;
  session?: GlobalSession;
  identity?: GlobalUserIdentity;
  token?: string;
  error?: string;
}

export interface TokenPayload {
  globalUserId: string;
  tenantId: string;
  username: string;
  email: string;
  role: string;
  canAccessAllRegions: boolean;
  accessibleRegions?: string[];
  originatingServerId: string;
  validOnServers: string[];
  sessionId: string;
  iat: number;
  exp: number;
}

export class GlobalAuthenticationService {
  private pool: Pool;
  private jwtSecret: string;
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly SESSION_CLEANUP_INTERVAL_MS = 3600000; // 1 hour

  constructor(pool: Pool, jwtSecret?: string) {
    this.pool = pool;
    this.jwtSecret = jwtSecret || process.env.FEDERATION_JWT_SECRET || this.generateSecret();

    // Start session cleanup
    this.startSessionCleanup();
  }

  /**
   * Authenticate user and create global session
   */
  async authenticateUser(
    tenantId: string,
    username: string,
    password: string,
    serverId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuthenticationResult> {
    try {
      // First, verify local credentials
      const localAuth = await this.verifyLocalCredentials(tenantId, username, password);
      
      if (!localAuth.success) {
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Get or create global user identity
      const identity = await this.getOrCreateGlobalIdentity(
        tenantId,
        localAuth.userId!,
        username,
        localAuth.email!,
        localAuth.role!
      );

      // Create global session
      const session = await this.createGlobalSession(
        identity,
        serverId,
        metadata
      );

      // Generate JWT token
      const token = this.generateToken(identity, session);

      // Update last login
      await this.updateLastLogin(identity.id, serverId);

      logger.info('Global authentication successful', {
        globalUserId: identity.globalUserId,
        username: identity.username,
        serverId
      });

      return {
        success: true,
        session,
        identity,
        token
      };

    } catch (error) {
      logger.error('Global authentication failed', {
        username,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const payload = verify(token, this.jwtSecret) as TokenPayload;

      // Check if session is still valid
      const session = await this.getSession(payload.sessionId);
      
      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      return payload;

    } catch (error) {
      logger.debug('Token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Validate token for specific server
   */
  async validateTokenForServer(token: string, serverId: string): Promise<boolean> {
    const payload = await this.verifyToken(token);
    
    if (!payload) {
      return false;
    }

    // Check if token is valid on this server
    return payload.validOnServers.includes(serverId) || payload.validOnServers.includes('*');
  }

  /**
   * Extend token validity to additional servers
   */
  async extendTokenToServers(
    token: string,
    additionalServerIds: string[]
  ): Promise<string | null> {
    const payload = await this.verifyToken(token);
    
    if (!payload) {
      return null;
    }

    // Update session with additional servers
    await this.pool.query(
      `UPDATE global_user_sessions
       SET valid_on_servers = array_cat(valid_on_servers, $1::uuid[]),
           last_used_at = now()
       WHERE id = $2::uuid`,
      [additionalServerIds, payload.sessionId]
    );

    // Generate new token with extended server list
    const session = await this.getSession(payload.sessionId);
    if (!session) {
      return null;
    }

    const identity = await this.getGlobalIdentity(payload.globalUserId);
    if (!identity) {
      return null;
    }

    return this.generateToken(identity, session);
  }

  /**
   * Revoke session (logout)
   */
  async revokeSession(sessionId: string, reason?: string): Promise<boolean> {
    try {
      await this.pool.query(
        `UPDATE global_user_sessions
         SET revoked_at = now(),
             revoked_reason = $2
         WHERE id = $1::uuid`,
        [sessionId, reason || 'User logout']
      );

      logger.info('Session revoked', { sessionId, reason });
      return true;

    } catch (error) {
      logger.error('Failed to revoke session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(globalUserId: string, reason?: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE global_user_sessions
       SET revoked_at = now(),
           revoked_reason = $2
       WHERE global_user_id = $1::uuid
         AND revoked_at IS NULL
       RETURNING id`,
      [globalUserId, reason || 'All sessions revoked']
    );

    logger.info('All user sessions revoked', {
      globalUserId,
      count: result.rowCount
    });

    return result.rowCount || 0;
  }

  /**
   * Get global user identity
   */
  async getGlobalIdentity(globalUserId: string): Promise<GlobalUserIdentity | null> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        username,
        email,
        local_user_id::text as "localUserId",
        preferred_server_id::text as "preferredServerId",
        global_role as "globalRole",
        can_access_all_regions as "canAccessAllRegions",
        accessible_regions as "accessibleRegions",
        last_login_server_id::text as "lastLoginServerId",
        last_login_at as "lastLoginAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM global_user_identities
       WHERE global_user_id = $1::uuid`,
      [globalUserId]
    );

    return result.rows[0] || null;
  }

  /**
   * Sync local user to global identity
   */
  async syncLocalUserToGlobal(
    tenantId: string,
    localUserId: string,
    username: string,
    email: string,
    role: string
  ): Promise<GlobalUserIdentity> {
    return this.getOrCreateGlobalIdentity(tenantId, localUserId, username, email, role);
  }

  /**
   * Get active sessions for user
   */
  async getUserActiveSessions(globalUserId: string): Promise<GlobalSession[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        token_hash,
        originating_server_id::text as "originatingServerId",
        valid_on_servers,
        issued_at as "issuedAt",
        expires_at as "expiresAt",
        last_used_at as "lastUsedAt",
        ip_address as "ipAddress",
        user_agent as "userAgent"
       FROM global_user_sessions
       WHERE global_user_id = $1::uuid
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY last_used_at DESC`,
      [globalUserId]
    );

    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenantId,
      globalUserId: row.globalUserId,
      token: '', // Don't expose actual token
      originatingServerId: row.originatingServerId,
      validOnServers: row.valid_on_servers || [],
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent
    }));
  }

  /**
   * Verify local credentials
   */
  private async verifyLocalCredentials(
    tenantId: string,
    username: string,
    password: string
  ): Promise<{ success: boolean; userId?: string; email?: string; role?: string }> {
    // This should integrate with your existing authentication system
    // For now, placeholder implementation
    const result = await this.pool.query(
      `SELECT 
        id::text,
        email,
        role,
        password_hash,
        status
       FROM users
       WHERE tenant_id = $1::uuid
         AND (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($2))
         AND status = 'active'`,
      [tenantId, username]
    );

    if (result.rows.length === 0) {
      return { success: false };
    }

    const user = result.rows[0];

    // Verify password (you should use proper bcrypt/argon2 verification)
    // This is a placeholder
    const passwordMatch = await this.verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      return { success: false };
    }

    return {
      success: true,
      userId: user.id,
      email: user.email,
      role: user.role
    };
  }

  /**
   * Verify password hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Implement proper password verification
    // This is a placeholder - use bcrypt.compare() or similar
    return true; // Placeholder
  }

  /**
   * Get or create global identity
   */
  private async getOrCreateGlobalIdentity(
    tenantId: string,
    localUserId: string,
    username: string,
    email: string,
    role: string
  ): Promise<GlobalUserIdentity> {
    // Check if global identity exists
    const existing = await this.pool.query(
      `SELECT 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        username,
        email,
        local_user_id::text as "localUserId",
        preferred_server_id::text as "preferredServerId",
        global_role as "globalRole",
        can_access_all_regions as "canAccessAllRegions",
        accessible_regions as "accessibleRegions",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM global_user_identities
       WHERE tenant_id = $1::uuid
         AND local_user_id = $2::uuid`,
      [tenantId, localUserId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new global identity
    const globalUserId = randomBytes(16).toString('hex');

    const result = await this.pool.query(
      `INSERT INTO global_user_identities (
        tenant_id, global_user_id, username, email,
        local_user_id, global_role, can_access_all_regions
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7)
      RETURNING 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        username,
        email,
        local_user_id::text as "localUserId",
        global_role as "globalRole",
        can_access_all_regions as "canAccessAllRegions",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [tenantId, globalUserId, username, email, localUserId, role, false]
    );

    return result.rows[0];
  }

  /**
   * Create global session
   */
  private async createGlobalSession(
    identity: GlobalUserIdentity,
    originatingServerId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<GlobalSession> {
    const sessionId = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

    // Initially valid on originating server and global command center
    const validOnServers = [originatingServerId];

    const result = await this.pool.query(
      `INSERT INTO global_user_sessions (
        id, tenant_id, global_user_id, token_hash,
        originating_server_id, valid_on_servers,
        expires_at, ip_address, user_agent
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid[], $7, $8, $9)
      RETURNING 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        originating_server_id::text as "originatingServerId",
        valid_on_servers,
        issued_at as "issuedAt",
        expires_at as "expiresAt"`,
      [
        sessionId,
        identity.tenantId,
        identity.globalUserId,
        tokenHash,
        originatingServerId,
        validOnServers,
        expiresAt,
        metadata?.ipAddress,
        metadata?.userAgent
      ]
    );

    return {
      ...result.rows[0],
      token,
      validOnServers: result.rows[0].valid_on_servers || [],
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };
  }

  /**
   * Generate JWT token
   */
  private generateToken(identity: GlobalUserIdentity, session: GlobalSession): string {
    const payload: TokenPayload = {
      globalUserId: identity.globalUserId,
      tenantId: identity.tenantId,
      username: identity.username,
      email: identity.email,
      role: identity.globalRole,
      canAccessAllRegions: identity.canAccessAllRegions,
      accessibleRegions: identity.accessibleRegions,
      originatingServerId: session.originatingServerId,
      validOnServers: session.validOnServers,
      sessionId: session.id,
      iat: Math.floor(session.issuedAt.getTime() / 1000),
      exp: Math.floor(session.expiresAt.getTime() / 1000)
    };

    return sign(payload, this.jwtSecret);
  }

  /**
   * Get session by ID
   */
  private async getSession(sessionId: string): Promise<GlobalSession | null> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        tenant_id::text as "tenantId",
        global_user_id::text as "globalUserId",
        originating_server_id::text as "originatingServerId",
        valid_on_servers,
        issued_at as "issuedAt",
        expires_at as "expiresAt",
        ip_address as "ipAddress",
        user_agent as "userAgent"
       FROM global_user_sessions
       WHERE id = $1::uuid
         AND revoked_at IS NULL`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      token: '',
      validOnServers: row.valid_on_servers || []
    };
  }

  /**
   * Update last login
   */
  private async updateLastLogin(identityId: string, serverId: string): Promise<void> {
    await this.pool.query(
      `UPDATE global_user_identities
       SET last_login_server_id = $2::uuid,
           last_login_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      [identityId, serverId]
    );
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate secure secret
   */
  private generateSecret(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Start session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(async () => {
      try {
        const result = await this.pool.query(
          `UPDATE global_user_sessions
           SET revoked_at = now(),
               revoked_reason = 'expired'
           WHERE expires_at < now()
             AND revoked_at IS NULL
           RETURNING id`
        );

        if (result.rowCount && result.rowCount > 0) {
          logger.info('Expired sessions cleaned up', { count: result.rowCount });
        }
      } catch (error) {
        logger.error('Session cleanup failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.SESSION_CLEANUP_INTERVAL_MS);
  }
}

// Singleton instance
let globalAuthService: GlobalAuthenticationService | null = null;

export function getGlobalAuthenticationService(
  pool: Pool,
  jwtSecret?: string
): GlobalAuthenticationService {
  if (!globalAuthService) {
    globalAuthService = new GlobalAuthenticationService(pool, jwtSecret);
  }
  return globalAuthService;
}
