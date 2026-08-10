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

    const samlConfig: BaseSamlConfig = {
      entryPoint: config.idpUrl,
      issuer: config.spEntityId,
      callbackUrl: config.spCallbackUrl,
      cert: config.idpCertificate,
      audience: config.audience || config.spEntityId,
      signatureAlgorithm: config.signatureAlgorithm || 'sha256',
      digestAlgorithm: config.digestAlgorithm || 'sha256',
      wantAssertionsSigned: config.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
      validateInResponseTo: true,
      requestIdExpirationPeriodMs: 600000, // 10 minutes
      cacheProvider: {
        saveAsync: async (key: string, value: string) => {
          this.pendingRequests.set(key, {
            created: new Date(),
            relayState: value
          });
        },
        getAsync: async (key: string) => {
          const entry = this.pendingRequests.get(key);
          return entry?.relayState || null;
        },
        removeAsync: async (key: string) => {
          this.pendingRequests.delete(key);
        }
      }
    };

    this.saml = new SAML(samlConfig);
  }

  /**
   * Get SSO login URL (SP-initiated flow)
   */
  async getLoginUrl(relayState?: string): Promise<{ url: string; requestId: string }> {
    const url = await this.saml.getAuthorizeUrlAsync(relayState || '', {});
    
    // Extract request ID from URL
    const requestId = this.extractRequestId(url);
    
    return { url, requestId };
  }

  /**
   * Validate SAML response and extract user profile
   */
  async validateResponse(samlResponse: string, relayState?: string): Promise<SamlUser> {
    try {
      const profile = await this.saml.validatePostResponseAsync({
        SAMLResponse: samlResponse
      });

      return this.mapProfile(profile);
    } catch (error) {
      throw new Error(`SAML validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate logout URL
   */
  async getLogoutUrl(user: { nameId: string; sessionIndex?: string }): Promise<string> {
    const url = await this.saml.getLogoutUrlAsync(user, {});
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
      ? profile[mapping.userId] || profile.nameID
      : profile.nameID;

    const email = mapping.email
      ? profile[mapping.email] || profile.email
      : profile.email;

    const displayName = mapping.displayName
      ? profile[mapping.displayName] || profile.displayName
      : profile.displayName;

    let groups: string[] = [];
    if (mapping.groups && profile[mapping.groups]) {
      const groupsValue = profile[mapping.groups];
      groups = Array.isArray(groupsValue) ? groupsValue : [groupsValue];
    }

    return {
      nameId: userId,
      email,
      displayName,
      groups,
      attributes: profile,
      sessionIndex: profile.sessionIndex
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
      return idMatch ? idMatch[1] : '';
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
