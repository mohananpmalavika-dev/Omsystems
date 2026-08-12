/**
 * SAML 2.0 Authentication Provider
 * Implements SSO, SLO, metadata parsing, and assertion validation
 * Supports Azure AD, Okta, Auth0, OneLogin, and custom IdPs
 */

import { Strategy as SAMLStrategy, VerifiedCallback, Profile, SamlConfig } from 'passport-saml';
import { XMLParser } from 'fast-xml-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface SAMLConfiguration {
  // Identity Provider Configuration
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  idpMetadataUrl?: string;
  
  // Service Provider Configuration
  spEntityId: string;
  spCallbackUrl: string;
  spSloCallbackUrl?: string;
  spCertificate?: string;
  spPrivateKey?: string;
  
  // Assertion Configuration
  wantAssertionsSigned?: boolean;
  wantResponseSigned?: boolean;
  signatureAlgorithm?: 'sha256' | 'sha512';
  
  // Attribute Mapping
  attributeMapping: {
    email: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
    roles?: string;
  };
  
  // Session Configuration
  sessionDurationMinutes?: number;
  
  // Advanced Options
  clockSkew?: number; // seconds
  validateInResponseTo?: boolean;
  forceAuthn?: boolean;
  passive?: boolean;
  identifierFormat?: string;
}

export interface SAMLUser {
  nameID: string;
  nameIDFormat: string;
  sessionIndex?: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  roles?: string[];
  attributes: Record<string, any>;
}

export interface SAMLSession {
  id: string;
  tenantId: string;
  userId: string;
  nameID: string;
  sessionIndex?: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class SAMLAuthProvider {
  private config: SAMLConfiguration;
  private strategy: SAMLStrategy;
  private pool: Pool;
  private xmlParser: XMLParser;

  constructor(config: SAMLConfiguration, pool: Pool) {
    this.config = config;
    this.pool = pool;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    this.strategy = this.createStrategy();
  }

  /**
   * Create SAML strategy with configuration
   */
  private createStrategy(): SAMLStrategy {
    const samlConfig: SamlConfig = {
      // Identity Provider
      entryPoint: this.config.idpSsoUrl,
      issuer: this.config.spEntityId,
      callbackUrl: this.config.spCallbackUrl,
      logoutUrl: this.config.idpSloUrl,
      logoutCallbackUrl: this.config.spSloCallbackUrl,
      
      // Certificates
      cert: this.config.idpCertificate,
      privateKey: this.config.spPrivateKey,
      decryptionPvk: this.config.spPrivateKey,
      
      // Signature verification
      wantAssertionsSigned: this.config.wantAssertionsSigned ?? true,
      signatureAlgorithm: this.config.signatureAlgorithm ?? 'sha256',
      
      // Identifier format
      identifierFormat: this.config.identifierFormat ?? 
        'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      
      // Validation
      validateInResponseTo: this.config.validateInResponseTo ?? true,
      requestIdExpirationPeriodMs: 300000, // 5 minutes
      
      // Advanced
      forceAuthn: this.config.forceAuthn ?? false,
      passive: this.config.passive ?? false,
      acceptedClockSkewMs: (this.config.clockSkew ?? 0) * 1000,
      
      // Audience validation
      audience: this.config.spEntityId
    };

    return new SAMLStrategy(
      samlConfig,
      async (profile: Profile | null | undefined, done: VerifiedCallback) => {
        try {
          if (!profile) {
            return done(new Error('SAML profile is null'));
          }

          const user = this.extractUserFromProfile(profile);
          return done(null, user as any);
        } catch (error) {
          logger.error('SAML profile verification failed', { error });
          return done(error as Error);
        }
      }
    );
  }

  /**
   * Extract user information from SAML profile
   */
  private extractUserFromProfile(profile: Profile): SAMLUser {
    const attributes = profile.attributes || {};
    const mapping = this.config.attributeMapping;

    // Extract basic fields
    const email = this.extractAttribute(attributes, mapping.email) || profile.email || profile.nameID;
    const displayName = this.extractAttribute(attributes, mapping.displayName) || 
                        profile.displayName || 
                        email;
    const firstName = mapping.firstName ? this.extractAttribute(attributes, mapping.firstName) : undefined;
    const lastName = mapping.lastName ? this.extractAttribute(attributes, mapping.lastName) : undefined;

    // Extract groups and roles
    let groups: string[] = [];
    if (mapping.groups) {
      const groupAttr = this.extractAttribute(attributes, mapping.groups);
      groups = Array.isArray(groupAttr) ? groupAttr : [groupAttr].filter(Boolean);
    }

    let roles: string[] = [];
    if (mapping.roles) {
      const roleAttr = this.extractAttribute(attributes, mapping.roles);
      roles = Array.isArray(roleAttr) ? roleAttr : [roleAttr].filter(Boolean);
    }

    return {
      nameID: profile.nameID || '',
      nameIDFormat: profile.nameIDFormat || this.config.identifierFormat || 'emailAddress',
      sessionIndex: profile.sessionIndex,
      email,
      displayName,
      firstName,
      lastName,
      groups,
      roles,
      attributes
    };
  }

  /**
   * Extract attribute value by name or alias
   */
  private extractAttribute(attributes: any, name: string): any {
    if (!attributes || !name) return undefined;
    
    // Direct match
    if (attributes[name]) return attributes[name];
    
    // Case-insensitive match
    const lowerName = name.toLowerCase();
    const key = Object.keys(attributes).find(k => k.toLowerCase() === lowerName);
    
    return key ? attributes[key] : undefined;
  }

  /**
   * Generate SAML authentication request URL
   */
  async getLoginUrl(relayState?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.strategy.generateServiceProviderMetadata(
          this.config.spCertificate,
          this.config.spCertificate
        );

        const params = new URLSearchParams();
        if (relayState) {
          params.set('RelayState', relayState);
        }

        // Generate login URL
        const url = `${this.config.idpSsoUrl}?${params.toString()}`;
        resolve(url);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Process SAML response and create session
   */
  async processResponse(
    samlResponse: string,
    tenantId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<SAMLSession> {
    return new Promise((resolve, reject) => {
      // Validate SAML response
      this.strategy.authenticate(
        { body: { SAMLResponse: samlResponse } } as any,
        {},
        async (err: any, user?: any) => {
          if (err) {
            logger.error('SAML authentication failed', { error: err });
            return reject(err);
          }

          if (!user) {
            return reject(new Error('No user returned from SAML assertion'));
          }

          try {
            // Get or create user in database
            const dbUser = await this.getOrCreateUser(tenantId, user);

            // Create session
            const session = await this.createSession(
              tenantId,
              dbUser.id,
              user.nameID || '',
              user.sessionIndex,
              metadata
            );

            resolve(session);
          } catch (error) {
            logger.error('Failed to create SAML session', { error });
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Get or create user from SAML profile
   */
  private async getOrCreateUser(tenantId: string, samlUser: SAMLUser): Promise<{ id: string }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user exists
      let result = await client.query(
        `SELECT id, status FROM users 
         WHERE tenant_id = $1 AND email = $2`,
        [tenantId, samlUser.email]
      );

      let userId: string;

      if (result.rows.length > 0) {
        // User exists
        const user = result.rows[0];
        
        if (user.status !== 'active') {
          throw new Error('User account is not active');
        }

        userId = user.id;

        // Update user attributes
        await client.query(
          `UPDATE users 
           SET display_name = $1,
               saml_name_id = $2,
               saml_attributes = $3,
               last_login_at = NOW()
           WHERE id = $4`,
          [samlUser.displayName, samlUser.nameID, JSON.stringify(samlUser.attributes), userId]
        );

      } else {
        // Create new user
        result = await client.query(
          `INSERT INTO users (
            tenant_id, email, display_name, 
            auth_provider, saml_name_id, saml_attributes,
            status, role
          ) VALUES ($1, $2, $3, 'saml', $4, $5, 'active', 'operator')
          RETURNING id`,
          [
            tenantId,
            samlUser.email,
            samlUser.displayName,
            samlUser.nameID,
            JSON.stringify(samlUser.attributes)
          ]
        );

        userId = result.rows[0].id;

        logger.info('Created new SAML user', {
          tenantId,
          userId,
          email: samlUser.email
        });
      }

      // Sync group memberships
      if (samlUser.groups && samlUser.groups.length > 0) {
        await this.syncGroupMemberships(client, tenantId, userId, samlUser.groups);
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
   * Sync group memberships from SAML assertion
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
       WHERE user_id = $1 AND source = 'saml'`,
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
        // Create group
        result = await client.query(
          `INSERT INTO user_groups (tenant_id, name, source)
           VALUES ($1, $2, 'saml')
           RETURNING id`,
          [tenantId, groupName]
        );
        groupId = result.rows[0].id;
      } else {
        groupId = result.rows[0].id;
      }

      // Add membership
      await client.query(
        `INSERT INTO user_group_memberships (user_id, group_id, source)
         VALUES ($1, $2, 'saml')
         ON CONFLICT (user_id, group_id) DO NOTHING`,
        [userId, groupId]
      );
    }
  }

  /**
   * Create SAML session
   */
  private async createSession(
    tenantId: string,
    userId: string,
    nameID: string,
    sessionIndex: string | undefined,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<SAMLSession> {
    const sessionDuration = this.config.sessionDurationMinutes || 480; // 8 hours default
    const expiresAt = new Date(Date.now() + sessionDuration * 60 * 1000);

    const result = await this.pool.query(
      `INSERT INTO saml_sessions (
        tenant_id, user_id, name_id, session_index,
        expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at`,
      [
        tenantId,
        userId,
        nameID,
        sessionIndex,
        expiresAt,
        metadata?.ipAddress,
        metadata?.userAgent
      ]
    );

    return {
      id: result.rows[0].id,
      tenantId,
      userId,
      nameID,
      sessionIndex,
      createdAt: result.rows[0].created_at,
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };
  }

  /**
   * Generate logout request
   */
  async getLogoutUrl(nameID: string, sessionIndex?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.strategy.logout(
        { user: { nameID, nameIDFormat: this.config.identifierFormat, sessionIndex } } as any,
        (err: Error | null, url?: string | null) => {
          if (err) {
            return reject(err);
          }
          resolve(url || '');
        }
      );
    });
  }

  /**
   * Process logout response
   */
  async processLogoutResponse(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE saml_sessions 
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    logger.info('SAML session terminated', { userId });
  }

  /**
   * Fetch and parse IdP metadata
   */
  async fetchIdPMetadata(metadataUrl: string): Promise<Partial<SAMLConfiguration>> {
    try {
      const response = await fetch(metadataUrl);
      const xml = await response.text();
      
      const parsed = this.xmlParser.parse(xml);
      const descriptor = parsed['md:EntityDescriptor'] || parsed.EntityDescriptor;

      if (!descriptor) {
        throw new Error('Invalid SAML metadata XML');
      }

      const ssoDescriptor = descriptor['md:IDPSSODescriptor'] || descriptor.IDPSSODescriptor;
      
      // Extract SSO URL
      const ssoService = Array.isArray(ssoDescriptor['md:SingleSignOnService']) 
        ? ssoDescriptor['md:SingleSignOnService'][0]
        : ssoDescriptor['md:SingleSignOnService'];
      
      const idpSsoUrl = ssoService?.['@_Location'];

      // Extract SLO URL
      const sloService = Array.isArray(ssoDescriptor['md:SingleLogoutService'])
        ? ssoDescriptor['md:SingleLogoutService'][0]
        : ssoDescriptor['md:SingleLogoutService'];
      
      const idpSloUrl = sloService?.['@_Location'];

      // Extract certificate
      const keyDescriptor = Array.isArray(ssoDescriptor['md:KeyDescriptor'])
        ? ssoDescriptor['md:KeyDescriptor'].find((k: any) => k['@_use'] === 'signing')
        : ssoDescriptor['md:KeyDescriptor'];

      const x509Cert = keyDescriptor?.['ds:KeyInfo']?.['ds:X509Data']?.['ds:X509Certificate'] ||
                       keyDescriptor?.KeyInfo?.X509Data?.X509Certificate;

      return {
        idpEntityId: descriptor['@_entityID'],
        idpSsoUrl,
        idpSloUrl,
        idpCertificate: x509Cert
      };

    } catch (error) {
      logger.error('Failed to fetch IdP metadata', { metadataUrl, error });
      throw new Error('Failed to parse SAML metadata');
    }
  }

  /**
   * Generate Service Provider metadata XML
   */
  generateSPMetadata(): string {
    return this.strategy.generateServiceProviderMetadata(
      this.config.spCertificate,
      this.config.spCertificate
    );
  }

  /**
   * Validate SAML session
   */
  async validateSession(sessionId: string): Promise<SAMLSession | null> {
    const result = await this.pool.query(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId",
        name_id as "nameID", session_index as "sessionIndex",
        created_at as "createdAt", expires_at as "expiresAt",
        ip_address as "ipAddress", user_agent as "userAgent"
       FROM saml_sessions
       WHERE id = $1 
         AND expires_at > NOW()
         AND revoked_at IS NULL`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE saml_sessions 
       SET revoked_at = NOW()
       WHERE expires_at < NOW() 
         AND revoked_at IS NULL
       RETURNING id`
    );

    logger.info('Cleaned up expired SAML sessions', { count: result.rowCount });
    return result.rowCount || 0;
  }
}
