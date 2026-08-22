/**
 * LDAP/Active Directory Authentication Connector
 * 
 * Supports:
 * - Active Directory
 * - OpenLDAP
 * - FreeIPA
 * - 389 Directory Server
 * 
 * Features:
 * - LDAP bind authentication
 * - User search with filters
 * - Group membership resolution
 * - Connection pooling
 * - Automatic reconnection
 * - TLS/LDAPS support
 */

import ldap, { Client, SearchOptions, SearchEntry } from 'ldapjs';
import { EventEmitter } from 'events';

export interface LDAPTenantConfig {
  tenantId: string;
  
  // Connection settings
  url: string; // e.g., ldap://dc.example.com:389 or ldaps://dc.example.com:636
  baseDN: string; // e.g., dc=example,dc=com
  
  // Bind credentials (for user search)
  bindDN?: string; // e.g., cn=admin,dc=example,dc=com
  bindPassword?: string;
  
  // Search settings
  userSearchBase?: string; // e.g., ou=users,dc=example,dc=com
  userSearchFilter?: string; // Default: (uid={{username}})
  groupSearchBase?: string; // e.g., ou=groups,dc=example,dc=com
  groupSearchFilter?: string; // Default: (member={{dn}})
  
  // Attribute mapping
  attributeMapping?: {
    userId?: string;      // Default: 'uid'
    email?: string;       // Default: 'mail'
    firstName?: string;   // Default: 'givenName'
    lastName?: string;    // Default: 'sn'
    displayName?: string; // Default: 'displayName'
    memberOf?: string;    // Default: 'memberOf'
  };
  
  // Connection options
  tlsOptions?: {
    rejectUnauthorized?: boolean;
    ca?: string[];
  };
  connectTimeout?: number; // Default: 10000ms
  idleTimeout?: number;    // Default: 300000ms (5 minutes)
  
  // Pool settings
  poolSize?: number; // Default: 5
}

export interface LDAPUserProfile {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  dn: string;
  groups?: string[];
  rawAttributes: Record<string, any>;
}

interface LDAPConnection {
  client: Client;
  inUse: boolean;
  lastUsed: number;
}

export class LDAPConnector extends EventEmitter {
  private configs: Map<string, LDAPTenantConfig> = new Map();
  private connectionPools: Map<string, LDAPConnection[]> = new Map();
  
  constructor() {
    super();
    
    // Clean up idle connections every minute
    setInterval(() => this.cleanupIdleConnections(), 60 * 1000);
  }
  
  /**
   * Register tenant LDAP configuration
   */
  async registerTenant(config: LDAPTenantConfig): Promise<void> {
    this.configs.set(config.tenantId, config);
    this.connectionPools.set(config.tenantId, []);
    
    // Test connection
    try {
      await this.testConnection(config.tenantId);
      console.log(`[LDAP] Registered tenant: ${config.tenantId}`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[LDAP] Failed to register tenant ${config.tenantId}:`, error);
      throw new Error(`LDAP tenant registration failed: ${errorMsg}`);
    }
  }
  
  /**
   * Authenticate user with username and password
   */
  async authenticate(
    tenantId: string,
    username: string,
    password: string
  ): Promise<LDAPUserProfile> {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new Error(`LDAP tenant not configured: ${tenantId}`);
    }
    
    // Step 1: Search for user DN
    const userDN = await this.findUserDN(config, username);
    if (!userDN) {
      throw new Error('User not found');
    }
    
    // Step 2: Bind as user to verify password
    await this.bindAsUser(config, userDN, password);
    
    // Step 3: Fetch user profile
    const profile = await this.getUserProfile(config, userDN);
    
    return profile;
  }
  
  /**
   * Find user DN by username
   */
  private async findUserDN(
    config: LDAPTenantConfig,
    username: string
  ): Promise<string | null> {
    const client = await this.getConnection(config.tenantId);
    
    try {
      // Bind as service account
      if (config.bindDN && config.bindPassword) {
        await this.bindClient(client, config.bindDN, config.bindPassword);
      }
      
      // Search for user
      const searchBase = config.userSearchBase || config.baseDN;
      const searchFilter = (config.userSearchFilter || '(uid={{username}})')
        .replace('{{username}}', this.escapeLDAPFilter(username));
      
      const opts: SearchOptions = {
        scope: 'sub',
        filter: searchFilter,
        attributes: ['dn']
      };
      
      const entries = await this.searchLDAP(client, searchBase, opts);
      
      if (entries.length === 0) {
        return null;
      }
      
      if (entries.length > 1) {
        console.warn(`[LDAP] Multiple users found for username: ${username}`);
      }
      
      return entries[0].dn;
    } finally {
      this.releaseConnection(config.tenantId, client);
    }
  }
  
  /**
   * Bind as user to verify password
   */
  private async bindAsUser(
    config: LDAPTenantConfig,
    userDN: string,
    password: string
  ): Promise<void> {
    // Create temporary client for user bind
    const client = this.createClient(config);
    
    try {
      await this.bindClient(client, userDN, password);
      client.unbind();
    } catch (error: unknown) {
      client.unbind();
      if (error instanceof Error) {
        throw new Error(`Invalid credentials: ${error.message}`);
      }
      throw new Error('Invalid credentials');
    }
  }
  
  /**
   * Get user profile with group membership
   */
  private async getUserProfile(
    config: LDAPTenantConfig,
    userDN: string
  ): Promise<LDAPUserProfile> {
    const client = await this.getConnection(config.tenantId);
    
    try {
      // Bind as service account
      if (config.bindDN && config.bindPassword) {
        await this.bindClient(client, config.bindDN, config.bindPassword);
      }
      
      // Fetch user attributes
      const opts: SearchOptions = {
        scope: 'base',
        attributes: ['*']
      };
      
      const entries = await this.searchLDAP(client, userDN, opts);
      
      if (entries.length === 0) {
        throw new Error('User not found');
      }
      
      const user = entries[0];
      const mapping = config.attributeMapping || {};
      
      // Map attributes
      const profile: LDAPUserProfile = {
        userId: this.getAttribute(user, mapping.userId || 'uid'),
        email: this.getAttribute(user, mapping.email || 'mail'),
        firstName: this.getAttribute(user, mapping.firstName || 'givenName'),
        lastName: this.getAttribute(user, mapping.lastName || 'sn'),
        displayName: this.getAttribute(user, mapping.displayName || 'displayName') ||
                     `${this.getAttribute(user, 'givenName')} ${this.getAttribute(user, 'sn')}`.trim(),
        dn: userDN,
        groups: this.getAttributeArray(user, mapping.memberOf || 'memberOf'),
        rawAttributes: user.attributes
      };
      
      // Fetch additional group memberships if configured
      if (config.groupSearchBase && config.groupSearchFilter) {
        const additionalGroups = await this.findUserGroups(config, userDN, client);
        profile.groups = [...new Set([...(profile.groups || []), ...additionalGroups])];
      }
      
      return profile;
    } finally {
      this.releaseConnection(config.tenantId, client);
    }
  }
  
  /**
   * Find groups user is member of
   */
  private async findUserGroups(
    config: LDAPTenantConfig,
    userDN: string,
    client: Client
  ): Promise<string[]> {
    const searchBase = config.groupSearchBase!;
    const searchFilter = (config.groupSearchFilter || '(member={{dn}})')
      .replace('{{dn}}', this.escapeLDAPFilter(userDN));
    
    const opts: SearchOptions = {
      scope: 'sub',
      filter: searchFilter,
      attributes: ['cn', 'dn']
    };
    
    const entries = await this.searchLDAP(client, searchBase, opts);
    
    return entries.map(entry => this.getAttribute(entry, 'cn') || entry.dn);
  }
  
  /**
   * Test LDAP connection
   */
  async testConnection(tenantId: string): Promise<boolean> {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new Error(`LDAP tenant not configured: ${tenantId}`);
    }
    
    const client = this.createClient(config);
    
    try {
      if (config.bindDN && config.bindPassword) {
        await this.bindClient(client, config.bindDN, config.bindPassword);
      }
      client.unbind();
      return true;
    } catch (error: unknown) {
      client.unbind();
      if (error instanceof Error) {
        throw new Error(`Connection test failed: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Get connection from pool
   */
  private async getConnection(tenantId: string): Promise<Client> {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new Error(`LDAP tenant not configured: ${tenantId}`);
    }
    
    const pool = this.connectionPools.get(tenantId)!;
    const poolSize = config.poolSize || 5;
    
    // Find available connection
    const available = pool.find(conn => !conn.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.client;
    }
    
    // Create new connection if pool not full
    if (pool.length < poolSize) {
      const client = this.createClient(config);
      const conn: LDAPConnection = {
        client,
        inUse: true,
        lastUsed: Date.now()
      };
      pool.push(conn);
      return client;
    }
    
    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection pool timeout'));
      }, config.connectTimeout || 10000);
      
      const checkInterval = setInterval(() => {
        const available = pool.find(conn => !conn.inUse);
        if (available) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          available.inUse = true;
          available.lastUsed = Date.now();
          resolve(available.client);
        }
      }, 100);
    });
  }
  
  /**
   * Release connection back to pool
   */
  private releaseConnection(tenantId: string, client: Client): void {
    const pool = this.connectionPools.get(tenantId);
    if (!pool) return;
    
    const conn = pool.find(c => c.client === client);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
    }
  }
  
  /**
   * Create LDAP client
   */
  private createClient(config: LDAPTenantConfig): Client {
    const options: any = {
      url: config.url,
      connectTimeout: config.connectTimeout || 10000,
      idleTimeout: config.idleTimeout || 300000
    };
    
    if (config.tlsOptions) {
      options.tlsOptions = config.tlsOptions;
    }
    
    const client = ldap.createClient(options);
    
    // Error handling
    client.on('error', (err) => {
      console.error(`[LDAP] Client error for ${config.tenantId}:`, err);
      this.emit('error', { tenantId: config.tenantId, error: err });
    });
    
    return client;
  }
  
  /**
   * Bind client with credentials
   */
  private async bindClient(client: Client, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Search LDAP directory
   */
  private async searchLDAP(
    client: Client,
    base: string,
    opts: SearchOptions
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const entries: any[] = [];
      
      client.search(base, opts, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        res.on('searchEntry', (entry: SearchEntry) => {
          const obj: any = {
            dn: entry.objectName,
            attributes: {}
          };
          
          entry.attributes.forEach((attr) => {
            obj.attributes[attr.type] = attr.values.length === 1 
              ? attr.values[0] 
              : attr.values;
          });
          
          entries.push(obj);
        });
        
        res.on('error', (err) => {
          reject(err);
        });
        
        res.on('end', () => {
          resolve(entries);
        });
      });
    });
  }
  
  /**
   * Get single attribute value
   */
  private getAttribute(entry: any, attrName: string): string {
    const value = entry.attributes[attrName];
    if (!value) return '';
    return Array.isArray(value) ? value[0] : value;
  }
  
  /**
   * Get array attribute values
   */
  private getAttributeArray(entry: any, attrName: string): string[] {
    const value = entry.attributes[attrName];
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
  
  /**
   * Escape LDAP filter special characters
   */
  private escapeLDAPFilter(str: string): string {
    return str
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }
  
  /**
   * Clean up idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    
    for (const [tenantId, pool] of this.connectionPools.entries()) {
      const config = this.configs.get(tenantId);
      if (!config) continue;
      
      const idleTimeout = config.idleTimeout || 300000;
      
      for (let i = pool.length - 1; i >= 0; i--) {
        const conn = pool[i];
        if (conn && !conn.inUse && now - conn.lastUsed > idleTimeout) {
          conn.client?.unbind();
          pool.splice(i, 1);
        }
      }
    }
  }
  
  /**
   * Get tenant configuration
   */
  getTenantConfig(tenantId: string): LDAPTenantConfig | undefined {
    return this.configs.get(tenantId);
  }
  
  /**
   * Remove tenant configuration
   */
  async removeTenant(tenantId: string): Promise<void> {
    const pool = this.connectionPools.get(tenantId);
    if (pool) {
      // Close all connections
      for (const conn of pool) {
        conn.client.unbind();
      }
      this.connectionPools.delete(tenantId);
    }
    
    this.configs.delete(tenantId);
    console.log(`[LDAP] Removed tenant: ${tenantId}`);
  }
  
  /**
   * Get Active Directory configuration example
   */
  static getActiveDirectoryExample(): Partial<LDAPTenantConfig> {
    return {
      url: 'ldap://dc.example.com:389',
      baseDN: 'dc=example,dc=com',
      bindDN: 'cn=service-account,ou=service-accounts,dc=example,dc=com',
      userSearchBase: 'ou=users,dc=example,dc=com',
      userSearchFilter: '(sAMAccountName={{username}})',
      groupSearchBase: 'ou=groups,dc=example,dc=com',
      groupSearchFilter: '(member={{dn}})',
      attributeMapping: {
        userId: 'sAMAccountName',
        email: 'mail',
        firstName: 'givenName',
        lastName: 'sn',
        displayName: 'displayName',
        memberOf: 'memberOf'
      }
    };
  }
  
  /**
   * Get OpenLDAP configuration example
   */
  static getOpenLDAPExample(): Partial<LDAPTenantConfig> {
    return {
      url: 'ldap://ldap.example.com:389',
      baseDN: 'dc=example,dc=com',
      bindDN: 'cn=admin,dc=example,dc=com',
      userSearchBase: 'ou=people,dc=example,dc=com',
      userSearchFilter: '(uid={{username}})',
      groupSearchBase: 'ou=groups,dc=example,dc=com',
      groupSearchFilter: '(memberUid={{username}})',
      attributeMapping: {
        userId: 'uid',
        email: 'mail',
        firstName: 'givenName',
        lastName: 'sn',
        displayName: 'displayName',
        memberOf: 'memberOf'
      }
    };
  }
}

// Singleton instance
export const ldapConnector = new LDAPConnector();
