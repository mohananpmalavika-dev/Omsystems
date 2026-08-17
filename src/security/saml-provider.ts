/**
 * SAML SSO Provider
 * 
 * Supports enterprise SSO with:
 * - SAML 2.0 protocol
 * - Azure AD, Okta, OneLogin
 * - SP-initiated and IdP-initiated flows
 * - Multiple tenants
 */

import { SAML, type Profile, type SamlConfig as BaseSamlConfig } from '@node-saml/passport-saml';
import { randomBytes } from 'crypto';

export interface SamlConfig {
  tenantId: string;
  tenantSlug: string;
  idpUrl: string;
  idpCertificate: string;
  spEntityId: string;
  spCallbackUrl: string;
  audience?: string;
  signatureAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  digestAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  wantAssertionsSigned?: boolean;
  wantAuthnResponseSigned?: boolean;
  attributeMapping?: {
    userId?: string;
    email?: string;
    displayName?: string;
    groups?: string;
  };
}

export interface SamlUser {
  nameId: string;
  email?: string;
  displayName?: string;
  groups?: string[];
  attributes: Record<string, any>;
  sessionIndex?: string;
}

export class SamlProvider {
  private saml: SAML;
  private config: SamlConfig;
  private pendingRequests: Map<string, { created: Date; relayState?: string }> = new Map();

  constructor(config: SamlConfig) {
    this.config = config;

    const samlConfig: any = {
      entryPoint: config.idpUrl,
      issuer: config.spEntityId,
      callbackUrl: config.spCallbackUrl,
      idpCert: config.idpCertificate || 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA',
      cert: [config.idpCertificate || 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'],
      audience: config.audience || config.spEntityId,
      signatureAlgorithm: config.signatureAlgorithm || 'sha256',
      digestAlgorithm: config.digestAlgorithm || 'sha256',
      wantAssertionsSigned: config.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
      validateInResponseTo: 'always' as any,
      requestIdExpirationPeriodMs: 600000, // 10 minutes
      cacheProvider: {
        saveAsync: async (key: string, value: string) => {
          this.pendingRequests.set(key, {
            created: new Date(),
            relayState: value
          });
          return null;
        },
        getAsync: async (key: string) => {
          const entry = this.pendingRequests.get(key);
          return entry?.relayState || null;
        },
        removeAsync: async (key: string | null) => {
          if (key) {
            this.pendingRequests.delete(key);
          }
          return null;
        }
      }
    };

    this.saml = new SAML(samlConfig);
  }

  /**
   * Get SSO login URL (SP-initiated flow)
   */
  async getLoginUrl(relayState?: string): Promise<{ url: string; requestId: string }> {
    const url = await this.saml.getAuthorizeUrlAsync(relayState || '', '' as any, {} as any);
    
    // Extract request ID from URL
    const requestId = this.extractRequestId(url);
    
    return { url, requestId };
  }

  /**
   * Validate SAML response and extract user profile
   */
  async validateResponse(samlResponse: string, relayState?: string): Promise<SamlUser> {
    try {
      const result = await this.saml.validatePostResponseAsync({
        SAMLResponse: samlResponse
      });

      if (!result.profile) {
        throw new Error('No profile returned from SAML response');
      }

      return this.mapProfile(result.profile);
    } catch (error: unknown) {
      throw new Error(`SAML validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate logout URL
   */
  async getLogoutUrl(user: { nameId: string; sessionIndex?: string }): Promise<string> {
    const url = await this.saml.getLogoutUrlAsync(user as any, '' as any, {} as any);
    return url;
  }

  /**
   * Validate logout response
   */
  async validateLogoutResponse(samlResponse: string): Promise<boolean> {
    try {
      await this.saml.validatePostResponseAsync({
        SAMLResponse: samlResponse
      });
      return true;
    } catch (error) {
      console.error('SAML logout validation failed:', error);
      return false;
    }
  }

  /**
   * Get SP metadata XML
   */
  async getMetadata(): Promise<string> {
    return this.saml.generateServiceProviderMetadata(null, null);
  }

  /**
   * Map SAML profile to user object
   */
  private mapProfile(profile: Profile): SamlUser {
    const mapping = this.config.attributeMapping || {};
    
    const userId = mapping.userId 
      ? String((profile as any)[mapping.userId] || profile.nameID)
      : String(profile.nameID);

    const email = mapping.email
      ? String((profile as any)[mapping.email] || (profile as any).email || '')
      : String((profile as any).email || '');

    const displayName = mapping.displayName
      ? String((profile as any)[mapping.displayName] || (profile as any).displayName || '')
      : String((profile as any).displayName || '');

    let groups: string[] = [];
    if (mapping.groups && (profile as any)[mapping.groups]) {
      const groupsValue = (profile as any)[mapping.groups];
      groups = Array.isArray(groupsValue) ? groupsValue : [groupsValue];
    }

    return {
      nameId: userId,
      email: email || undefined,
      displayName: displayName || undefined,
      groups,
      attributes: profile as any,
      sessionIndex: (profile as any).sessionIndex
    };
  }

  /**
   * Extract request ID from SAML request URL
   */
  private extractRequestId(url: string): string {
    try {
      const urlObj = new URL(url);
      const samlRequest = urlObj.searchParams.get('SAMLRequest');
      if (!samlRequest) return '';
      
      // Decode and extract ID (simplified - in production parse XML)
      const decoded = Buffer.from(samlRequest, 'base64').toString();
      const idMatch = decoded.match(/ID="([^"]+)"/);
      return idMatch?.[1] || '';
    } catch {
      return '';
    }
  }

  /**
   * Cleanup expired pending requests
   */
  cleanupExpiredRequests(maxAgeMs: number = 600000): void {
    const now = Date.now();
    for (const [key, value] of this.pendingRequests.entries()) {
      if (now - value.created.getTime() > maxAgeMs) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Get provider status
   */
  getStatus(): {
    tenantId: string;
    tenantSlug: string;
    idpUrl: string;
    pendingRequests: number;
  } {
    return {
      tenantId: this.config.tenantId,
      tenantSlug: this.config.tenantSlug,
      idpUrl: this.config.idpUrl,
      pendingRequests: this.pendingRequests.size
    };
  }
}

export const samlProvider = new SamlProvider({
  tenantId: 'default-bank-tenant',
  tenantSlug: 'bank',
  idpUrl: process.env.SAML_IDP_URL || 'https://idp.bank.internal/saml2',
  idpCertificate: process.env.SAML_IDP_CERT || 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',
  spEntityId: process.env.SAML_SP_ENTITY_ID || 'https://vms.bank.internal/saml/metadata',
  spCallbackUrl: process.env.SAML_SP_CALLBACK_URL || 'https://vms.bank.internal/v1/auth/saml/callback',
});
