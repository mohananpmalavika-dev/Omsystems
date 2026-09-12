import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OIDCIdentityAdapter } from '../../src/identity/adapters/oidc.adapter.js';
import type { IdentityProvider, OIDCProviderConfiguration } from '../../src/identity/domain/identity-provider.js';
import { oidcProvider } from '../../src/security/oidc-provider.js';

describe('OIDC Identity Adapter (Enterprise Integration)', () => {
  let adapter: OIDCIdentityAdapter;

  beforeEach(() => {
    adapter = new OIDCIdentityAdapter();
  });

  const validConfig: OIDCProviderConfiguration = {
    type: 'OIDC',
    enabled: true,
    name: 'Google Workspace Enterprise',
    issuer: 'https://accounts.google.com',
    clientId: 'test-google-client-id',
    clientSecretRef: 'secret-ref-1',
    redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
  };

  const testProvider: IdentityProvider = {
    id: 'idp-google-corp',
    tenantId: 'BANK-001',
    configuration: validConfig,
    provisioning: {
      jitEnabled: true,
      allowedDomains: ['kryptonlogic.com'],
      defaultRole: 'BANK_OPERATOR',
    } as any,
    authorization: {} as any,
    security: {} as any,
  };

  it('declares adapter type as OIDC with comprehensive enterprise capabilities', () => {
    expect(adapter.type).toBe('OIDC');

    const capabilities = adapter.getCapabilities();
    expect(capabilities.jitProvisioning).toBe(true);
    expect(capabilities.groupClaims).toBe(true);
    expect(capabilities.interactiveLogin).toBe(true);
    expect(capabilities.mfaAssurance).toBe(true);
  });

  it('validates provider configuration enforcing HTTPS in production', () => {
    const valid = adapter.validateConfiguration(testProvider);
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalidProvider: IdentityProvider = {
      ...testProvider,
      configuration: {
        ...validConfig,
        issuer: 'invalid-url',
        clientId: '',
      },
    };

    const invalid = adapter.validateConfiguration(invalidProvider);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('checks readiness and reports status READY for fully configured providers', () => {
    const readiness = adapter.checkReadiness(testProvider);
    expect(readiness.ready).toBe(true);

    const unreadyProvider: IdentityProvider = {
      ...testProvider,
      configuration: {
        ...validConfig,
        issuer: '',
      },
    };

    const unreadiness = adapter.checkReadiness(unreadyProvider);
    expect(unreadiness.ready).toBe(false);
    expect(unreadiness.reasons?.length).toBeGreaterThan(0);
  });

  it('executes health check with provider discovery and reports latency and status', async () => {
    // Mock discovery on oidcProvider
    const testDiscoverySpy = vi.spyOn(oidcProvider, 'testDiscovery').mockResolvedValueOnce({
      healthy: true,
      tenantId: 'idp-google-corp',
      provider: 'google',
      issuer: 'https://accounts.google.com',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      latencyMs: 42,
    });

    const health = await adapter.healthCheck(testProvider);
    expect(health.status).toBe('HEALTHY');
    expect(health.checks.length).toBeGreaterThan(0);
    expect(health.checks[0].status).toBe('PASS');

    testDiscoverySpy.mockRestore();
  });

  it('normalizes OIDC profile to VerifiedExternalIdentity with MFA assurance', () => {
    const profile = {
      userId: 'oidc-user-123',
      email: 'investigator@bank.internal',
      displayName: 'Lead Investigator',
      firstName: 'Lead',
      lastName: 'Investigator',
      groups: ['ForensicTeam', 'SecurityOfficers'],
      hostedDomain: 'bank.internal',
      rawClaims: {
        sub: 'oidc-user-123',
        email: 'investigator@bank.internal',
        email_verified: true,
        amr: ['pwd', 'fido', 'mfa'],
        acr: 'urn:mace:incommon:iap:silver',
      },
    };

    const normalized = (adapter as any).normalizeProfile(testProvider.id, validConfig, profile);
    expect(normalized.providerId).toBe(testProvider.id);
    expect(normalized.providerType).toBe('OIDC');
    expect(normalized.subject).toBe('oidc-user-123');
    expect(normalized.email).toBe('investigator@bank.internal');
    expect(normalized.emailVerified).toBe(true);
    expect(normalized.groups).toEqual(['ForensicTeam', 'SecurityOfficers']);
    expect(normalized.assurance.mfa).toBe(true);
    expect(normalized.assurance.phishingResistant).toBe(true); // fido detected
  });
});
