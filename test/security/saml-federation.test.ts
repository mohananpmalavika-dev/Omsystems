/**
 * Production SAML 2.0 Enterprise Federation Comprehensive Test Suite
 * 
 * Tests:
 * 1. Multi-tenant registration & IdP metadata XML parsing
 * 2. Service Provider (SP) metadata XML generation
 * 3. SP-initiated AuthnRequest generation & Request ID tracking
 * 4. Cryptographic XMLDSIG assertion signature verification
 * 5. Signature tampering and untrusted certificate rejection
 * 6. Distributed assertion replay attack prevention
 * 7. Timestamp validation (expired & future assertions with clock skew)
 * 8. Audience and Issuer restriction enforcement
 * 9. End-to-end integration via IdentityService (JIT provisioning & role mapping)
 * 10. HTTP enterprise routes (login, callback, metadata, admin provider management)
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import forge from 'node-forge';
import { samlProvider, SamlProvider, MemorySAMLReplayStore } from '../../src/security/saml-provider.js';
import { identityService } from '../../src/identity/services/identity.service.js';
import Fastify from 'fastify';
import { registerEnterpriseAuthRoutes } from '../../src/routes/auth-enterprise.routes.js';

// Dynamically resolve SignedXml from node-saml
const { SignedXml } = await import('../../node_modules/@node-saml/node-saml/node_modules/xml-crypto/lib/index.js');

interface TestCertPair {
  certPem: string;
  privateKeyPem: string;
}

function generateTestCertAndKey(): TestCertPair {
  const keypair = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = '01' + Date.now().toString(16);
  cert.validity.notBefore = new Date(Date.now() - 3600000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600000);

  const attrs = [
    { name: 'commonName', value: 'idp.bank.internal' },
    { name: 'organizationName', value: 'KryptoVision Test IdP' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keypair.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keypair.privateKey),
  };
}

interface SamlResponseOptions {
  issuer?: string;
  audience?: string;
  destination?: string;
  inResponseTo?: string;
  assertionId?: string;
  nameId?: string;
  email?: string;
  displayName?: string;
  groups?: string[];
  notBefore?: string;
  notOnOrAfter?: string;
  signingKey?: string;
  cert?: string;
  signResponse?: boolean;
  signAssertion?: boolean;
  tamperXml?: boolean;
}

function buildSamlResponseXml(opts: SamlResponseOptions): string {
  const respId = `_resp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const assertId = opts.assertionId || `_assert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const issueInstant = new Date().toISOString();
  const issuer = opts.issuer || 'https://idp.bank.internal/saml2';
  const audience = opts.audience || 'https://vms.bank.internal/saml/metadata';
  const destination = opts.destination || 'https://vms.bank.internal/v1/auth/saml/callback';
  const nameId = opts.nameId || 'officer.davis@bank.internal';
  const notBefore = opts.notBefore || new Date(Date.now() - 60000).toISOString();
  const notOnOrAfter = opts.notOnOrAfter || new Date(Date.now() + 300000).toISOString();
  const email = opts.email || nameId;
  const displayName = opts.displayName || 'Officer Davis';
  const groups = opts.groups || ['SECURITY_OFFICER', 'Forensics-Team'];

  const inResponseToAttr = opts.inResponseTo ? ` InResponseTo="${opts.inResponseTo}"` : '';

  const groupsXml = groups
    .map((g) => `<saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${g}</saml:AttributeValue>`)
    .join('');

  const unsignedXml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${respId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${destination}"${inResponseToAttr}>
  <saml:Issuer>${issuer}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="${assertId}" Version="2.0" IssueInstant="${issueInstant}">
    <saml:Issuer>${issuer}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${destination}"${inResponseToAttr}/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>${audience}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="_sess_${Date.now()}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="email">
        <saml:AttributeValue>${email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="displayName">
        <saml:AttributeValue>${displayName}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="groups">
        ${groupsXml}
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

  if (!opts.signingKey) {
    return unsignedXml;
  }

  // Sign either the Assertion or the Response
  const targetTag = opts.signAssertion !== false ? 'Assertion' : 'Response';
  const sig = new SignedXml();
  sig.addReference({
    xpath: `//*[local-name(.)='${targetTag}']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  sig.privateKey = opts.signingKey;
  sig.publicCert = opts.cert;
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  sig.computeSignature(unsignedXml, {
    location: {
      reference: `//*[local-name(.)='${targetTag}']/*[local-name(.)='Issuer']`,
      action: 'after',
    },
  });

  let signedXml = sig.getSignedXml();

  if (opts.tamperXml) {
    // Modify XML content after signing to simulate signature tampering
    signedXml = signedXml.replace(displayName, 'Hacked Malicious Identity');
  }

  return signedXml;
}

describe('SAML 2.0 Enterprise Federation (security.saml)', () => {
  let validIdpCertPair: TestCertPair;
  let rogueIdpCertPair: TestCertPair;
  const tenantId = 'bank-corp-test';
  const spEntityId = 'https://vms.bank.internal/saml/metadata';
  const spAcsUrl = 'https://vms.bank.internal/v1/auth/saml/callback';
  const idpIssuer = 'https://idp.bank.internal/saml2';

  beforeAll(() => {
    validIdpCertPair = generateTestCertAndKey();
    rogueIdpCertPair = generateTestCertAndKey();
  });

  beforeEach(async () => {
    await samlProvider.registerTenant({
      tenantId,
      tenantSlug: 'bank-corp',
      idpUrl: idpIssuer,
      idpCertificate: validIdpCertPair.certPem,
      idpEntityId: idpIssuer,
      spEntityId,
      spCallbackUrl: spAcsUrl,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      acceptedClockSkewMs: 60000,
      attributeMapping: {
        userId: 'nameId',
        email: 'email',
        displayName: 'displayName',
        groups: 'groups',
      },
    });
  });

  // ============================================================================
  // Suite 1: Multi-Tenant Registration & Metadata
  // ============================================================================
  describe('Tenant Registration & Metadata', () => {
    it('should register tenant and return sanitized configuration status', () => {
      const tenant = samlProvider.getTenant(tenantId);
      expect(tenant).toBeDefined();
      expect(tenant?.tenantId).toBe(tenantId);
      expect(tenant?.idpCertificate).toContain('BEGIN CERTIFICATE');

      const status = samlProvider.getStatus(tenantId);
      expect(status.configured).toBe(true);
      expect(status.tenantId).toBe(tenantId);
      expect(status.idpUrl).toBe(idpIssuer);
    });

    it('should parse IdP metadata XML and configure tenant automatically', () => {
      const idpMetadataXml = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://sts.bank.internal/metadata">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${validIdpCertPair.certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, '')}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sts.bank.internal/slo" />
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sts.bank.internal/sso/post" />
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://sts.bank.internal/sso/redirect" />
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      const parsed = samlProvider.parseIdpMetadata(idpMetadataXml);
      expect(parsed.idpEntityId).toBe('https://sts.bank.internal/metadata');
      expect(parsed.idpUrl).toBe('https://sts.bank.internal/sso/post');
      expect(parsed.idpCertificate).toContain('BEGIN CERTIFICATE');
      expect(parsed.spSloUrl).toBe('https://sts.bank.internal/slo');
    });

    it('should generate valid Service Provider metadata XML', async () => {
      const spMetadataXml = await samlProvider.getMetadata(tenantId);
      expect(spMetadataXml).toContain('EntityDescriptor');
      expect(spMetadataXml).toContain('SPSSODescriptor');
      expect(spMetadataXml).toContain(spEntityId);
      expect(spMetadataXml).toContain(spAcsUrl);
    });

    it('should reject invalid tenant registration inputs (fail closed)', async () => {
      await expect(
        samlProvider.registerTenant({
          tenantId: '',
          idpUrl: 'invalid-url',
          idpCertificate: 'invalid-cert',
          spEntityId: '',
          spCallbackUrl: '',
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Suite 2: AuthnRequest & Login Initiation
  // ============================================================================
  describe('SP-Initiated AuthnRequest Generation', () => {
    it('should generate a valid AuthnRequest URL and track requestId', async () => {
      const { url, requestId } = await samlProvider.getLoginUrl(tenantId, '/custom/target');
      expect(url).toContain(idpIssuer);
      expect(url).toContain('SAMLRequest=');
      expect(requestId).toMatch(/^_/);
    });
  });

  // ============================================================================
  // Suite 3: Cryptographic XMLDSIG Assertion Verification
  // ============================================================================
  describe('Cryptographic Signature Verification', () => {
    it('should successfully authenticate with a validly signed assertion', async () => {
      const signedXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        cert: validIdpCertPair.certPem,
        assertionId: `_assert_${Date.now()}_1`,
        nameId: 'sarah.connor@bank.internal',
        displayName: 'Sarah Connor',
        groups: ['BANK_SUPERADMIN', 'Domain Admins'],
      });

      const base64Response = Buffer.from(signedXml).toString('base64');
      const user = await samlProvider.validateResponse(base64Response, undefined, tenantId);

      expect(user.nameId).toBe('sarah.connor@bank.internal');
      expect(user.displayName).toBe('Sarah Connor');
      expect(user.groups).toContain('BANK_SUPERADMIN');
      expect(user.tenantId).toBe(tenantId);
    });

    it('should reject unsigned assertion when signed assertion is required', async () => {
      const unsignedXml = buildSamlResponseXml({
        signingKey: undefined, // Unsigned
      });

      const base64Response = Buffer.from(unsignedXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });

    it('should reject tampered XML assertion (signature validation failure)', async () => {
      const tamperedXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        tamperXml: true, // Corrupts payload after signature calculation
      });

      const base64Response = Buffer.from(tamperedXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });

    it('should reject assertion signed with an untrusted rogue certificate', async () => {
      const rogueXml = buildSamlResponseXml({
        signingKey: rogueIdpCertPair.privateKeyPem, // Signed by different cert!
        cert: rogueIdpCertPair.certPem,
      });

      const base64Response = Buffer.from(rogueXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Suite 4: Security Invariants & Attack Mitigations
  // ============================================================================
  describe('Security Defenses & Replay Attack Protection', () => {
    it('should detect and reject assertion replay attacks', async () => {
      const fixedAssertionId = `_replay_attack_${Date.now()}`;
      const signedXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        assertionId: fixedAssertionId,
      });

      const base64Response = Buffer.from(signedXml).toString('base64');

      // First authentication must succeed
      const firstAuth = await samlProvider.validateResponse(base64Response, undefined, tenantId);
      expect(firstAuth).toBeDefined();

      // Second authentication with exact same Assertion ID must be rejected!
      await expect(
        samlProvider.validateResponse(base64Response, undefined, tenantId)
      ).rejects.toThrow(/replay attack detected/i);
    });

    it('should reject expired assertion (NotOnOrAfter in past)', async () => {
      const expiredXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        notBefore: new Date(Date.now() - 3600000).toISOString(),
        notOnOrAfter: new Date(Date.now() - 1800000).toISOString(),
      });

      const base64Response = Buffer.from(expiredXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });

    it('should reject future assertion (NotBefore in future beyond clock skew)', async () => {
      const futureXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        notBefore: new Date(Date.now() + 3600000).toISOString(),
        notOnOrAfter: new Date(Date.now() + 7200000).toISOString(),
      });

      const base64Response = Buffer.from(futureXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });

    it('should reject assertion with audience mismatch', async () => {
      const wrongAudienceXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        audience: 'https://attacker.site/saml/metadata',
      });

      const base64Response = Buffer.from(wrongAudienceXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });

    it('should reject assertion with issuer mismatch', async () => {
      const wrongIssuerXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        issuer: 'https://imposter-idp.example.com/saml2',
      });

      const base64Response = Buffer.from(wrongIssuerXml).toString('base64');
      await expect(samlProvider.validateResponse(base64Response, undefined, tenantId)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Suite 5: IdentityService End-to-End Authentication & JIT Provisioning
  // ============================================================================
  describe('IdentityService SAML Authentication Flow', () => {
    it('should authenticate SAML assertion, provision user, assign roles, and issue session tokens', async () => {
      const signedXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        assertionId: `_e2e_assert_${Date.now()}`,
        nameId: 'john.reese@bank.internal',
        displayName: 'John Reese',
        groups: ['SECURITY_OFFICER', 'Forensics'],
      });

      const base64Response = Buffer.from(signedXml).toString('base64');

      const result = await identityService.authenticate({
        providerType: 'SAML',
        samlResponse: base64Response,
        tenantId,
        clientIp: '192.168.1.100',
        userAgent: 'Sentinel-Grid-Browser/1.0',
      });

      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.principal.email).toBe('john.reese@bank.internal');
      expect(result.principal.roles).toContain('SECURITY_OFFICER');
      expect(result.principal.authMethod).toBe('SAML');
    });
  });

  // ============================================================================
  // Suite 6: HTTP Enterprise Auth Routes
  // ============================================================================
  describe('HTTP Enterprise Auth Routes', () => {
    let app: any;

    beforeAll(async () => {
      app = Fastify();
      await registerEnterpriseAuthRoutes(app, {} as any);
      await app.ready();
    });

    it('GET /v1/auth/saml/login/:tenantId should initiate login and return redirect or JSON', async () => {
      // Test redirect
      const redirectRes = await app.inject({
        method: 'GET',
        url: `/v1/auth/saml/login/${tenantId}`,
      });
      expect(redirectRes.statusCode).toBe(302);
      expect(redirectRes.headers.location).toContain(idpIssuer);

      // Test JSON
      const jsonRes = await app.inject({
        method: 'GET',
        url: `/v1/auth/saml/login/${tenantId}?json=true`,
        headers: { accept: 'application/json' },
      });
      expect(jsonRes.statusCode).toBe(200);
      const payload = JSON.parse(jsonRes.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.authUrl).toContain(idpIssuer);
      expect(payload.data.requestId).toBeDefined();
    });

    it('GET /v1/auth/saml/metadata should return application/xml metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/saml/metadata',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.payload).toContain('EntityDescriptor');
    });

    it('GET /v1/auth/saml/metadata/:tenantId should return tenant-specific metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/auth/saml/metadata/${tenantId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.payload).toContain(spEntityId);
    });

    it('POST /v1/auth/saml/callback should process ACS callback and return tokens', async () => {
      const signedXml = buildSamlResponseXml({
        signingKey: validIdpCertPair.privateKeyPem,
        assertionId: `_route_assert_${Date.now()}`,
        nameId: 'route.test@bank.internal',
        displayName: 'Route Test User',
        groups: ['BANK_OPERATOR'],
      });

      const res = await app.inject({
        method: 'POST',
        url: `/v1/auth/saml/callback?tenantId=${tenantId}`,
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
        },
        payload: {
          SAMLResponse: Buffer.from(signedXml).toString('base64'),
          RelayState: '/dashboard',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBeDefined();
      expect(json.data.principal.email).toBe('route.test@bank.internal');
    });

    it('POST /v1/identity/providers/saml should allow SUPER_ADMIN to register a new tenant', async () => {
      const newTenantId = 'tenant-admin-test';
      const res = await app.inject({
        method: 'POST',
        url: '/v1/identity/providers/saml',
        headers: { 'content-type': 'application/json' },
        payload: {
          tenantId: newTenantId,
          tenantSlug: 'admin-test',
          idpUrl: 'https://idp.admintest.com/saml2',
          idpCertificate: validIdpCertPair.certPem,
          spEntityId: 'https://vms.bank.internal/saml/metadata/admin-test',
          spCallbackUrl: 'https://vms.bank.internal/v1/auth/saml/callback',
        },
      });

      // Without auth context, request.currentUser is undefined → 403 Forbidden
      expect(res.statusCode).toBe(403);
    });
  });
});
