import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityService } from '../src/identity/services/identity.service.js';
import { BankingPermissions } from '../src/identity/domain/identity.types.js';
import { oidcProvider } from '../src/security/oidc-provider.js';

describe('Enterprise Identity Platform (IAM)', () => {
  let identityService: IdentityService;

  beforeEach(() => {
    identityService = new IdentityService(undefined, 'test-jwt-secret-1234567890123456');
  });

  it('authenticates local operator and calculates banking RBAC permissions and session token', async () => {
    const res = await identityService.authenticate({
      providerType: 'LOCAL',
      tenantId: 'BANK-001',
      username: 'operator-kottarakkara',
      password: 'password123',
    });

    expect(res.success).toBe(true);
    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
    expect(res.principal.username).toBe('operator-kottarakkara');
    expect(res.principal.permissions).toContain(BankingPermissions.CAMERA_LIVE_VIEW);
    expect(res.principal.permissions).toContain(BankingPermissions.CAMERA_PLAYBACK_VIEW);
    expect(res.principal.permissions).toContain(BankingPermissions.ALERT_VIEW);
    expect(res.principal.permissions).not.toContain(BankingPermissions.CAMERA_CONFIGURE); // operator cannot configure
  });

  it('superadmin receives all banking permissions and ALL_BRANCHES scope', async () => {
    const res = await identityService.authenticate({
      providerType: 'LOCAL',
      tenantId: 'BANK-001',
      username: 'superadmin',
      password: 'admin-password',
    });

    expect(res.principal.roles).toContain('SUPER_ADMIN');
    expect(res.principal.scope.type).toBe('ALL_BRANCHES');
    expect(res.principal.permissions).toContain(BankingPermissions.USER_MANAGE);
    expect(res.principal.permissions).toContain(BankingPermissions.EVIDENCE_UNLOCK);
    expect(res.principal.permissions).toContain(BankingPermissions.SYSTEM_CONFIGURE);
  });

  it('authorizes actions respecting RBAC permissions and ABAC branch scopes', async () => {
    const res = await identityService.authenticate({
      providerType: 'LOCAL',
      tenantId: 'BANK-001',
      username: 'operator-1',
      password: 'pass',
    });

    // Operator has live view permission
    const canView = identityService.authorize(res.principal, BankingPermissions.CAMERA_LIVE_VIEW);
    expect(canView).toBe(true);

    // Operator does not have user management permission
    const canManageUser = identityService.authorize(res.principal, BankingPermissions.USER_MANAGE);
    expect(canManageUser).toBe(false);
  });

  it('supports rotating refresh token validation and revocation on logout', async () => {
    const authRes = await identityService.authenticate({
      providerType: 'LOCAL',
      tenantId: 'BANK-001',
      username: 'investigator-01',
      password: 'pass',
    });

    const refreshRes = await identityService.refreshSession(authRes.refreshToken);
    expect(refreshRes.accessToken).toBeDefined();
    expect(refreshRes.refreshToken).not.toBe(authRes.refreshToken); // Token rotated

    // Old refresh token must fail
    await expect(identityService.refreshSession(authRes.refreshToken)).rejects.toThrow('Invalid or expired refresh token');

    // Logout revokes session
    await identityService.logout(refreshRes.principal.sessionId, refreshRes.refreshToken);
    await expect(identityService.refreshSession(refreshRes.refreshToken)).rejects.toThrow('Invalid or expired refresh token');
  });

  it('OIDC provider initiates Authorization Code flow with PKCE challenge', async () => {
    await oidcProvider.registerTenant({
      tenantId: 'BANK-ENTRA-ID',
      provider: 'azure-ad',
      issuerUrl: 'https://login.microsoftonline.com/bank-tenant/v2.0',
      clientId: 'client-12345',
      redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      requirePKCE: true,
    });

    const { authUrl, state, nonce } = await oidcProvider.initiateLogin('BANK-ENTRA-ID', '/dashboard');
    expect(authUrl).toContain('client_id=client-12345');
    expect(authUrl).toContain('code_challenge=');
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(state).toBeDefined();
    expect(nonce).toBeDefined();
  });
});
