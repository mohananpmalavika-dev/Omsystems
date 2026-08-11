/**
 * Identity Provisioning Service
 * 
 * Handles Just-In-Time (JIT) provisioning of users from external identity providers.
 * 
 * Responsibilities:
 * - Resolve or create local user for external identity
 * - Enforce provisioning policies (allowed domains, JIT mode)
 * - Create tenant memberships
 * - Manage identity links
 * - Sync permitted attributes
 * - Handle provisioning conflicts
 * 
 * This service coordinates between:
 * - IdentityLinkService (external identity → local user mapping)
 * - User creation/management
 * - Tenant membership management
 * - Role assignment (via RoleMappingService)
 */

import type { Pool } from 'pg';
import type {
  VerifiedExternalIdentity,
} from '../domain/verified-external-identity.js';
import type {
  IdentityProvider,
  ProvisioningPolicy,
} from '../domain/identity-provider.js';
import { IdentityLinkService } from './identity-link.service.js';
import type { IdentityLink } from './identity-link.service.js';
import {
  ProvisioningError,
  EnterpriseAuthError,
  AccountStatusError,
} from '../domain/auth-errors.js';

/**
 * Provisioned user result
 */
export interface ProvisionedUser {
  /**
   * User identifier
   */
  userId: string;

  /**
   * Tenant membership identifier
   */
  membershipId: string;

  /**
   * Identity link identifier
   */
  identityLinkId: string;

  /**
   * Whether user was just created
   */
  wasCreated: boolean;

  /**
   * Whether attributes were updated
   */
  wasUpdated: boolean;
}

/**
 * User provisioning input
 */
interface ProvisionUserInput {
  tenantId: string;
  email: string;
  emailVerified: boolean;
  username?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  externalSubject: string;
}

/**
 * Identity Provisioning Service
 */
export class IdentityProvisioningService {
  private identityLinks: IdentityLinkService;

  constructor(private pool: Pool) {
    this.identityLinks = new IdentityLinkService(pool);
  }

  /**
   * Resolve or provision user for external identity
   * 
   * This is the main entry point for JIT provisioning.
   * 
   * Flow:
   * 1. Check if identity link exists → return existing user
   * 2. Check provisioning policy
   * 3. Validate domain (if applicable)
   * 4. Check for existing user by verified email (auto-link)
   * 5. Create new user (if JIT enabled)
   * 6. Create identity link
   * 7. Ensure tenant membership
   * 8. Return provisioned user
   */
  async resolveOrProvision(
    tenantId: string,
    provider: IdentityProvider,
    identity: VerifiedExternalIdentity,
  ): Promise<ProvisionedUser> {
    // Check for existing identity link
    const existingLink = await this.identityLinks.findByExternalIdentity(
      tenantId,
      provider.id,
      identity.subject,
    );

    if (existingLink) {
      // Identity already linked, return existing user
      await this.identityLinks.recordAuthentication(existingLink.id);

      // Optionally sync attributes
      if (provider.provisioning.syncAttributesOnLogin) {
        await this.syncUserAttributes(
          existingLink.userId,
          identity,
          provider.provisioning.syncedAttributes,
        );
      }

      // Ensure membership is active
      const membership = await this.ensureMembership(existingLink.userId, tenantId);

      return {
        userId: existingLink.userId,
        membershipId: membership.id,
        identityLinkId: existingLink.id,
        wasCreated: false,
        wasUpdated: provider.provisioning.syncAttributesOnLogin,
      };
    }

    // No existing link, check provisioning policy
    if (provider.provisioning.mode === 'DISABLED') {
      throw new ProvisioningError(
        'PROVISIONING_DISABLED',
        'JIT provisioning is disabled for this provider',
        { providerId: provider.id }
      );
    }

    if (provider.provisioning.mode === 'PREPROVISIONED_ONLY') {
      // Only allow pre-provisioned users
      // Try to find existing user and create link
      const user = await this.findExistingUserForLinking(tenantId, identity);

      if (!user) {
        throw new ProvisioningError(
          'PROVISIONING_DISABLED',
          'Only pre-provisioned users are allowed. No matching user found.',
          { providerId: provider.id, email: identity.email }
        );
      }

      // Create identity link for pre-provisioned user
      const link = await this.identityLinks.create({
        tenantId,
        providerId: provider.id,
        providerType: provider.configuration.type,
        userId: user.userId,
        externalSubject: identity.subject,
        externalEmail: identity.email,
        externalUsername: identity.username,
      });

      const membership = await this.ensureMembership(user.userId, tenantId);

      return {
        userId: user.userId,
        membershipId: membership.id,
        identityLinkId: link.id,
        wasCreated: false,
        wasUpdated: false,
      };
    }

    // JIT provisioning mode
    return this.provisionNewUser(tenantId, provider, identity);
  }

  /**
   * Provision new user via JIT
   */
  private async provisionNewUser(
    tenantId: string,
    provider: IdentityProvider,
    identity: VerifiedExternalIdentity,
  ): Promise<ProvisionedUser> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Validate email domain
      if (identity.email) {
        this.validateEmailDomain(identity.email, provider.provisioning);
      }

      // Check for conflicts
      const conflicts = await this.identityLinks.detectConflicts(identity, tenantId);

      if (conflicts.subjectConflict) {
        throw new EnterpriseAuthError(
          'IDENTITY_CONFLICT',
          'External identity is already linked to another user',
          { conflictingUserId: conflicts.conflictingUserId }
        );
      }

      // Try auto-linking with existing user (if verified email)
      let userId: string | undefined;
      let wasCreated = false;

      if (identity.email && identity.emailVerified) {
        const existingUser = await this.identityLinks.findUserByVerifiedEmail(
          tenantId,
          identity.email,
        );

        if (existingUser) {
          userId = existingUser.userId;
        }
      }

      // Create new user if no existing user found
      if (!userId) {
        if (!identity.email) {
          throw new ProvisioningError(
            'PROVISIONING_FAILED',
            'Cannot provision user without email address',
          );
        }

        const user = await this.createUser(client, {
          tenantId,
          email: identity.email,
          emailVerified: identity.emailVerified ?? false,
          username: identity.username,
          displayName: identity.displayName,
          givenName: identity.givenName,
          familyName: identity.familyName,
          externalSubject: identity.subject,
        });

        userId = user.userId;
        wasCreated = true;
      }

      // Create identity link
      const linkResult = await client.query(
        `INSERT INTO enterprise_identity_links (
          tenant_id, provider_id, provider_type, user_id,
          external_subject, external_email, external_username,
          authentication_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
        RETURNING id`,
        [
          tenantId,
          provider.id,
          provider.configuration.type,
          userId,
          identity.subject,
          identity.email,
          identity.username,
        ]
      );

      const linkId = linkResult.rows[0].id;

      // Ensure membership
      const membershipResult = await client.query(
        `INSERT INTO tenant_memberships (
          tenant_id, user_id, status, created_at
        ) VALUES ($1, $2, 'ACTIVE', now())
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET updated_at = now()
        RETURNING id`,
        [tenantId, userId]
      );

      const membershipId = membershipResult.rows[0].id;

      await client.query('COMMIT');

      return {
        userId,
        membershipId,
        identityLinkId: linkId,
        wasCreated,
        wasUpdated: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create new user
   */
  private async createUser(
    client: any,
    input: ProvisionUserInput,
  ): Promise<{ userId: string }> {
    // Generate username if not provided
    const username = input.username || this.generateUsername(input.email);

    const result = await client.query(
      `INSERT INTO users (
        tenant_id, email, email_verified, username,
        display_name, given_name, family_name,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', now(), now())
      RETURNING id as "userId"`,
      [
        input.tenantId,
        input.email,
        input.emailVerified,
        username,
        input.displayName || input.email.split('@')[0],
        input.givenName,
        input.familyName,
      ]
    );

    return result.rows[0];
  }

  /**
   * Ensure tenant membership exists and is active
   */
  private async ensureMembership(
    userId: string,
    tenantId: string,
  ): Promise<{ id: string; status: string }> {
    const result = await this.pool.query(
      `INSERT INTO tenant_memberships (
        tenant_id, user_id, status, created_at
      ) VALUES ($1, $2, 'ACTIVE', now())
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET 
        status = CASE 
          WHEN tenant_memberships.status = 'DISABLED' 
          THEN tenant_memberships.status 
          ELSE 'ACTIVE' 
        END,
        updated_at = now()
      RETURNING id, status`,
      [tenantId, userId]
    );

    const membership = result.rows[0];

    if (membership.status !== 'ACTIVE') {
      throw new AccountStatusError(
        'MEMBERSHIP_DISABLED',
        'Tenant membership is not active',
        userId,
        { tenantId, membershipStatus: membership.status }
      );
    }

    return membership;
  }

  /**
   * Sync user attributes from external identity
   */
  private async syncUserAttributes(
    userId: string,
    identity: VerifiedExternalIdentity,
    syncedAttributes: string[],
  ): Promise<boolean> {
    if (syncedAttributes.length === 0) {
      return false;
    }

    // Build dynamic update query based on synced attributes
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const attributeMap: Record<string, any> = {
      'displayName': identity.displayName,
      'givenName': identity.givenName,
      'familyName': identity.familyName,
      'email': identity.email,
    };

    for (const attr of syncedAttributes) {
      if (attributeMap[attr] !== undefined) {
        updates.push(`${this.toSnakeCase(attr)} = $${paramIndex}`);
        values.push(attributeMap[attr]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return false;
    }

    values.push(userId);

    await this.pool.query(
      `UPDATE users
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}`,
      values
    );

    return true;
  }

  /**
   * Validate email domain against provisioning policy
   */
  private validateEmailDomain(email: string, policy: ProvisioningPolicy): void {
    if (policy.allowedDomains.length === 0) {
      // No domain restrictions
      return;
    }

    const domain = email.split('@')[1]?.toLowerCase();

    if (!domain) {
      throw new ProvisioningError(
        'INVALID_EMAIL_DOMAIN',
        'Invalid email address',
      );
    }

    const allowed = policy.allowedDomains.some(
      (allowedDomain) => domain === allowedDomain.toLowerCase()
    );

    if (!allowed) {
      throw new ProvisioningError(
        'DOMAIN_NOT_ALLOWED',
        `Email domain '${domain}' is not allowed for JIT provisioning`,
        {
          domain,
          allowedDomains: policy.allowedDomains,
        }
      );
    }
  }

  /**
   * Find existing user for linking (pre-provisioned mode)
   */
  private async findExistingUserForLinking(
    tenantId: string,
    identity: VerifiedExternalIdentity,
  ): Promise<{ userId: string } | null> {
    if (!identity.email || !identity.emailVerified) {
      return null;
    }

    return this.identityLinks.findUserByVerifiedEmail(tenantId, identity.email);
  }

  /**
   * Generate username from email
   */
  private generateUsername(email: string): string {
    const localPart = email.split('@')[0];
    // Remove special characters and make lowercase
    return localPart.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  }

  /**
   * Convert camelCase to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Deprovision user (remove identity link and optionally disable user)
   */
  async deprovision(
    identityLinkId: string,
    options: {
      disableUser?: boolean;
      disableMembership?: boolean;
      reason?: string;
    } = {},
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get identity link details
      const linkResult = await client.query(
        `SELECT user_id as "userId", tenant_id as "tenantId"
         FROM enterprise_identity_links
         WHERE id = $1`,
        [identityLinkId]
      );

      if (linkResult.rows.length === 0) {
        throw new EnterpriseAuthError(
          'IDENTITY_NOT_FOUND',
          'Identity link not found',
        );
      }

      const { userId, tenantId } = linkResult.rows[0];

      // Delete identity link
      await client.query(
        `DELETE FROM enterprise_identity_links
         WHERE id = $1`,
        [identityLinkId]
      );

      // Optionally disable membership
      if (options.disableMembership) {
        await client.query(
          `UPDATE tenant_memberships
           SET status = 'DISABLED',
               updated_at = now()
           WHERE user_id = $1
             AND tenant_id = $2`,
          [userId, tenantId]
        );
      }

      // Optionally disable user account
      if (options.disableUser) {
        await client.query(
          `UPDATE users
           SET status = 'DISABLED',
               updated_at = now()
           WHERE id = $1`,
          [userId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk deprovision users for a provider
   */
  async deprovisionProvider(
    providerId: string,
    tenantId: string,
    options: {
      disableMemberships?: boolean;
      reason?: string;
    } = {},
  ): Promise<number> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (options.disableMemberships) {
        // Disable all memberships for users linked to this provider
        await client.query(
          `UPDATE tenant_memberships
           SET status = 'DISABLED',
               updated_at = now()
           WHERE (user_id, tenant_id) IN (
             SELECT user_id, tenant_id
             FROM enterprise_identity_links
             WHERE provider_id = $1
               AND tenant_id = $2
           )`,
          [providerId, tenantId]
        );
      }

      // Delete all identity links for provider
      const result = await client.query(
        `DELETE FROM enterprise_identity_links
         WHERE provider_id = $1
           AND tenant_id = $2`,
        [providerId, tenantId]
      );

      await client.query('COMMIT');

      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
