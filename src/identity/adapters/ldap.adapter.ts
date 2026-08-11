/**
 * LDAP Identity Adapter
 * 
 * Handles authentication via LDAP/Active Directory.
 * 
 * Key responsibilities:
 * - Service account bind
 * - User DN search with escaped filters
 * - User credential bind (actual authentication)
 * - Group membership retrieval
 * - TLS validation
 * 
 * Does NOT:
 * - Create local users
 * - Assign roles
 * - Generate application tokens
 */

import type {
  EnterpriseIdentityAdapter,
  EnterpriseAuthenticationInput,
  LDAPCredentialsInput,
} from './identity-adapter.js';
import type {
  VerifiedExternalIdentity,
} from '../domain/verified-external-identity.js';
import type {
  IdentityProvider,
  LDAPProviderConfiguration,
  IdentityProviderCapabilities,
  IdentityProviderHealth,
  ProviderReadiness,
} from '../domain/identity-provider.js';
import {
  InvalidCredentialsError,
  LDAPError,
  ConfigurationError,
  IdentityProviderError,
} from '../domain/auth-errors.js';

// Using ldapts (TypeScript LDAP client)
// Install: npm install ldapts
import { Client, Attribute, Change, SearchEntry } from 'ldapts';

/**
 * LDAP search result entry
 */
interface LDAPUser {
  dn: string;
  attributes: {
    [key: string]: string | string[];
  };
}

/**
 * LDAP Adapter
 */
export class LDAPIdentityAdapter implements EnterpriseIdentityAdapter {
  readonly type = 'LDAP' as const;

  /**
   * Authenticate via LDAP
   */
  async authenticate(input: EnterpriseAuthenticationInput): Promise<VerifiedExternalIdentity> {
    const config = this.getConfiguration(input.provider);
    const credentials = input.request as LDAPCredentialsInput;

    // Validate TLS requirement in production
    this.validateTLSRequirement(config);

    // 1. Bind with service account
    const serviceClient = await this.bindServiceAccount(config);

    try {
      // 2. Search for user by username
      const user = await this.searchUser(serviceClient, config, credentials.username);

      if (!user) {
        throw new LDAPError(
          'LDAP_USER_NOT_FOUND',
          `User not found: ${credentials.username}`,
          { username: credentials.username }
        );
      }

      // 3. Verify user credentials by binding as the user
      await this.verifyUserCredentials(config, user.dn, credentials.password);

      // 4. Retrieve groups
      const groups = await this.retrieveGroups(serviceClient, config, user);

      // 5. Normalize to VerifiedExternalIdentity
      return this.normalizeIdentity(input.provider.id, config, user, groups);

    } finally {
      // Always unbind service client
      await serviceClient.unbind().catch(() => {});
    }
  }

  /**
   * Bind with service account
   */
  private async bindServiceAccount(config: LDAPProviderConfiguration): Promise<Client> {
    const client = new Client({
      url: config.url,
      timeout: config.connectTimeoutMs,
      connectTimeout: config.connectTimeoutMs,
      tlsOptions: {
        rejectUnauthorized: config.verifyCertificate,
      },
    });

    try {
      // Retrieve service account password
      const bindPassword = await this.getBindPassword(config.bindSecretRef);

      await client.bind(config.bindDn, bindPassword);

      return client;
    } catch (error) {
      await client.unbind().catch(() => {});

      if (error instanceof Error && error.message.includes('Invalid Credentials')) {
        throw new LDAPError(
          'LDAP_BIND_FAILED',
          'Service account bind failed: Invalid credentials',
          { bindDn: config.bindDn }
        );
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        throw new LDAPError(
          'LDAP_TIMEOUT',
          'LDAP connection timeout',
          { url: config.url, timeout: config.connectTimeoutMs }
        );
      }

      if (error instanceof Error && error.message.includes('certificate')) {
        throw new LDAPError(
          'LDAP_TLS_ERROR',
          'TLS certificate validation failed',
          { url: config.url }
        );
      }

      throw new LDAPError(
        'LDAP_CONNECTION_FAILED',
        `LDAP connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { url: config.url }
      );
    }
  }

  /**
   * Search for user by username
   */
  private async searchUser(
    client: Client,
    config: LDAPProviderConfiguration,
    username: string,
  ): Promise<LDAPUser | null> {
    // Escape username for LDAP filter (prevent LDAP injection)
    const escapedUsername = this.escapeLDAPFilter(username);

    // Build search filter from template
    const filter = config.userFilter.replace('{username}', escapedUsername);

    // Search base (defaults to baseDn)
    const searchBase = config.userSearchBase || config.baseDn;

    try {
      const { searchEntries } = await client.search(searchBase, {
        scope: 'sub',
        filter,
        timeLimit: Math.floor(config.operationTimeoutMs / 1000),
        sizeLimit: 2, // We only need one result, but allow 2 to detect ambiguity
        attributes: this.getRequiredAttributes(config),
      });

      if (searchEntries.length === 0) {
        return null;
      }

      if (searchEntries.length > 1) {
        throw new LDAPError(
          'LDAP_AMBIGUOUS_RESULT',
          `Multiple users found for username: ${username}`,
          {
            username,
            count: searchEntries.length,
            filter,
          }
        );
      }

      const entry = searchEntries[0] as SearchEntry;

      // Convert attributes to simple object
      const attributes: { [key: string]: string | string[] } = {};
      
      for (const [key, values] of Object.entries(entry)) {
        if (key === 'dn') continue;
        
        if (Array.isArray(values)) {
          attributes[key] = values.length === 1 ? values[0] : values;
        } else {
          attributes[key] = values;
        }
      }

      return {
        dn: entry.dn,
        attributes,
      };

    } catch (error) {
      if (error instanceof LDAPError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        throw new LDAPError(
          'LDAP_TIMEOUT',
          'LDAP search timeout',
          { searchBase, filter, timeout: config.operationTimeoutMs }
        );
      }

      throw new LDAPError(
        'LDAP_SEARCH_FAILED',
        `LDAP search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { searchBase, filter }
      );
    }
  }

  /**
   * Verify user credentials by binding as the user
   * 
   * CRITICAL: This is the actual authentication step.
   * Finding a user in LDAP is NOT authentication.
   */
  private async verifyUserCredentials(
    config: LDAPProviderConfiguration,
    userDn: string,
    password: string,
  ): Promise<void> {
    const client = new Client({
      url: config.url,
      timeout: config.connectTimeoutMs,
      connectTimeout: config.connectTimeoutMs,
      tlsOptions: {
        rejectUnauthorized: config.verifyCertificate,
      },
    });

    try {
      // Attempt to bind as the user
      await client.bind(userDn, password);
      
      // If bind succeeds, credentials are valid
      await client.unbind();

    } catch (error) {
      await client.unbind().catch(() => {});

      if (error instanceof Error && error.message.includes('Invalid Credentials')) {
        throw new InvalidCredentialsError(
          'Invalid LDAP credentials',
          { userDn }
        );
      }

      throw new LDAPError(
        'LDAP_BIND_FAILED',
        `User bind failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { userDn }
      );
    }
  }

  /**
   * Retrieve groups for user
   */
  private async retrieveGroups(
    client: Client,
    config: LDAPProviderConfiguration,
    user: LDAPUser,
  ): Promise<string[]> {
    if (!config.groupBaseDn || !config.groupFilter) {
      // No group configuration, check memberOf attribute
      const memberOf = user.attributes['memberOf'] || user.attributes['memberof'];
      
      if (memberOf) {
        return Array.isArray(memberOf) ? memberOf : [memberOf];
      }

      return [];
    }

    // Escape user DN for LDAP filter
    const escapedUserDn = this.escapeLDAPDN(user.dn);

    // Build group search filter
    const filter = config.groupFilter.replace('{userDn}', escapedUserDn);

    try {
      const { searchEntries } = await client.search(config.groupBaseDn, {
        scope: 'sub',
        filter,
        timeLimit: Math.floor(config.operationTimeoutMs / 1000),
        attributes: ['cn', 'dn'],
      });

      // Return group DNs or CNs
      return searchEntries.map(entry => {
        const e = entry as SearchEntry;
        return e.cn ? (Array.isArray(e.cn) ? e.cn[0] : e.cn) : e.dn;
      });

    } catch (error) {
      // Group retrieval failure is not fatal
      console.warn('LDAP group retrieval failed:', error);
      return [];
    }
  }

  /**
   * Normalize LDAP user to VerifiedExternalIdentity
   */
  private normalizeIdentity(
    providerId: string,
    config: LDAPProviderConfiguration,
    user: LDAPUser,
    groups: string[],
  ): VerifiedExternalIdentity {
    // Get attribute mappings
    const mappings = config.attributeMappings;

    // Get immutable user identifier
    // Prefer entryUUID or objectGUID over DN (which can change)
    const subject = this.getImmutableSubject(user);

    // Map attributes
    const email = this.getAttribute(user, mappings.email || 'mail');
    const username = this.getAttribute(user, mappings.username || 'uid');
    const displayName = this.getAttribute(user, mappings.displayName || 'displayName');
    const givenName = this.getAttribute(user, mappings.givenName || 'givenName');
    const familyName = this.getAttribute(user, mappings.familyName || 'sn');

    return {
      providerId,
      providerType: 'LDAP',
      subject,
      email,
      emailVerified: false, // LDAP doesn't verify emails
      username: username || email,
      displayName: displayName || username || email,
      givenName,
      familyName,
      groups,
      claims: user.attributes as Record<string, unknown>,
      authenticatedAt: new Date(),
      assurance: {
        mfa: false, // LDAP bind doesn't provide MFA information
        phishingResistant: false,
      },
    };
  }

  /**
   * Get immutable subject identifier
   */
  private getImmutableSubject(user: LDAPUser): string {
    // Try immutable identifiers first
    const entryUUID = this.getAttribute(user, 'entryUUID');
    if (entryUUID) return entryUUID;

    const objectGUID = this.getAttribute(user, 'objectGUID');
    if (objectGUID) return objectGUID;

    // Fall back to DN (mutable but better than nothing)
    return user.dn;
  }

  /**
   * Get attribute value from user
   */
  private getAttribute(user: LDAPUser, attributeName: string): string | undefined {
    const value = user.attributes[attributeName] || user.attributes[attributeName.toLowerCase()];
    
    if (!value) return undefined;
    
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Get required LDAP attributes based on configuration
   */
  private getRequiredAttributes(config: LDAPProviderConfiguration): string[] {
    const attributes = new Set<string>([
      'entryUUID',
      'objectGUID',
      'memberOf',
      'mail',
      'uid',
      'sAMAccountName',
      'displayName',
      'cn',
      'givenName',
      'sn',
    ]);

    // Add configured attribute mappings
    if (config.attributeMappings) {
      Object.values(config.attributeMappings).forEach(attr => attributes.add(attr));
    }

    return Array.from(attributes);
  }

  /**
   * Escape LDAP filter special characters
   * 
   * CRITICAL: Prevents LDAP injection attacks
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
   * Escape LDAP DN special characters
   */
  private escapeLDAPDN(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/\+/g, '\\+')
      .replace(/"/g, '\\"')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/;/g, '\\;')
      .replace(/=/g, '\\=');
  }

  /**
   * Validate TLS requirement in production
   */
  private validateTLSRequirement(config: LDAPProviderConfiguration): void {
    if (process.env.NODE_ENV === 'production' && config.tlsRequired) {
      if (!config.url.startsWith('ldaps://')) {
        throw new ConfigurationError(
          'LDAP TLS is required in production but URL does not use ldaps://',
          { url: config.url }
        );
      }
    }
  }

  /**
   * Get bind password from secret store
   */
  private async getBindPassword(secretRef: string): Promise<string> {
    // TODO: Integrate with secret management service
    // For now, assume secretRef is the actual secret (INSECURE - for development only)
    return secretRef;
  }

  /**
   * Check adapter readiness
   */
  checkReadiness(provider: IdentityProvider): ProviderReadiness {
    const config = this.getConfiguration(provider);
    const errors: string[] = [];

    if (!config.url) {
      errors.push('LDAP URL is required');
    }

    if (!config.url.startsWith('ldap://') && !config.url.startsWith('ldaps://')) {
      errors.push('LDAP URL must start with ldap:// or ldaps://');
    }

    if (!config.bindDn) {
      errors.push('Service account bind DN is required');
    }

    if (!config.bindSecretRef) {
      errors.push('Service account password reference is required');
    }

    if (!config.baseDn) {
      errors.push('Base DN is required');
    }

    if (!config.userFilter) {
      errors.push('User search filter is required');
    }

    if (!config.userFilter.includes('{username}')) {
      errors.push('User filter must contain {username} placeholder');
    }

    if (process.env.NODE_ENV === 'production') {
      if (config.tlsRequired && !config.url.startsWith('ldaps://')) {
        errors.push('LDAP TLS is required in production');
      }

      if (!config.verifyCertificate && config.url.startsWith('ldaps://')) {
        errors.push('TLS certificate verification should be enabled in production');
      }
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

    // Check LDAP connectivity
    try {
      const client = new Client({
        url: config.url,
        timeout: 5000,
        connectTimeout: 5000,
        tlsOptions: {
          rejectUnauthorized: config.verifyCertificate,
        },
      });

      try {
        const bindPassword = await this.getBindPassword(config.bindSecretRef);
        await client.bind(config.bindDn, bindPassword);
        await client.unbind();

        checks.push({
          name: 'LDAP Connection',
          status: 'PASS',
          message: 'Successfully connected and authenticated',
          timestamp: new Date(),
        });
      } catch (error) {
        checks.push({
          name: 'LDAP Connection',
          status: 'FAIL',
          message: error instanceof Error ? error.message : 'Connection failed',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      checks.push({
        name: 'LDAP Connection',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    }

    const allHealthy = checks.every(c => c.status === 'PASS');

    return {
      providerId: provider.id,
      status: allHealthy ? 'HEALTHY' : 'UNAVAILABLE',
      lastHealthCheck: new Date(),
      checks,
    };
  }

  /**
   * Get adapter capabilities
   */
  getCapabilities(): IdentityProviderCapabilities {
    return {
      interactiveLogin: false, // LDAP requires username/password input
      passwordAuthentication: true,
      groupClaims: true,
      mfaAssurance: false, // LDAP bind doesn't provide MFA information
      logout: false, // LDAP doesn't have logout
      directorySync: false, // Not implemented yet
      jitProvisioning: true,
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration(provider: IdentityProvider): { valid: boolean; errors: string[] } {
    if (provider.configuration.type !== 'LDAP') {
      return {
        valid: false,
        errors: ['Provider configuration type must be LDAP'],
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
  private getConfiguration(provider: IdentityProvider): LDAPProviderConfiguration {
    if (provider.configuration.type !== 'LDAP') {
      throw new ConfigurationError('Provider is not configured for LDAP');
    }

    return provider.configuration as LDAPProviderConfiguration;
  }
}
