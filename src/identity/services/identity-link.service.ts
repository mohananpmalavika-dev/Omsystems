/**
 * Identity Link Service
 * 
 * Manages the immutable mapping between external identity provider subjects
 * and local user accounts.
 * 
 * Key principle: External identity is identified by:
 *   (tenantId, providerId, externalSubject)
 * 
 * NOT by email, which can change, be reassigned, or differ between providers.
 */

import type { Pool } from 'pg';
import type { VerifiedExternalIdentity } from '../domain/verified-external-identity.js';
import {
  EnterpriseAuthError,
  ConfigurationError,
} from '../domain/auth-errors.js';

/**
 * External identity link (persisted)
 */
export interface IdentityLink {
  /**
   * Link identifier
   */
  id: string;

  /**
   * Tenant identifier
   */
  tenantId: string;

  /**
   * Identity provider identifier
   */
  providerId: string;

  /**
   * Provider type
   */
  providerType: string;

  /**
   * Local user identifier
   */
  userId: string;

  /**
   * External subject (immutable provider identifier)
   */
  externalSubject: string;

  /**
   * External email at time of linking
   */
  externalEmail?: string;

  /**
   * External username at time of linking
   */
  externalUsername?: string;

  /**
   * When link was created
   */
  createdAt: Date;

  /**
   * When user last authenticated via this link
   */
  lastAuthenticatedAt?: Date;

  /**
   * Number of times authenticated via this link
   */
  authenticationCount: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Identity link creation input
 */
export interface CreateIdentityLinkInput {
  tenantId: string;
  providerId: string;
  providerType: string;
  userId: string;
  externalSubject: string;
  externalEmail?: string;
  externalUsername?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Identity Link Service
 * 
 * Responsibilities:
 * - Find existing identity links
 * - Create new identity links
 * - Prevent duplicate/conflicting links
 * - Track authentication history
 * - Handle identity conflicts
 */
export class IdentityLinkService {
  constructor(private pool: Pool) {}

  /**
   * Find identity link by external identity
   * 
   * This is the primary lookup method for enterprise authentication.
   */
  async findByExternalIdentity(
    tenantId: string,
    providerId: string,
    externalSubject: string,
  ): Promise<IdentityLink | null> {
    const result = await this.pool.query<IdentityLink>(
      `SELECT 
        id, tenant_id as "tenantId", provider_id as "providerId",
        provider_type as "providerType", user_id as "userId",
        external_subject as "externalSubject",
        external_email as "externalEmail",
        external_username as "externalUsername",
        created_at as "createdAt",
        last_authenticated_at as "lastAuthenticatedAt",
        authentication_count as "authenticationCount",
        metadata
      FROM enterprise_identity_links
      WHERE tenant_id = $1
        AND provider_id = $2
        AND external_subject = $3`,
      [tenantId, providerId, externalSubject]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all identity links for a user
   */
  async findByUser(userId: string, tenantId: string): Promise<IdentityLink[]> {
    const result = await this.pool.query<IdentityLink>(
      `SELECT 
        id, tenant_id as "tenantId", provider_id as "providerId",
        provider_type as "providerType", user_id as "userId",
        external_subject as "externalSubject",
        external_email as "externalEmail",
        external_username as "externalUsername",
        created_at as "createdAt",
        last_authenticated_at as "lastAuthenticatedAt",
        authentication_count as "authenticationCount",
        metadata
      FROM enterprise_identity_links
      WHERE user_id = $1
        AND tenant_id = $2
      ORDER BY last_authenticated_at DESC NULLS LAST`,
      [userId, tenantId]
    );

    return result.rows;
  }

  /**
   * Create identity link
   * 
   * Creates an immutable link between external identity and local user.
   * This operation must be idempotent and conflict-safe.
   */
  async create(input: CreateIdentityLinkInput): Promise<IdentityLink> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing link
      const existing = await client.query(
        `SELECT id, user_id as "userId"
         FROM enterprise_identity_links
         WHERE tenant_id = $1
           AND provider_id = $2
           AND external_subject = $3
         FOR UPDATE`,
        [input.tenantId, input.providerId, input.externalSubject]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');

        // Link already exists
        const existingLink = existing.rows[0];

        // Check if it's linked to a different user (conflict)
        if (existingLink.userId !== input.userId) {
          throw new EnterpriseAuthError(
            'IDENTITY_CONFLICT',
            'External identity is already linked to a different user',
            {
              existingUserId: existingLink.userId,
              requestedUserId: input.userId,
              providerId: input.providerId,
              externalSubject: input.externalSubject,
            }
          );
        }

        // Return existing link
        return (await this.findByExternalIdentity(
          input.tenantId,
          input.providerId,
          input.externalSubject
        ))!;
      }

      // Check for conflicting subject (same subject, different provider)
      const subjectConflict = await client.query(
        `SELECT provider_id as "providerId"
         FROM enterprise_identity_links
         WHERE tenant_id = $1
           AND user_id = $2
           AND external_subject = $3
           AND provider_id != $4`,
        [input.tenantId, input.userId, input.externalSubject, input.providerId]
      );

      if (subjectConflict.rows.length > 0) {
        throw new EnterpriseAuthError(
          'IDENTITY_CONFLICT',
          'User already has an identity link with the same external subject from a different provider',
          {
            userId: input.userId,
            providerId: input.providerId,
            conflictingProviderId: subjectConflict.rows[0].providerId,
            externalSubject: input.externalSubject,
          }
        );
      }

      // Create new link
      const result = await client.query<IdentityLink>(
        `INSERT INTO enterprise_identity_links (
          tenant_id, provider_id, provider_type, user_id,
          external_subject, external_email, external_username,
          authentication_count, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
        RETURNING
          id, tenant_id as "tenantId", provider_id as "providerId",
          provider_type as "providerType", user_id as "userId",
          external_subject as "externalSubject",
          external_email as "externalEmail",
          external_username as "externalUsername",
          created_at as "createdAt",
          last_authenticated_at as "lastAuthenticatedAt",
          authentication_count as "authenticationCount",
          metadata`,
        [
          input.tenantId,
          input.providerId,
          input.providerType,
          input.userId,
          input.externalSubject,
          input.externalEmail,
          input.externalUsername,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update authentication tracking
   * 
   * Called after successful authentication to track usage.
   */
  async recordAuthentication(linkId: string): Promise<void> {
    await this.pool.query(
      `UPDATE enterprise_identity_links
       SET last_authenticated_at = now(),
           authentication_count = authentication_count + 1
       WHERE id = $1`,
      [linkId]
    );
  }

  /**
   * Update external identity attributes
   * 
   * Updates mutable attributes (email, username) without changing the link.
   */
  async updateAttributes(
    linkId: string,
    externalEmail?: string,
    externalUsername?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE enterprise_identity_links
       SET external_email = COALESCE($2, external_email),
           external_username = COALESCE($3, external_username)
       WHERE id = $1`,
      [linkId, externalEmail, externalUsername]
    );
  }

  /**
   * Delete identity link
   * 
   * Removes the link between external identity and local user.
   * Should be used carefully as it may prevent future authentication.
   */
  async delete(linkId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM enterprise_identity_links
       WHERE id = $1`,
      [linkId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete all identity links for a user
   */
  async deleteAllForUser(userId: string, tenantId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM enterprise_identity_links
       WHERE user_id = $1
         AND tenant_id = $2`,
      [userId, tenantId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Delete all identity links for a provider
   * 
   * Used when decommissioning an identity provider.
   */
  async deleteAllForProvider(providerId: string, tenantId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM enterprise_identity_links
       WHERE provider_id = $1
         AND tenant_id = $2`,
      [providerId, tenantId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Check for potential identity conflicts
   * 
   * Used during provisioning to detect if an external identity might
   * conflict with existing links or users.
   */
  async detectConflicts(
    identity: VerifiedExternalIdentity,
    tenantId: string,
  ): Promise<{
    subjectConflict: boolean;
    emailConflict: boolean;
    conflictingUserId?: string;
  }> {
    // Check if external subject is already linked
    const subjectCheck = await this.pool.query(
      `SELECT user_id as "userId"
       FROM enterprise_identity_links
       WHERE tenant_id = $1
         AND provider_id = $2
         AND external_subject = $3`,
      [tenantId, identity.providerId, identity.subject]
    );

    if (subjectCheck.rows.length > 0) {
      const conflictingUserId = subjectCheck.rows[0]?.userId;
      return {
        subjectConflict: true,
        emailConflict: false,
        conflictingUserId,
      };
    }

    // Check if email is already used by a different external identity
    if (identity.email && identity.emailVerified) {
      const emailCheck = await this.pool.query(
        `SELECT DISTINCT user_id as "userId"
         FROM enterprise_identity_links
         WHERE tenant_id = $1
           AND LOWER(external_email) = LOWER($2)
           AND provider_id != $3`,
        [tenantId, identity.email, identity.providerId]
      );

      if (emailCheck.rows.length > 0) {
        return {
          subjectConflict: false,
          emailConflict: true,
          conflictingUserId: emailCheck.rows[0].userId,
        };
      }
    }

    return {
      subjectConflict: false,
      emailConflict: false,
    };
  }

  /**
   * Find potential user by verified email
   * 
   * Helper for auto-linking scenarios where email is verified by provider
   * and trusted domain policies allow it.
   * 
   * CRITICAL: Only use this with verified emails from trusted providers.
   */
  async findUserByVerifiedEmail(
    tenantId: string,
    email: string,
  ): Promise<{ userId: string; email: string } | null> {
    if (!email) {
      return null;
    }

    const result = await this.pool.query(
      `SELECT id as "userId", email
       FROM users
       WHERE tenant_id = $1
         AND LOWER(email) = LOWER($2)
         AND status = 'ACTIVE'`,
      [tenantId, email]
    );

    return result.rows[0] || null;
  }

  /**
   * Get identity link statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalLinks: number;
    linksByProvider: Record<string, number>;
    activeLinks: number; // authenticated in last 30 days
    dormantLinks: number; // not authenticated in 90+ days
  }> {
    const [totalResult, providerResult, activeResult, dormantResult] = await Promise.all([
      // Total links
      this.pool.query(
        `SELECT COUNT(*) as count
         FROM enterprise_identity_links
         WHERE tenant_id = $1`,
        [tenantId]
      ),

      // Links by provider
      this.pool.query(
        `SELECT provider_id as "providerId", COUNT(*) as count
         FROM enterprise_identity_links
         WHERE tenant_id = $1
         GROUP BY provider_id`,
        [tenantId]
      ),

      // Active links (last 30 days)
      this.pool.query(
        `SELECT COUNT(*) as count
         FROM enterprise_identity_links
         WHERE tenant_id = $1
           AND last_authenticated_at > now() - interval '30 days'`,
        [tenantId]
      ),

      // Dormant links (90+ days)
      this.pool.query(
        `SELECT COUNT(*) as count
         FROM enterprise_identity_links
         WHERE tenant_id = $1
           AND (
             last_authenticated_at < now() - interval '90 days'
             OR last_authenticated_at IS NULL
           )`,
        [tenantId]
      ),
    ]);

    const linksByProvider: Record<string, number> = {};
    for (const row of providerResult.rows) {
      linksByProvider[row.providerId] = parseInt(row.count, 10);
    }

    return {
      totalLinks: parseInt(totalResult.rows[0].count, 10),
      linksByProvider,
      activeLinks: parseInt(activeResult.rows[0].count, 10),
      dormantLinks: parseInt(dormantResult.rows[0].count, 10),
    };
  }
}
