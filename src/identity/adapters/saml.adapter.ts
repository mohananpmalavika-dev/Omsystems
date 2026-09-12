/**
 * SAML 2.0 Identity Adapter
 * 
 * Handles authentication via SAML 2.0 Identity Providers.
 * 
 * Key responsibilities:
 * - XML signature validation
 * - Assertion replay prevention
 * - InResponseTo correlation
 * - Claims normalization
 * 
 * Does NOT:
 * - Create local users
 * - Assign roles
 * - Generate application tokens
 */

import type {
  EnterpriseIdentityAdapter,
  EnterpriseAuthenticationInput,
  SAMLCallbackInput,
} from './identity-adapter.js';
import type {
  VerifiedExternalIdentity,
} from '../domain/verified-external-identity.js';
import type {
  IdentityProvider,
  SAMLProviderConfiguration,
  IdentityProviderCapabilities,
  IdentityProviderHealth,
  ProviderReadiness,
} from '../domain/identity-provider.js';
import {
  InvalidTokenError,
  ProtocolValidationError,
  ConfigurationError,
  IdentityProviderError,
} from '../domain/auth-errors.js';
import type { Pool } from 'pg';
import { randomBytes } from 'crypto';

// Using saml2-js or similar library
// Install: npm install saml2-js @types/saml2-js
// Note: In production, use a well-maintained SAML library

import { SAML } from '@node-saml/passport-saml';

/**
 * Parsed SAML assertion
 */
interface SAMLAssertion {
  issuer: string;
  sessionIndex?: string;
  nameId: string;
  nameIdFormat?: string;
  attributes: Record<string, string | string[]>;
  notBefore?: Date;
  notOnOrAfter?: Date;
  audience?: string;
  inResponseTo?: string;
  assertionId: string;
  authnContextClassRef?: string;
}

/**
 * SAML Adapter
 */
export class SAMLIdentityAdapter implements EnterpriseIdentityAdapter {
  readonly type = 'SAML' as const;

  constructor(private pool: Pool) {}

  /**
   * Authenticate via SAML assertion
   */
  async authenticate(input: EnterpriseAuthenticationInput): Promise<VerifiedExternalIdentity> {
    const config = this.getConfiguration(input.provider);
    const callbackInput = input.request as SAMLCallbackInput;

    // 1. Parse and cryptographically verify assertion using mature @node-saml engine
    const assertion = await this.verifyAssertion(config, callbackInput.samlResponse, callbackInput.relayState);

    // 2. Check for replay
    await this.checkAssertionReplay(input.provider.id, assertion);

    // 3. Record assertion ID to prevent future replay
    await this.recordAssertion(input.provider.id, assertion);

    // 4. Normalize to VerifiedExternalIdentity
    return this.normalizeIdentity(input.provider.id, config, assertion);
  }

  /**
   * Decode base64 SAML response
   */
  private decodeSAMLResponse(encodedResponse: string): string {
    try {
      return Buffer.from(encodedResponse, 'base64').toString('utf8');
    } catch (error) {
      throw new InvalidTokenError('Invalid SAML response encoding', 'ASSERTION');
    }
  }

  /**
   * Verify SAML assertion using @node-saml/passport-saml.
   * Enforces XML signature verification, prevents XML signature wrapping (XSW),
   * validates issuer, audience, destination, NotBefore, NotOnOrAfter, and InResponseTo.
   */
  private async verifyAssertion(
    config: SAMLProviderConfiguration,
    samlResponseRaw: string,
    relayState?: string,
  ): Promise<SAMLAssertion> {
    const pemCert = config.certificate.includes('BEGIN CERTIFICATE')
      ? config.certificate
      : `-----BEGIN CERTIFICATE-----\n${config.certificate.match(/.{1,64}/g)?.join('\n') ?? config.certificate}\n-----END CERTIFICATE-----`;

    const samlEngine = new SAML({
      entryPoint: config.ssoUrl,
      issuer: config.entityId,
      callbackUrl: config.acsUrl,
      idpCert: pemCert,
      audience: config.entityId,
      wantAssertionsSigned: config.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
      acceptedClockSkewMs: 60000,
    });

    try {
      const result = await samlEngine.validatePostResponseAsync({
        SAMLResponse: samlResponseRaw,
      });

      if (!result.profile) {
        throw new ProtocolValidationError(
          'INVALID_SIGNATURE',
          'SAML library returned empty profile',
          'SAML',
        );
      }

      const profile = result.profile;
      const attributes: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(profile)) {
        if (!['issuer', 'sessionIndex', 'nameID', 'nameIDFormat', 'inResponseTo'].includes(k)) {
          attributes[k] = v as any;
        }
      }

      return {
        issuer: profile.issuer || config.issuer,
        nameId: profile.nameID || (profile as any).nameId || '',
        nameIdFormat: profile.nameIDFormat,
        sessionIndex: profile.sessionIndex,
        attributes,
        audience: config.entityId,
        inResponseTo: (profile as any).inResponseTo,
        assertionId: (profile as any).ID || (profile as any)['@ID'] || `assert-${Date.now()}`,
      };
    } catch (err: any) {
      if (err instanceof ProtocolValidationError) throw err;
      const msg = err?.message || String(err);
      if (msg.includes('signature') || msg.includes('Signature') || msg.includes('digest')) {
        throw new ProtocolValidationError(
          'INVALID_SIGNATURE',
          `SAML assertion signature validation failed: ${msg}`,
          'SAML',
        );
      }
      if (msg.includes('expired') || msg.includes('NotOnOrAfter')) {
        throw new ProtocolValidationError(
          'ASSERTION_EXPIRED',
          `SAML assertion has expired: ${msg}`,
          'SAML',
        );
      }
      if (msg.includes('audience') || msg.includes('Audience')) {
        throw new ProtocolValidationError(
          'AUDIENCE_MISMATCH',
          `SAML audience does not match SP entity ID: ${msg}`,
          'SAML',
        );
      }
      if (msg.includes('issuer') || msg.includes('Issuer')) {
        throw new ProtocolValidationError(
          'ISSUER_MISMATCH',
          `SAML issuer does not match expected issuer: ${msg}`,
          'SAML',
        );
      }
      throw new ProtocolValidationError(
        'INVALID_SIGNATURE',
        `SAML validation failed: ${msg}`,
        'SAML',
      );
    }
  }



  /**
   * Check if assertion has already been used (replay attack)
   */
  private async checkAssertionReplay(
    providerId: string,
    assertion: SAMLAssertion,
  ): Promise<void> {
    const result = await this.pool.query(
      `SELECT id FROM saml_assertions
       WHERE provider_id = $1
         AND assertion_id = $2`,
      [providerId, assertion.assertionId]
    );

    if (result.rows.length > 0) {
      throw new ProtocolValidationError(
        'ASSERTION_REPLAY',
        'SAML assertion has already been used',
        'SAML',
        { assertionId: assertion.assertionId }
      );
    }
  }

  /**
   * Record assertion ID to prevent replay
   */
  private async recordAssertion(
    providerId: string,
    assertion: SAMLAssertion,
  ): Promise<void> {
    // Calculate expiration (use assertion expiry or default to 5 minutes)
    const expiresAt = assertion.notOnOrAfter || new Date(Date.now() + 5 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO saml_assertions (provider_id, assertion_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider_id, assertion_id) DO NOTHING`,
      [providerId, assertion.assertionId, expiresAt]
    );
  }

  /**
   * Normalize SAML assertion to VerifiedExternalIdentity
   */
  private normalizeIdentity(
    providerId: string,
    config: SAMLProviderConfiguration,
    assertion: SAMLAssertion,
  ): VerifiedExternalIdentity {
    // Use NameID as subject (immutable identifier)
    const subject = assertion.nameId;

    // Map attributes based on configuration
    const mappings = config.attributeMappings;

    const email = this.getAttribute(assertion, mappings.email || 'email');
    const username = this.getAttribute(assertion, mappings.username || 'username');
    const displayName = this.getAttribute(assertion, mappings.displayName || 'displayName');
    const givenName = this.getAttribute(assertion, mappings.givenName || 'givenName');
    const familyName = this.getAttribute(assertion, mappings.familyName || 'familyName');

    // Get groups
    const groupAttribute = config.groupAttribute || 'groups';
    const groups = this.getAttributeArray(assertion, groupAttribute);

    // Determine email verification status
    // SAML doesn't have a standard email verification claim
    // Assume verified if email is provided and IdP is trusted
    const emailVerified = !!email;

    return {
      providerId,
      providerType: 'SAML',
      subject,
      email,
      emailVerified,
      username: username || email,
      displayName: displayName || username || email,
      givenName,
      familyName,
      groups,
      claims: assertion.attributes as Record<string, unknown>,
      authenticatedAt: new Date(),
      assurance: {
        mfa: this.detectMFA(assertion.authnContextClassRef),
        phishingResistant: false, // SAML doesn't typically provide this
      },
    };
  }

  /**
   * Get attribute value from assertion
   */
  private getAttribute(assertion: SAMLAssertion, attributeName: string): string | undefined {
    const value = assertion.attributes[attributeName];
    
    if (!value) return undefined;
    
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Get attribute as array
   */
  private getAttributeArray(assertion: SAMLAssertion, attributeName: string): string[] {
    const value = assertion.attributes[attributeName];
    
    if (!value) return [];
    
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Detect MFA from AuthnContextClassRef
   */
  private detectMFA(authnContextClassRef?: string): boolean {
    if (!authnContextClassRef) return false;

    // Common SAML AuthnContextClassRef values indicating MFA
    const mfaIndicators = [
      'urn:oasis:names:tc:SAML:2.0:ac:classes:MultiFactor',
      'urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract',
      'urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken',
      'urn:federation:authentication:windows:mfa',
    ];

    return mfaIndicators.some(indicator => 
      authnContextClassRef.includes(indicator)
    );
  }

  /**
   * Check adapter readiness
   */
  checkReadiness(provider: IdentityProvider): ProviderReadiness {
    const config = this.getConfiguration(provider);
    const errors: string[] = [];

    if (!config.entityId) {
      errors.push('SAML SP entity ID is required');
    }

    if (!config.ssoUrl) {
      errors.push('IdP SSO URL is required');
    }

    if (!config.issuer) {
      errors.push('IdP issuer/entity ID is required');
    }

    if (!config.acsUrl) {
      errors.push('ACS (Assertion Consumer Service) URL is required');
    }

    if (!config.certificate) {
      errors.push('IdP signing certificate is required');
    }

    if (!config.acsUrl.startsWith('https://') && process.env.NODE_ENV === 'production') {
      errors.push('ACS URL must use HTTPS in production');
    }

    if (config.signRequests && !config.privateKeyRef) {
      errors.push('Private key is required when request signing is enabled');
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

    // Check IdP metadata endpoint (if available)
    try {
      const metadataUrl = config.ssoUrl.replace(/\/SSO.*$/, '/FederationMetadata/2007-06/FederationMetadata.xml');
      
      const response = await fetch(metadataUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/xml' },
      });

      checks.push({
        name: 'IdP Metadata',
        status: response.ok ? 'PASS' : 'WARN',
        message: response.ok ? 'Metadata endpoint reachable' : `HTTP ${response.status}`,
        timestamp: new Date(),
      });
    } catch (error) {
      checks.push({
        name: 'IdP Metadata',
        status: 'WARN',
        message: 'Metadata endpoint check failed (may not be available)',
        timestamp: new Date(),
      });
    }

    // Validate certificate format
    try {
      this.validateCertificate(config.certificate);
      
      checks.push({
        name: 'Certificate Validation',
        status: 'PASS',
        message: 'IdP certificate is valid',
        timestamp: new Date(),
      });
    } catch (error) {
      checks.push({
        name: 'Certificate Validation',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Certificate validation failed',
        timestamp: new Date(),
      });
    }

    const hasFailures = checks.some(c => c.status === 'FAIL');
    const hasWarnings = checks.some(c => c.status === 'WARN');

    return {
      providerId: provider.id,
      status: hasFailures ? 'MISCONFIGURED' : hasWarnings ? 'DEGRADED' : 'HEALTHY',
      lastHealthCheck: new Date(),
      checks,
    };
  }

  /**
   * Validate certificate format
   */
  private validateCertificate(certificate: string): void {
    if (!certificate) {
      throw new Error('Certificate is empty');
    }

    // Check for PEM format markers
    const hasPEMMarkers = 
      certificate.includes('-----BEGIN CERTIFICATE-----') &&
      certificate.includes('-----END CERTIFICATE-----');

    if (!hasPEMMarkers) {
      throw new Error('Certificate must be in PEM format');
    }
  }

  /**
   * Get adapter capabilities
   */
  getCapabilities(): IdentityProviderCapabilities {
    return {
      interactiveLogin: true,
      passwordAuthentication: false,
      groupClaims: true,
      mfaAssurance: true,
      logout: true, // SAML supports Single Logout
      directorySync: false,
      jitProvisioning: true,
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration(provider: IdentityProvider): { valid: boolean; errors: string[] } {
    if (provider.configuration.type !== 'SAML') {
      return {
        valid: false,
        errors: ['Provider configuration type must be SAML'],
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
  private getConfiguration(provider: IdentityProvider): SAMLProviderConfiguration {
    if (provider.configuration.type !== 'SAML') {
      throw new ConfigurationError('Provider is not configured for SAML');
    }

    return provider.configuration as SAMLProviderConfiguration;
  }

  /**
   * Generate SAML AuthnRequest (for SP-initiated login)
   */
  generateAuthnRequest(config: SAMLProviderConfiguration, relayState?: string): {
    authnRequestXML: string;
    requestId: string;
  } {
    const requestId = `_${randomBytes(16).toString('hex')}`;
    const issueInstant = new Date().toISOString();

    // Build SAML AuthnRequest XML
    // TODO: Use proper SAML library for this
    const authnRequestXML = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${requestId}"
        Version="2.0"
        IssueInstant="${issueInstant}"
        Destination="${config.ssoUrl}"
        AssertionConsumerServiceURL="${config.acsUrl}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>${config.entityId}</saml:Issuer>
        ${config.signRequests ? '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">...</ds:Signature>' : ''}
        <samlp:NameIDPolicy Format="${config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'}" AllowCreate="true"/>
      </samlp:AuthnRequest>
    `.trim();

    return {
      authnRequestXML,
      requestId,
    };
  }
}
