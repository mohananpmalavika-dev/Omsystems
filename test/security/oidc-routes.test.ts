import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerEnterpriseAuthRoutes } from '../../src/routes/auth-enterprise.routes.js';
import { oidcProvider } from '../../src/security/oidc-provider.js';

describe('OIDC Enterprise Authentication Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // Mock currentUser decoration for testing
    app.decorateRequest('currentUser', null);
    app.addHook('preHandler', async (request: any) => {
      const authHeader = request.headers['authorization'];
      if (authHeader === 'Bearer superadmin-token') {
        request.currentUser = {
          userId: 'user-superadmin',
          username: 'superadmin',
          isSuperAdmin: true,
          roles: ['SUPER_ADMIN'],
          tenantId: 'BANK-ROOT',
        };
      } else if (authHeader === 'Bearer operator-token') {
        request.currentUser = {
          userId: 'user-operator',
          username: 'operator-1',
          isSuperAdmin: false,
          roles: ['BANK_OPERATOR'],
          tenantId: 'BANK-ROOT',
        };
      }
    });

    const mockStore: any = {};
    await registerEnterpriseAuthRoutes(app, mockStore);
    await app.ready();

    // Register a test tenant
    await oidcProvider.registerTenant({
      tenantId: 'ROUTE-TEST-GOOGLE',
      provider: 'google',
      issuerUrl: 'https://accounts.google.com',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: 'google-client-test-id',
      clientSecret: 'secret-test-value',
      redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
      hostedDomain: 'bank.internal',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /v1/auth/oidc/login/:tenantId', () => {
    it('initiates login and redirects browser to OIDC IdP authorization endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/oidc/login/ROUTE-TEST-GOOGLE?redirect=/investigation/123',
      });

      expect(response.statusCode).toBe(302);
      const redirectLocation = response.headers.location;
      expect(redirectLocation).toBeDefined();
      expect(redirectLocation).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(redirectLocation).toContain('client_id=google-client-test-id');
      expect(redirectLocation).toContain('code_challenge=');
      expect(redirectLocation).toContain('code_challenge_method=S256');
      expect(redirectLocation).toContain('hd=bank.internal');
    });

    it('returns 500 when tenant is not configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/oidc/login/NON-EXISTENT-TENANT',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('oidc_initiation_failed');
    });
  });

  describe('GET /v1/identity/providers/oidc/presets', () => {
    it('returns pre-configured templates for Google Workspace, Okta, and Generic IdPs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/identity/providers/oidc/presets',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.google.issuerUrl).toBe('https://accounts.google.com');
      expect(body.data.okta.scopes).toContain('groups');
      expect(body.data.generic.provider).toBe('generic');
    });
  });

  describe('Admin Provider Management & RBAC Guard', () => {
    it('allows SUPER_ADMIN to register new OIDC provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/identity/providers/oidc',
        headers: {
          authorization: 'Bearer superadmin-token',
        },
        payload: {
          tenantId: 'NEW-OKTA-TENANT',
          provider: 'okta',
          issuerUrl: 'https://new-bank.okta.com',
          clientId: 'okta-new-client',
          clientSecret: 'super-secret',
          redirectUri: 'https://vms.bank.internal/v1/auth/oidc/callback',
          scopes: ['openid', 'profile', 'email', 'groups'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('NEW-OKTA-TENANT');
    });

    it('denies non-admin operators from registering OIDC providers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/identity/providers/oidc',
        headers: {
          authorization: 'Bearer operator-token',
        },
        payload: {
          tenantId: 'UNAUTHORIZED-TENANT',
          provider: 'generic',
          issuerUrl: 'https://auth.sample.com',
          clientId: 'client-1',
          redirectUri: 'https://vms.bank.internal/callback',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('retrieves tenant OIDC configuration with masked clientSecret', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/identity/providers/oidc/ROUTE-TEST-GOOGLE',
        headers: {
          authorization: 'Bearer superadmin-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.tenantId).toBe('ROUTE-TEST-GOOGLE');
      expect(body.data.clientId).toBe('google-client-test-id');
      expect(body.data.clientSecret).toBe('********'); // Redacted
    });

    it('removes tenant OIDC configuration on DELETE', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/identity/providers/oidc/ROUTE-TEST-GOOGLE',
        headers: {
          authorization: 'Bearer superadmin-token',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify it is removed
      const verifyGet = await app.inject({
        method: 'GET',
        url: '/v1/identity/providers/oidc/ROUTE-TEST-GOOGLE',
        headers: {
          authorization: 'Bearer superadmin-token',
        },
      });
      expect(verifyGet.statusCode).toBe(404);
    });

    it('performs live discovery health check via GET /v1/identity/providers/oidc/:tenantId/health', async () => {
      vi.spyOn(oidcProvider, 'testDiscovery').mockResolvedValueOnce({
        healthy: true,
        tenantId: 'ROUTE-TEST-GOOGLE',
        provider: 'google',
        issuer: 'https://accounts.google.com',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        latencyMs: 18,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/identity/providers/oidc/ROUTE-TEST-GOOGLE/health',
        headers: {
          authorization: 'Bearer superadmin-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.healthy).toBe(true);
      expect(body.data.latencyMs).toBe(18);
    });
  });
});
