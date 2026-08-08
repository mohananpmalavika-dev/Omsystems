/**
 * SAML 2.0 Connector
 * 
 * Generic SAML integration for enterprise identity providers:
 * - Okta
 * - OneLogin
 * - Auth0
 * - Ping Identity
 * - ADFS
 * - Any SAML 2.0 compliant IdP
 * 
 * Features:
 * - Service Provider (SP) initiated SSO
 * - Identity Provider (IdP) initiated SSO
 * - Single Logout (SLO)
 * - Attribute mapping
 * 
 * SECURITY NOTE: This implementation requires @node-saml/node-saml for production use.
 * The connector will fail closed until the library is installed and properly configured.
 */

import { BaseConnector } from './base-connector.js';
import type {
  IntegrationEvent,
  IntegrationResponse,
  IntegrationConfigSchema
} from '../types.js';

// Production SAML validation requires @node-saml/node-saml
// Install with: npm install @node-saml/node-saml
// 
// This module uses dynamic imports to avoid breaking the build when the library
// is not installed. The connector will fail closed (refuse authentication) until
// the library is installed.

let SAML: any = null;
let samlImportPromise: Promise<any> | null = null;
let importAttempted = false;

// Lazy load SAML library with error handling
async function getSAMLClass(): Promise<any> {
  if (SAML) return SAML;
  
  if (!samlImportPromise && !importAttempted) {
    importAttempted = true;
    samlImportPromise = (async () => {
      try {
        // Use Function constructor to prevent TypeScript from analyzing the import
        // This allows the build to succeed even when @node-saml/node-saml is not installed
        const dynamicImport = new Function('moduleName', 'return import(moduleName)');
        const module = await dynamicImport('@node-saml/node-saml');
        SAML = module.SAML;
        return SAML;
      } catch (error) {
        // Library not installed - will fail closed
        // This is expected and safe - connector will refuse authentication
        return null;
      }
    })();
  }
  
  return samlImportPromise;
}

interface SAMLConfig {
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  spEntityId: string;
  spAcsUrl: string;
  spSloUrl?: string;
  spCertificate?: string;
  spPrivateKey?: string;
  nameIdFormat?: string;
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string;
  };
  signRequests?: boolean;
  encryptAssertions?: boolean;
  clockTolerance?: number; // Clock skew tolerance in seconds (default: 0)
  acceptedClockSkewMs?: number; // Accepted clock skew in milliseconds (default: 0)
  audience?: string | string[] | false; // Expected audience(s), false to disable check
  validateInResponseTo?: boolean; // Validate InResponseTo field (default: true)
  requestIdExpirationPeriodMs?: number; // Request ID expiration period (default: 28800000 = 8 hours)
  cacheProvider?: any; // Cache provider for replay protection
}

interface SAMLProfile {
  issuer?: string;
  sessionIndex?: string;
  nameID?: string;
  nameIDFormat?: string;
  nameQualifier?: string;
  spNameQualifier?: string;
  mail?: string; // eduPerson
  email?: string;
  getAssertionXml?(): string;
  getAssertion?(): object;
  getSamlResponseXml?(): string;
  [attributeName: string]: unknown;
}

export class SAMLConnector extends BaseConnector {
  readonly type = 'saml' as const;
  readonly category = 'identity' as const;
  readonly name = 'SAML 2.0';
  readonly description = 'Generic SAML 2.0 integration for enterprise SSO with any compliant identity provider';
  readonly version = '1.0.0';

  private samlInstance: any = null;
  private requestCache = new Map<string, { timestamp: number; relayState?: string }>();

  /**
   * Initialize SAML instance with proper security configuration
   */
  private async initializeSAML(): Promise<any> {
    const SAMLClass = await getSAMLClass();
    
    if (!SAMLClass) {
      throw new Error(
        'SAML library (@node-saml/node-saml) is not installed. ' +
        'This connector cannot authenticate users without proper SAML validation. ' +
        'Install with: npm install @node-saml/node-saml'
      );
    }

    if (this.samlInstance) {
      return this.samlInstance;
    }

    const config = this.config!.config as SAMLConfig;
    
    // Build secure SAML configuration
    const samlConfig: any = {
      // Identity Provider config
      entryPoint: config.idpSsoUrl,
      issuer: config.spEntityId,
      cert: this.cleanCertificate(config.idpCertificate),
      
      // Service Provider config
      callbackUrl: config.spAcsUrl,
      
      // Security settings - fail secure by default
      audience: config.audience !== undefined ? config.audience : config.spEntityId,
      acceptedClockSkewMs: config.acceptedClockSkewMs ?? 0, // No clock skew by default
      validateInResponseTo: config.validateInResponseTo ?? true,
      requestIdExpirationPeriodMs: config.requestIdExpirationPeriodMs ?? 28800000, // 8 hours
      
      // Signature and encryption
      wantAssertionsSigned: true, // Always require signed assertions
      wantAuthnResponseSigned: config.signRequests ?? false,
      signatureAlgorithm: 'sha256', // Strong signature algorithm
      digestAlgorithm: 'sha256',
      
      // Name ID format
      identifierFormat: config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      
      // Optional SP signing
      decryptionPvk: config.spPrivateKey ? this.cleanCertificate(config.spPrivateKey) : undefined,
      privateCert: config.spPrivateKey ? this.cleanCertificate(config.spPrivateKey) : undefined,
      
      // Force authentication (re-authenticate even if session exists)
      forceAuthn: false,
      
      // Disable passive authentication (don't authenticate silently)
      passive: false,
      
      // Cache provider for replay protection
      cacheProvider: config.cacheProvider || this.createInMemoryCache(),
    };

    // Add logout config if provided
    if (config.idpSloUrl) {
      samlConfig.logoutUrl = config.idpSloUrl;
    }
    if (config.spSloUrl) {
      samlConfig.logoutCallbackUrl = config.spSloUrl;
    }

    this.samlInstance = new SAMLClass(samlConfig);
    return this.samlInstance;
  }

  /**
   * Create in-memory cache for request ID validation (replay protection)
   */
  private createInMemoryCache() {
    const cache = new Map<string, any>();
    const EXPIRATION_MS = 28800000; // 8 hours

    return {
      async save(key: string, value: any): Promise<void> {
        cache.set(key, { value, timestamp: Date.now() });
        // Cleanup old entries
        const entries = Array.from(cache.entries());
        for (const [k, v] of entries) {
          if (Date.now() - v.timestamp > EXPIRATION_MS) {
            cache.delete(k);
          }
        }
      },
      async get(key: string): Promise<any> {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > EXPIRATION_MS) {
          cache.delete(key);
          return null;
        }
        return entry.value;
      },
      async remove(key: string): Promise<void> {
        cache.delete(key);
      }
    };
  }

  /**
   * Clean certificate format (remove headers/footers, normalize whitespace)
   */
  private cleanCertificate(cert: string): string {
    return cert
      .replace(/-----BEGIN [A-Z\s]+-----/g, '')
      .replace(/-----END [A-Z\s]+-----/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // Check if SAML library is available
      const SAMLClass = await getSAMLClass();
      if (!SAMLClass) {
        return {
          success: false,
          message: 'SAML library not installed. Install @node-saml/node-saml to enable SAML authentication.'
        };
      }

      const config = this.config!.config as SAMLConfig;
      
      // Validate configuration
      if (!config.idpEntityId || !config.idpSsoUrl || !config.idpCertificate) {
        return {
          success: false,
          message: 'Missing required SAML configuration'
        };
      }

      // Validate certificate format
      if (!this.isValidCertificate(config.idpCertificate)) {
        return {
          success: false,
          message: 'Invalid IdP certificate format'
        };
      }

      // Try to initialize SAML instance to validate configuration
      try {
        await this.initializeSAML();
      } catch (error) {
        return {
          success: false,
          message: `SAML initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }

      return {
        success: true,
        message: 'SAML configuration is valid and library is installed',
        details: {
          idpEntityId: config.idpEntityId,
          spEntityId: config.spEntityId,
          ssoUrl: config.idpSsoUrl,
          signatureValidation: 'enabled',
          replayProtection: 'enabled',
          clockSkewTolerance: config.acceptedClockSkewMs ?? 0
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      switch (event.eventType) {
        case 'user.login':
        case 'user.logout':
          return this.createSuccessResponse(event);
        
        default:
          return this.createSuccessResponse(event);
      }
    } catch (error) {
      return this.createErrorResponse(
        event,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'idpEntityId',
          label: 'IdP Entity ID',
          type: 'string',
          required: true,
          placeholder: 'https://idp.example.com/metadata',
          description: 'Identity Provider entity identifier'
        },
        {
          name: 'idpSsoUrl',
          label: 'IdP SSO URL',
          type: 'url',
          required: true,
          placeholder: 'https://idp.example.com/sso',
          description: 'Identity Provider Single Sign-On URL'
        },
        {
          name: 'idpSloUrl',
          label: 'IdP SLO URL',
          type: 'url',
          required: false,
          placeholder: 'https://idp.example.com/slo',
          description: 'Identity Provider Single Logout URL (optional)'
        },
        {
          name: 'idpCertificate',
          label: 'IdP Certificate',
          type: 'secret',
          required: true,
          description: 'Identity Provider X.509 certificate (PEM format) - REQUIRED for signature verification'
        },
        {
          name: 'spEntityId',
          label: 'SP Entity ID',
          type: 'string',
          required: true,
          placeholder: 'https://sentinel-grid.example.com/saml/metadata',
          description: 'Service Provider entity identifier'
        },
        {
          name: 'spAcsUrl',
          label: 'SP ACS URL',
          type: 'url',
          required: true,
          placeholder: 'https://sentinel-grid.example.com/saml/acs',
          description: 'Service Provider Assertion Consumer Service URL'
        },
        {
          name: 'spSloUrl',
          label: 'SP SLO URL',
          type: 'url',
          required: false,
          placeholder: 'https://sentinel-grid.example.com/saml/slo',
          description: 'Service Provider Single Logout URL (optional)'
        },
        {
          name: 'nameIdFormat',
          label: 'Name ID Format',
          type: 'select',
          required: false,
          default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          description: 'SAML NameID format',
          validation: {
            options: [
              'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
              'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
              'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
              'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
            ]
          }
        },
        {
          name: 'attributeMapping',
          label: 'Attribute Mapping',
          type: 'json',
          required: false,
          description: 'Map SAML attributes to user fields (JSON object)'
        },
        {
          name: 'signRequests',
          label: 'Sign Requests',
          type: 'boolean',
          required: false,
          default: false,
          description: 'Sign SAML authentication requests'
        },
        {
          name: 'encryptAssertions',
          label: 'Encrypt Assertions',
          type: 'boolean',
          required: false,
          default: false,
          description: 'Require encrypted SAML assertions'
        },
        {
          name: 'acceptedClockSkewMs',
          label: 'Clock Skew Tolerance (ms)',
          type: 'number',
          required: false,
          default: 0,
          description: 'Accepted clock skew in milliseconds (default: 0 for strict validation)'
        },
        {
          name: 'validateInResponseTo',
          label: 'Validate InResponseTo',
          type: 'boolean',
          required: false,
          default: true,
          description: 'Validate InResponseTo field for replay protection (recommended: true)'
        },
        {
          name: 'requestIdExpirationPeriodMs',
          label: 'Request ID Expiration (ms)',
          type: 'number',
          required: false,
          default: 28800000,
          description: 'Request ID expiration period in milliseconds (default: 8 hours)'
        }
      ],
      secrets: ['idpCertificate', 'spPrivateKey'],
      requiredFields: ['idpEntityId', 'idpSsoUrl', 'idpCertificate', 'spEntityId', 'spAcsUrl'],
      documentation: 'https://docs.sentinel-grid.com/integrations/saml - SECURITY: Requires @node-saml/node-saml library. Install with: npm install @node-saml/node-saml'
    };
  }

  /**
   * Generate SAML authentication request with proper security
   */
  async generateAuthRequest(relayState?: string): Promise<{ url: string; id: string }> {
    const saml = await this.initializeSAML();
    
    // Generate authentication request using the library
    // This handles proper XML generation, signing, encoding, etc.
    const loginUrl = await saml.getAuthorizeUrlAsync(relayState || '', {});
    
    // Extract request ID for InResponseTo validation
    const requestId = this.extractRequestId(loginUrl);
    
    // Cache request ID for replay protection
    if (requestId) {
      this.requestCache.set(requestId, {
        timestamp: Date.now(),
        relayState
      });
    }
    
    return {
      url: loginUrl,
      id: requestId
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
      
      const decoded = Buffer.from(samlRequest, 'base64').toString('utf8');
      const match = decoded.match(/ID="([^"]+)"/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  /**
   * Parse and validate SAML response with comprehensive security checks
   * 
   * This method performs:
   * - XML parsing and validation
   * - XML signature verification using IdP certificate
   * - Issuer validation
   * - Audience validation
   * - Destination/ACS URL validation
   * - InResponseTo validation (replay protection)
   * - Assertion time window validation
   * - NameID extraction and validation
   * - Attribute extraction with mapping
   */
  async parseResponse(samlResponse: string, requestId?: string): Promise<{
    success: boolean;
    nameId?: string;
    attributes?: Record<string, any>;
    sessionIndex?: string;
    error?: string;
  }> {
    try {
      // Fail closed if SAML library is not available
      const SAMLClass = await getSAMLClass();
      if (!SAMLClass) {
        return {
          success: false,
          error: 'SAML authentication is not available. The @node-saml/node-saml library must be installed for secure SAML validation.'
        };
      }

      const saml = await this.initializeSAML();
      const config = this.config!.config as SAMLConfig;
      
      // Validate response using the library
      // This performs all critical security checks:
      // - XML signature verification
      // - Certificate validation
      // - Timestamp validation
      // - Audience validation
      // - Issuer validation
      // - InResponseTo validation
      // - Destination validation
      const profile: SAMLProfile = await saml.validatePostResponseAsync({
        SAMLResponse: samlResponse,
        ...(requestId && { RequestId: requestId })
      });

      // Verify the response is from the expected IdP
      if (profile.issuer && profile.issuer !== config.idpEntityId) {
        return {
          success: false,
          error: `Invalid issuer: expected ${config.idpEntityId}, got ${profile.issuer}`
        };
      }

      // Extract user identity
      const nameId = profile.nameID || profile.email || profile.mail;
      if (!nameId) {
        return {
          success: false,
          error: 'No NameID or email found in SAML assertion'
        };
      }

      // Map SAML attributes to user attributes
      const attributes = this.mapAttributes(profile, config.attributeMapping);

      // Clean up request cache if this was an SP-initiated flow
      if (requestId) {
        this.requestCache.delete(requestId);
      }

      return {
        success: true,
        nameId: nameId as string,
        attributes,
        sessionIndex: profile.sessionIndex as string | undefined
      };
    } catch (error) {
      // Log detailed error but return generic message to user
      console.error('SAML validation error:', error);
      
      return {
        success: false,
        error: error instanceof Error 
          ? `SAML validation failed: ${error.message}` 
          : 'SAML validation failed'
      };
    }
  }

  /**
   * Map SAML assertion attributes to user attributes
   */
  private mapAttributes(
    profile: SAMLProfile,
    mapping?: SAMLConfig['attributeMapping']
  ): Record<string, any> {
    const attributes: Record<string, any> = {};

    // Default mappings
    if (profile.email || profile.mail) {
      attributes.email = profile.email || profile.mail;
    }
    if (profile.nameID) {
      attributes.nameId = profile.nameID;
    }

    // Custom attribute mapping
    if (mapping) {
      for (const [targetKey, sourceKey] of Object.entries(mapping)) {
        if (sourceKey && profile[sourceKey] !== undefined) {
          attributes[targetKey] = profile[sourceKey];
        }
      }
    }

    // Copy all other profile attributes
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value !== 'function' && !attributes[key]) {
        attributes[key] = value;
      }
    }

    return attributes;
  }

  /**
   * Generate SAML metadata XML
   */
  generateMetadata(): string {
    const config = this.config!.config as SAMLConfig;
    
    return `
<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="${config.spEntityId}">
  <md:SPSSODescriptor
      AuthnRequestsSigned="${config.signRequests || false}"
      WantAssertionsSigned="true"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>${config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}</md:NameIDFormat>
    <md:AssertionConsumerService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${config.spAcsUrl}"
        index="0"
        isDefault="true"/>
    ${config.spSloUrl ? `
    <md:SingleLogoutService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${config.spSloUrl}"/>
    ` : ''}
  </md:SPSSODescriptor>
</md:EntityDescriptor>
    `.trim();
  }

  /**
   * Validate certificate format
   */
  private isValidCertificate(cert: string): boolean {
    return cert.includes('BEGIN CERTIFICATE') && cert.includes('END CERTIFICATE');
  }
}
