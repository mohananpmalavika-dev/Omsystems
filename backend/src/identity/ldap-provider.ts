/**
 * LDAP / Active Directory Authentication Provider
 * Supports bind authentication, user search, group synchronization
 * Compatible with Active Directory, OpenLDAP, FreeIPA, and 389 Directory Server
 */

import ldap, { Client, SearchOptions, SearchEntry } from 'ldapjs';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface LDAPConfiguration {
  // Server Configuration
  url: string; // ldap://server:389 or ldaps://server:636
  bindDN: string; // Service account DN for searches
  bindPassword: string;
  
  // TLS Configuration
  tlsOptions?: {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
  };
  
  // Search Configuration
  baseDN: string; // e.g., "dc=example,dc=com"
  userSearchBase?: string; // Override base for user searches
  groupSearchBase?: string; // Override base for group searches
  
  // User Search Filter
  userSearchFilter: string; // e.g., "(sAMAccountName={{username}})" or "(uid={{username}})"
  usernameAttribute: string; // e.g., "sAMAccountName" or "uid"
  
  // Attribute Mapping
  attributeMapping: {
    email: string; // e.g., "mail"
    displayName: string; // e.g., "displayName" or "cn"
    firstName?: string; // e.g., "givenName"
    lastName?: string; // e.g., "sn"
    memberOf?: string; // e.g., "memberOf"
  };
  
  // Group Mapping
  groupSearchFilter?: string; // e.g., "(member={{dn}})"
  groupNameAttribute?: string; // e.g., "cn"
  groupDNAttribute?: string; // e.g., "distinguishedName"
  
  // Connection Pooling
  poolSize?: number;
  connectTimeout?: number;
  idleTimeout?: number;
  
  // Session
  sessionDurationMinutes?: number;
}

export interface LDAPUser {
  dn: string;
  username: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  attributes: Record<string, any>;
}

export interface LDAPSession {
  id: string;
  tenantId: string;
  userId: string;
  ldapDN: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class LDAPAuthProvider {
  private config: LDAPConfiguration;
  private pool: Pool;
  private clientPool: Client[] = [];
  private availableClients: Client[] = [];

  constructor(config: LDAPConfiguration, pool: Pool) {
    this.config = {
      ...config,
      poolSize: config.poolSize || 3,
      connectTimeout: config.connectTimeout || 5000,
      idleTimeout: config.idleTimeout || 60000,
      sessionDurationMinutes: config.sessionDurationMinutes || 480 // 8 hours
    };
    this.pool = pool;
  }

  /**
   * Initialize LDAP connection pool
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing LDAP connection pool', {
        url: this.config.url,
        poolSize: this.config.poolSize
      });

      // Create connection pool
      for (let i = 0; i < this.config.poolSize!; i++) {
        const client = await this.createClient();
        this.clientPool.push(client);
        this.availableClients.push(client);
      }

      logger.info('LDAP connection pool initialized', {
        poolSize: this.clientPool.length
      });

    } catch (error) {
      logger.error('Failed to initialize LDAP provider', { error });
      throw new Error('LDAP initialization failed');
    }
  }

  /**
   * Create and bind LDAP client
   */
  private async createClient(): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.url,
        timeout: this.config.connectTimeout,
        connectTimeout: this.config.connectTimeout,
        idleTimeout: this.config.idleTimeout,
        tlsOptions: this.config.tlsOptions
      });

      client.on('error', (err) => {
        logger.error('LDAP client error', { error: err });
      });

      // Bind with service account
      client.bind(this.config.bindDN, this.config.bindPassword, (err) => {
        if (err) {
          logger.error('LDAP bind failed', { error: err });
          return reject(err);
        }
        resolve(client);
      });
    });
  }

  /**
   * Get available client from pool
   */
  private async getClient(): Promise<Client> {
    if (this.availableClients.length > 0) {
      return this.availableClients.pop()!;
    }

    // Wait for available client
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.availableClients.length > 0) {
          clearInterval(checkInterval);
          resolve(this.availableClients.pop()!);
        }
      }, 100);
    });
  }

  /**
   * Return client to pool
   */
  private releaseClient(client: Client): void {
    this.availableClients.push(client);
  }

  /**
   * Authenticate user with LDAP bind
   */
  async authenticate(
    username: string,
    password: string,
    tenantId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<LDAPSession> {
    try {
      // Search for user
      const user = await this.searchUser(username);

      if (!user) {
        throw new Error('User not found in LDAP directory');
      }

      // Authenticate with bind
      await this.bindUser(user.dn, password);

      // Get user groups
      const groups = await this.getUserGroups(user.dn);
      user.groups = groups;

      // Get or create user in database
      const dbUser = await this.getOrCreateUser(tenantId, user);

      // Create session
      const session = await this.createSession(
        tenantId,
        dbUser.id,
        user.dn,
        metadata
      );

      logger.info('LDAP authentication successful', {
        tenantId,
        username,
        dn: user.dn
      });

      return session;

    } catch (error) {
      logger.error('LDAP authentication failed', { username, error });
      throw error;
    }
  }

  /**
   * Search for user in LDAP
   */
  private async searchUser(username: string): Promise<LDAPUser | null> {
    const client = await this.getClient();

    try {
      const searchBase = this.config.userSearchBase || this.config.baseDN;
      const filter = this.config.userSearchFilter.replace('{{username}}', username);

      const searchOptions: SearchOptions = {
        filter,
        scope: 'sub',
        attributes: [
          'dn',
          this.config.usernameAttribute,
          this.config.attributeMapping.email,
          this.config.attributeMapping.displayName,
          this.config.attributeMapping.firstName || '',
          this.config.attributeMapping.lastName || '',
          this.config.attributeMapping.memberOf || ''
        ].filter(Boolean)
      };

      return new Promise((resolve, reject) => {
        client.search(searchBase, searchOptions, (err, res) => {
          if (err) {
            return reject(err);
          }

          let user: LDAPUser | null = null;

          res.on('searchEntry', (entry: SearchEntry) => {
            const attrs = entry.attributes.reduce((acc, attr) => {
              acc[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
              return acc;
            }, {} as Record<string, any>);

            user = {
              dn: entry.objectName || '',
              username: attrs[this.config.usernameAttribute] || username,
              email: attrs[this.config.attributeMapping.email] || '',
              displayName: attrs[this.config.attributeMapping.displayName] || username,
              firstName: this.config.attributeMapping.firstName 
                ? attrs[this.config.attributeMapping.firstName]
                : undefined,
              lastName: this.config.attributeMapping.lastName
                ? attrs[this.config.attributeMapping.lastName]
                : undefined,
              attributes: attrs
            };
          });

          res.on('error', (err) => {
            reject(err);
          });

          res.on('end', () => {
            resolve(user);
          });
        });
      });

    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Bind (authenticate) user with their credentials
   */
  private async bindUser(dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.url,
        timeout: this.config.connectTimeout,
        tlsOptions: this.config.tlsOptions
      });

      client.bind(dn, password, (err) => {
        client.unbind();

        if (err) {
          return reject(new Error('Invalid credentials'));
        }

        resolve();
      });
    });
  }

  /**
   * Get user's group memberships
   */
  private async getUserGroups(userDN: string): Promise<string[]> {
    const client = await this.getClient();

    try {
      // If memberOf attribute is available, use it
      if (this.config.attributeMapping.memberOf) {
        const searchOptions: SearchOptions = {
          filter: `(distinguishedName=${userDN})`,
          scope: 'base',
          attributes: [this.config.attributeMapping.memberOf]
        };

        return new Promise((resolve, reject) => {
          client.search(userDN, searchOptions, (err, res) => {
            if (err) {
              return resolve([]); // Return empty if not found
            }

            let groups: string[] = [];

            res.on('searchEntry', (entry: SearchEntry) => {
              const memberOfAttr = entry.attributes.find(
                attr => attr.type === this.config.attributeMapping.memberOf
              );

              if (memberOfAttr) {
                groups = memberOfAttr.values.map(this.extractGroupName.bind(this));
              }
            });

            res.on('error', () => {
              resolve([]);
            });

            res.on('end', () => {
              resolve(groups);
            });
          });
        });
      }

      // Otherwise, search for groups where user is a member
      if (this.config.groupSearchFilter) {
        const searchBase = this.config.groupSearchBase || this.config.baseDN;
        const filter = this.config.groupSearchFilter.replace('{{dn}}', userDN);

        const searchOptions: SearchOptions = {
          filter,
          scope: 'sub',
          attributes: [this.config.groupNameAttribute || 'cn']
        };

        return new Promise((resolve, reject) => {
          const groups: string[] = [];

          client.search(searchBase, searchOptions, (err, res) => {
            if (err) {
              return resolve([]);
            }

            res.on('searchEntry', (entry: SearchEntry) => {
              const nameAttr = entry.attributes.find(
                attr => attr.type === (this.config.groupNameAttribute || 'cn')
              );

              if (nameAttr && nameAttr.values.length > 0) {
                groups.push(nameAttr.values[0]);
              }
            });

            res.on('error', () => {
              resolve(groups);
            });

            res.on('end', () => {
              resolve(groups);
            });
          });
        });
      }

      return [];

    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Extract group name from DN
   */
  private extractGroupName(groupDN: string): string {
    // Extract CN from DN (e.g., "CN=Admins,OU=Groups,DC=example,DC=com" -> "Admins")
    const match = groupDN.match(/^CN=([^,]+)/i);
    return match ? match[1] : groupDN;
  }

  /**
   * Get or create user from LDAP profile
   */
  private async getOrCreateUser(
    tenantId: string,
    ldapUser: LDAPUser
  ): Promise<{ id: string }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user exists
      let result = await client.query(
        `SELECT id, status FROM users 
         WHERE tenant_id = $1 AND (ldap_dn = $2 OR email = $3)`,
        [tenantId, ldapUser.dn, ldapUser.email]
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
               ldap_dn = $2,
               ldap_attributes = $3,
               last_login_at = NOW()
           WHERE id = $4`,
          [ldapUser.displayName, ldapUser.dn, JSON.stringify(ldapUser.attributes), userId]
        );

      } else {
        // Create new user
        result = await client.query(
          `INSERT INTO users (
            tenant_id, email, display_name, username,
            auth_provider, ldap_dn, ldap_attributes,
            status, role
          ) VALUES ($1, $2, $3, $4, 'ldap', $5, $6, 'active', 'operator')
          RETURNING id`,
          [
            tenantId,
            ldapUser.email,
            ldapUser.displayName,
            ldapUser.username,
            ldapUser.dn,
            JSON.stringify(ldapUser.attributes)
          ]
        );

        userId = result.rows[0].id;

        logger.info('Created new LDAP user', {
          tenantId,
          userId,
          dn: ldapUser.dn
        });
      }

      // Sync group memberships
      if (ldapUser.groups && ldapUser.groups.length > 0) {
        await this.syncGroupMemberships(client, tenantId, userId, ldapUser.groups);
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
   * Sync group memberships from LDAP
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
       WHERE user_id = $1 AND source = 'ldap'`,
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
           VALUES ($1, $2, 'ldap')
           RETURNING id`,
          [tenantId, groupName]
        );
        groupId = result.rows[0].id;
      } else {
        groupId = result.rows[0].id;
      }

      await client.query(
        `INSERT INTO user_group_memberships (user_id, group_id, source)
         VALUES ($1, $2, 'ldap')
         ON CONFLICT (user_id, group_id) DO NOTHING`,
        [userId, groupId]
      );
    }
  }

  /**
   * Create LDAP session
   */
  private async createSession(
    tenantId: string,
    userId: string,
    ldapDN: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<LDAPSession> {
    const sessionDuration = this.config.sessionDurationMinutes!;
    const expiresAt = new Date(Date.now() + sessionDuration * 60 * 1000);

    const result = await this.pool.query(
      `INSERT INTO ldap_sessions (
        tenant_id, user_id, ldap_dn,
        expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at`,
      [
        tenantId,
        userId,
        ldapDN,
        expiresAt,
        metadata?.ipAddress,
        metadata?.userAgent
      ]
    );

    return {
      id: result.rows[0].id,
      tenantId,
      userId,
      ldapDN,
      createdAt: result.rows[0].created_at,
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string): Promise<LDAPSession | null> {
    const result = await this.pool.query(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId",
        ldap_dn as "ldapDN", created_at as "createdAt",
        expires_at as "expiresAt", ip_address as "ipAddress",
        user_agent as "userAgent"
       FROM ldap_sessions
       WHERE id = $1 
         AND expires_at > NOW()
         AND revoked_at IS NULL`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE ldap_sessions 
       SET revoked_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    logger.info('LDAP session revoked', { sessionId });
  }

  /**
   * Test LDAP connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.createClient();
      client.unbind();
      return true;
    } catch (error) {
      logger.error('LDAP connection test failed', { error });
      return false;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE ldap_sessions 
       SET revoked_at = NOW()
       WHERE expires_at < NOW() 
         AND revoked_at IS NULL
       RETURNING id`
    );

    logger.info('Cleaned up expired LDAP sessions', { count: result.rowCount });
    return result.rowCount || 0;
  }

  /**
   * Destroy connection pool
   */
  async destroy(): Promise<void> {
    for (const client of this.clientPool) {
      client.unbind();
      client.destroy();
    }
    this.clientPool = [];
    this.availableClients = [];
  }
}
