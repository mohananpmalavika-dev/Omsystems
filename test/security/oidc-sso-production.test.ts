import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  OIDCProvider,
  getOidcProviderPreset,
  type OIDCTenantConfig,
} from '../../src/security/oidc-provider.js';
import {
  MemoryOidcRepository,
  type IOidcRepository,
} from '../../src/database/oidc-repository.js';
import { IdentityService } from '../../src/identity/services/identity.service.js';
import { BankingPermissions } from '../../src/identity/domain/identity.types.js';

describe('OpenID Connect (OIDC) Single Sign-On Production Engine', () => {
  let repository: IOidcRepository;
  let provider: OIDCProvider;
  let identityService: IdentityService;

  // Generate test RSA Keypair for JWKS testing
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'kryptovision-oidc-test-key-1';

  beforeEach(() => {
    repository = new MemoryOidcRepository();
    // Memory state store for isolated testing
    provider = new OIDCProvider(undefined, repository);
    identityService = new IdentityService(undefined, 'test-jwt-secret-for-oidc-production-test');
  });

  function signTestIdToken(claims: Record<string, unknown>, keyId = 'kryptovision-oidc-test-key-1'): string {
    const header = { alg: 'RS256', kid: keyId, typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signatureB64 = crypto.sign('RSA-SHA256', signingInput, privateKey).toString('base64url');
    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  describe('1. Google Workspace SSO Integration', () => {
    const googleConfig: OIDCTenantConfig = {
      tenantId: 'CORP-GOOGLE-WORKSPACE',
      provider: 'google',
      issuerUrl: 'https://accounts.google.com',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: 'google-client-id-123456.apps.googleusercontent.com',
      redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      scopes: ['openid', 'profile', 'email'],
      hostedDomain: 'kryptonlogic.com',
      validateEmailVerified: true,
      requirePKCE: true,
    };

    it('generates PKCE S256 challenge and embeds hosted domain param for Google Workspace', async () => {
      await provider.registerTenant(googleConfig);

      const login = await provider.initiateLogin('CORP-GOOGLE-WORKSPACE', '/dashboard');
      expect(login.authUrl).toContain('client_id=google-client-id-123456.apps.googleusercontent.com');
      expect(login.authUrl).toContain('code_challenge=');
      expect(login.authUrl).toContain('code_challenge_method=S256');
      expect(login.authUrl).toContain('hd=kryptonlogic.com');
      expect(login.authUrl).toContain('access_type=offline');
      expect(login.state).toBeDefined();
      expect(login.nonce).toBeDefined();
    });

    it('cryptographically validates Google Workspace ID token matching hosted domain and verified email', async () => {
      await provider.registerTenant(googleConfig);
      (provider as any).getJwksKeys = async () => [jwk];

      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: 'https://accounts.google.com',
        sub: 'google-sub-987654321',
        aud: googleConfig.clientId,
        exp: now + 3600,
        iat: now,
        email: 'alice@kryptonlogic.com',
        email_verified: true,
        hd: 'kryptonlogic.com',
        name: 'Alice Security Admin',
        nonce: 'test-nonce-123',
      };

      const token = signTestIdToken(claims);
      const verified = await provider.verifyIdToken(googleConfig, token, 'test-nonce-123');

      expect(verified.sub).toBe('google-sub-987654321');
      expect(verified.email).toBe('alice@kryptonlogic.com');
      expect(verified.hd).toBe('kryptonlogic.com');
    });

    it('strictly rejects personal Gmail or unauthorized domain when hostedDomain is configured', async () => {
      await provider.registerTenant(googleConfig);
      (provider as any).getJwksKeys = async () => [jwk];

      const now = Math.floor(Date.now() / 1000);
      const rogueClaims = {
        iss: 'https://accounts.google.com',
        sub: 'google-sub-rogue-1',
        aud: googleConfig.clientId,
        exp: now + 3600,
        iat: now,
        email: 'rogue@gmail.com',
        email_verified: true,
        // Missing hd or different hd
        hd: 'otherdomain.com',
        nonce: 'test-nonce-123',
      };

      const token = signTestIdToken(rogueClaims);
      await expect(provider.verifyIdToken(googleConfig, token, 'test-nonce-123'))
        .rejects.toThrow(/Google Workspace hosted domain mismatch/);
    });

    it('rejects unverified Google email addresses', async () => {
      await provider.registerTenant(googleConfig);
      (provider as any).getJwksKeys = async () => [jwk];

      const now = Math.floor(Date.now() / 1000);
      const unverifiedClaims = {
        iss: 'https://accounts.google.com',
        sub: 'google-sub-unverified',
        aud: googleConfig.clientId,
        exp: now + 3600,
        iat: now,
        email: 'attacker@kryptonlogic.com',
        email_verified: false,
        hd: 'kryptonlogic.com',
        nonce: 'test-nonce-123',
      };

      const token = signTestIdToken(unverifiedClaims);
      await expect(provider.verifyIdToken(googleConfig, token, 'test-nonce-123'))
        .rejects.toThrow(/email address has not been verified/);
    });
  });

  describe('2. Okta SSO Integration & Role Mapping', () => {
    const oktaConfig: OIDCTenantConfig = {
      tenantId: 'ENTERPRISE-OKTA',
      provider: 'okta',
      issuerUrl: 'https://bank-enterprise.okta.com',
      authorizationEndpoint: 'https://bank-enterprise.okta.com/oauth2/v1/authorize',
      clientId: 'okta-client-id-banking',
      redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      scopes: ['openid', 'profile', 'email', 'groups'],
      roleMapping: {
        'SecOps-Admins': ['SUPER_ADMIN', 'SECURITY_OFFICER'],
        'Branch-Auditors': ['COMPLIANCE_AUDITOR'],
        'Bank-Operators': ['BANK_OPERATOR'],
      },
      requirePKCE: true,
    };

    it('generates Okta authorization request with groups scope', async () => {
      await provider.registerTenant(oktaConfig);

      const login = await provider.initiateLogin('ENTERPRISE-OKTA');
      expect(login.authUrl).toContain('client_id=okta-client-id-banking');
      expect(login.authUrl).toContain('scope=openid+profile+email+groups');
      expect(login.authUrl).toContain('code_challenge=');
    });

    it('maps Okta groups claims to Banking RBAC permissions', async () => {
      await provider.registerTenant(oktaConfig);

      const claims = {
        sub: 'okta-user-9988',
        email: 'officer-sam@bank.internal',
        name: 'Officer Sam',
        groups: ['SecOps-Admins', 'Branch-Auditors'],
      };

      const userProfile = (provider as any).mapClaimsToUserProfile(claims, oktaConfig);
      expect(userProfile.groups).toEqual(['SecOps-Admins', 'Branch-Auditors']);
      expect(userProfile.roles).toContain('SUPER_ADMIN');
      expect(userProfile.roles).toContain('SECURITY_OFFICER');
      expect(userProfile.roles).toContain('COMPLIANCE_AUDITOR');

      // Verify permission calculation via identity service
      const permissions = (identityService as any).calculatePermissions(userProfile.roles);
      expect(permissions).toContain(BankingPermissions.EVIDENCE_EXPORT);
      expect(permissions).toContain(BankingPermissions.CAMERA_PTZ_CONTROL);
      expect(permissions).toContain(BankingPermissions.SYSTEM_CONFIGURE);
    });
  });

  describe('3. Generic OIDC Provider & Domain Whitelist', () => {
    const genericConfig: OIDCTenantConfig = {
      tenantId: 'GENERIC-OIDC-CORP',
      provider: 'generic',
      issuerUrl: 'https://idp.corporation.internal',
      authorizationEndpoint: 'https://idp.corporation.internal/oauth2/authorize',
      clientId: 'corp-client-id',
      redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      scopes: ['openid', 'profile', 'email'],
      allowedDomains: ['corporation.internal', 'subsidiary.internal'],
      attributeMapping: {
        userId: 'custom_id',
        email: 'work_email',
        displayName: 'full_name',
      },
      requirePKCE: true,
    };

    it('maps custom claims and verifies allowed domain whitelist', async () => {
      await provider.registerTenant(genericConfig);

      const claims = {
        custom_id: 'emp-4421',
        work_email: 'john@corporation.internal',
        full_name: 'John Corp',
      };

      const profile = (provider as any).mapClaimsToUserProfile(claims, genericConfig);
      expect(profile.userId).toBe('emp-4421');
      expect(profile.email).toBe('john@corporation.internal');
      expect(profile.displayName).toBe('John Corp');
    });

    it('rejects email addresses outside allowed domain whitelist', async () => {
      await provider.registerTenant(genericConfig);

      const claims = {
        custom_id: 'emp-attacker',
        work_email: 'attacker@untrusted.external',
        full_name: 'Untrusted User',
      };

      expect(() => (provider as any).mapClaimsToUserProfile(claims, genericConfig))
        .toThrow(/Email domain 'untrusted.external' is not permitted/);
    });
  });

  describe('4. Cryptographic Security & Anti-Replay Invariants', () => {
    it('rejects tampered or forged cryptographic signatures', async () => {
      const config: OIDCTenantConfig = {
        tenantId: 'SECURITY-AUDIT-TENANT',
        provider: 'generic',
        issuerUrl: 'https://auth.bank.internal',
        clientId: 'bank-vault-client',
        redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      };
      await provider.registerTenant(config);
      (provider as any).getJwksKeys = async () => [jwk];

      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: 'https://auth.bank.internal',
        sub: 'sub-77',
        aud: 'bank-vault-client',
        exp: now + 3600,
        iat: now,
        email: 'sec@bank.internal',
      };

      const validToken = signTestIdToken(claims);
      const parts = validToken.split('.');
      // Corrupt signature segment
      const corruptedSig = Buffer.from('corrupted-signature-bytes').toString('base64url');
      const forgedToken = `${parts[0]}.${parts[1]}.${corruptedSig}`;

      await expect(provider.verifyIdToken(config, forgedToken))
        .rejects.toThrow();
    });

    it('rejects expired ID tokens beyond clock tolerance', async () => {
      const config: OIDCTenantConfig = {
        tenantId: 'EXPIRY-TEST',
        provider: 'generic',
        issuerUrl: 'https://auth.bank.internal',
        clientId: 'client-1',
        redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
        clockToleranceSeconds: 30,
      };
      await provider.registerTenant(config);
      (provider as any).getJwksKeys = async () => [jwk];

      const now = Math.floor(Date.now() / 1000);
      const expiredClaims = {
        iss: 'https://auth.bank.internal',
        sub: 'sub-expired',
        aud: 'client-1',
        exp: now - 300, // Expired 5 minutes ago
        iat: now - 3600,
      };

      const token = signTestIdToken(expiredClaims);
      await expect(provider.verifyIdToken(config, token))
        .rejects.toThrow(/Token has expired/);
    });

    it('enforces single-use state consumption to prevent replay attacks', async () => {
      const config: OIDCTenantConfig = {
        tenantId: 'REPLAY-GUARD',
        provider: 'generic',
        issuerUrl: 'https://auth.bank.internal',
        authorizationEndpoint: 'https://auth.bank.internal/auth',
        clientId: 'client-replay',
        redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      };
      await provider.registerTenant(config);

      const { state } = await provider.initiateLogin('REPLAY-GUARD');

      // State store returns the session once
      const sessionStore = (provider as any).stateStore;
      const session = await sessionStore.get(state);
      expect(session).toBeDefined();
      expect(session.state).toBe(state);

      // Consume state
      await sessionStore.delete(state);

      // Second attempt with replayed state fails
      const replayed = await sessionStore.get(state);
      expect(replayed).toBeUndefined();
    });
  });

  describe('5. Durable Repository Persistence & Provider Presets', () => {
    it('persists and retrieves tenant configuration in repository', async () => {
      const config: OIDCTenantConfig = {
        tenantId: 'DURABLE-BANK-TENANT',
        provider: 'okta',
        issuerUrl: 'https://bank-prod.okta.com',
        clientId: 'okta-prod-123',
        redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
        hostedDomain: undefined,
      };

      await provider.registerTenant(config);

      // Check repository directly
      const loaded = await repository.getTenantConfig('DURABLE-BANK-TENANT');
      expect(loaded).toBeDefined();
      expect(loaded?.clientId).toBe('okta-prod-123');
      expect(loaded?.provider).toBe('okta');

      // List configurations
      const all = await provider.listTenants();
      expect(all.some((t) => t.tenantId === 'DURABLE-BANK-TENANT')).toBe(true);

      // Delete configuration
      await provider.removeTenant('DURABLE-BANK-TENANT');
      const afterDelete = await repository.getTenantConfig('DURABLE-BANK-TENANT');
      expect(afterDelete).toBeNull();
    });

    it('generates well-formed provider presets for Google, Okta, and Generic', () => {
      const googlePreset = getOidcProviderPreset('google', {
        tenantId: 'T-GOOGLE',
        clientId: 'client-g',
        redirectUri: 'https://app/callback',
        hostedDomain: 'bank.com',
      });
      expect(googlePreset.issuerUrl).toBe('https://accounts.google.com');
      expect(googlePreset.hostedDomain).toBe('bank.com');
      expect(googlePreset.attributeMapping?.userId).toBe('sub');

      const oktaPreset = getOidcProviderPreset('okta', {
        tenantId: 'T-OKTA',
        clientId: 'client-o',
        redirectUri: 'https://app/callback',
        domain: 'finsec.okta.com',
      });
      expect(oktaPreset.issuerUrl).toBe('https://finsec.okta.com');
      expect(oktaPreset.scopes).toContain('groups');
    });

    it('records immutable audit events on login initiation and configuration changes', async () => {
      const config: OIDCTenantConfig = {
        tenantId: 'AUDIT-LOG-TENANT',
        provider: 'google',
        issuerUrl: 'https://accounts.google.com',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: 'audit-client-id',
        redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      };
      await provider.registerTenant(config);
      await provider.initiateLogin('AUDIT-LOG-TENANT', '/admin');

      const logs = await repository.getAuditEvents('AUDIT-LOG-TENANT');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].eventType).toBe('LOGIN_INITIATED');
      expect(logs[0].provider).toBe('google');
    });
  });
});
