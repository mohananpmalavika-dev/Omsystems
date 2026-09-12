/**
 * Production LDAPS Connection & Protocol Manager
 * 
 * Provides fail-closed LDAPS TLS validation, RFC 4515 filter escaping,
 * RFC 4514 DN escaping, paged directory querying, and connection diagnostics.
 */

import { Client, SearchOptions, SearchEntry, PagedResultsControl } from 'ldapts';
import type { LdapSyncConfig, LdapConnectionTestResult } from './ldap-types.js';

export class LdapConnectionManager {
  /**
   * Escape an LDAP search filter value per RFC 4515 to eliminate injection attacks.
   */
  static escapeFilterValue(value: string): string {
    if (!value) return '';
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00')
      .replace(/\//g, '\\2f');
  }

  /**
   * Escape an LDAP Distinguished Name (DN) component per RFC 4514.
   */
  static escapeDnComponent(value: string): string {
    if (!value) return '';
    let escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/\+/g, '\\+')
      .replace(/"/g, '\\"')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/;/g, '\\;')
      .replace(/=/g, '\\=')
      .replace(/\0/g, '\\00');

    // Leading space or #
    if (escaped.startsWith(' ')) {
      escaped = '\\ ' + escaped.substring(1);
    } else if (escaped.startsWith('#')) {
      escaped = '\\#' + escaped.substring(1);
    }
    // Trailing space
    if (escaped.endsWith(' ')) {
      escaped = escaped.substring(0, escaped.length - 1) + '\\ ';
    }
    return escaped;
  }

  /**
   * Validate that the server URL conforms to enterprise security mandates.
   * Rejects unencrypted LDAP in strict/production mode.
   */
  static validateServerUrl(url: string, allowPlainInDev: boolean = false): void {
    if (!url) {
      throw new Error('LDAP server URL is required');
    }

    const trimmed = url.trim().toLowerCase();
    const isLdaps = trimmed.startsWith('ldaps://');
    const isLdap = trimmed.startsWith('ldap://');

    if (!isLdaps && !isLdap) {
      throw new Error(`Invalid LDAP protocol in URL '${url}'. Expected 'ldaps://' or 'ldap://'`);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (!isLdaps && isProduction && !allowPlainInDev) {
      throw new Error(
        `Insecure LDAP URL '${url}' rejected: Production banking platform strictly requires LDAPS (TLS port 636). Plaintext ldap:// is prohibited.`
      );
    }
  }

  /**
   * Create and configure an ldapts client instance.
   */
  static createClient(config: LdapSyncConfig): Client {
    this.validateServerUrl(config.serverUrl);

    const tlsOptions: Record<string, any> = {
      rejectUnauthorized: config.tlsRequireTrustedCa !== false,
    };

    if (config.tlsCaCerts && config.tlsCaCerts.length > 0) {
      tlsOptions.ca = config.tlsCaCerts;
    }

    return new Client({
      url: config.serverUrl,
      timeout: 15000,
      connectTimeout: 15000,
      tlsOptions,
    });
  }

  /**
   * Establish an authenticated service client.
   */
  static async getAuthenticatedClient(config: LdapSyncConfig, explicitPassword?: string): Promise<Client> {
    const client = this.createClient(config);
    const password = explicitPassword || config.bindPassword;

    if (!password) {
      throw new Error('LDAP bind password / secret is required for directory synchronization');
    }

    try {
      await client.bind(config.bindDn, password);
      return client;
    } catch (error: any) {
      await client.unbind().catch(() => {});
      const errMsg = error?.message || String(error);
      if (errMsg.includes('Invalid Credentials') || errMsg.includes('error 49')) {
        throw new Error(`LDAP service bind failed: Invalid credentials for bind DN '${config.bindDn}'`);
      }
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')) {
        throw new Error(`LDAP service connection timeout/refused reaching server '${config.serverUrl}'`);
      }
      if (errMsg.includes('certificate') || errMsg.includes('CERT_')) {
        throw new Error(`LDAP TLS certificate validation failure for '${config.serverUrl}': ${errMsg}`);
      }
      throw new Error(`LDAP connection error: ${errMsg}`);
    }
  }

  /**
   * Execute a paged search across directory entries to safely handle large trees without truncation.
   */
  static async executePagedSearch(
    client: Client,
    searchBase: string,
    filter: string,
    attributes: string[],
    pageSize: number = 500
  ): Promise<Array<{ dn: string; attributes: Record<string, any> }>> {
    const results: Array<{ dn: string; attributes: Record<string, any> }> = [];

    try {
      if (typeof client.searchPaginated === 'function') {
        const paginator = client.searchPaginated(searchBase, {
          scope: 'sub',
          filter,
          attributes,
          paged: { pageSize },
        });

        for await (const page of paginator) {
          for (const entry of page.searchEntries) {
            const rawEntry = entry as unknown as Record<string, any>;
            const dn = String(rawEntry.dn || '');
            const cleanAttrs: Record<string, any> = {};

            for (const [k, v] of Object.entries(rawEntry)) {
              if (k === 'dn') continue;
              cleanAttrs[k] = v;
            }

            results.push({ dn, attributes: cleanAttrs });
          }
        }
      } else {
        const searchResult = await client.search(searchBase, {
          scope: 'sub',
          filter,
          attributes,
          paged: { pageSize },
        });

        for (const entry of searchResult.searchEntries) {
          const rawEntry = entry as unknown as Record<string, any>;
          const dn = String(rawEntry.dn || '');
          const cleanAttrs: Record<string, any> = {};

          for (const [k, v] of Object.entries(rawEntry)) {
            if (k === 'dn') continue;
            cleanAttrs[k] = v;
          }

          results.push({ dn, attributes: cleanAttrs });
        }
      }

      return results;
    } catch (err: any) {
      throw new Error(`LDAP search error on base '${searchBase}' with filter '${filter}': ${err.message}`);
    }
  }

  /**
   * Perform comprehensive diagnostic test of LDAPS connectivity and credentials.
   */
  static async testConnection(
    config: LdapSyncConfig,
    explicitPassword?: string
  ): Promise<LdapConnectionTestResult> {
    const startTime = Date.now();
    let client: Client | null = null;

    try {
      client = await this.getAuthenticatedClient(config, explicitPassword);
      const latency = Date.now() - startTime;

      let rootDseInfo: Record<string, any> | undefined = undefined;
      try {
        const rootDse = await client.search('', {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['namingContexts', 'supportedLDAPVersion', 'vendorName', 'subschemaSubentry'],
        });
        if (rootDse.searchEntries.length > 0) {
          const entry = rootDse.searchEntries[0] as unknown as Record<string, any>;
          rootDseInfo = {
            namingContexts: Array.isArray(entry.namingContexts) ? entry.namingContexts : [entry.namingContexts].filter(Boolean),
            supportedLDAPVersion: Array.isArray(entry.supportedLDAPVersion) ? entry.supportedLDAPVersion : [entry.supportedLDAPVersion].filter(Boolean),
            vendorName: typeof entry.vendorName === 'string' ? entry.vendorName : undefined,
          };
        }
      } catch {
        // RootDSE reading is optional for diagnostic purposes
      }

      await client.unbind().catch(() => {});

      return {
        success: true,
        serverUrl: config.serverUrl,
        tlsSecure: config.serverUrl.toLowerCase().startsWith('ldaps://'),
        boundAs: config.bindDn,
        responseTimeMs: latency,
        rootDseInfo,
      };
    } catch (err: any) {
      if (client) {
        await client.unbind().catch(() => {});
      }
      return {
        success: false,
        serverUrl: config.serverUrl,
        tlsSecure: config.serverUrl.toLowerCase().startsWith('ldaps://'),
        boundAs: config.bindDn,
        responseTimeMs: Date.now() - startTime,
        error: err.message || String(err),
      };
    }
  }
}
