/**
 * Enterprise Authentication Routes
 * 
 * Provides endpoints for:
 * - SAML 2.0 SSO (Initiate, Callback, Metadata)
 * - OpenID Connect / Entra ID (Initiate, Callback, Token Exchange)
 * - LDAP / Active Directory
 * - Local Authentication
 * - Token Refresh & Revocation
 * - Identity Provider Management (Admin protected)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { identityService } from '../identity/services/identity.service.js';
import { oidcProvider } from '../security/oidc-provider.js';
import { samlProvider } from '../security/saml-provider.js';
import { BankingPermissions } from '../identity/domain/identity.types.js';

const samlCallbackSchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
});

const oidcLoginParamsSchema = z.object({
  tenantId: z.string().min(1),
});

const oidcCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().min(1),
  id_token: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const ldapLoginSchema = z.object({
  tenantId: z.string().min(1).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

const localLoginSchema = z.object({
  tenantId: z.string().min(1).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32),
});

const logoutSchema = z.object({
  sessionId: z.string().min(1),
  refreshToken: z.string().optional(),
});

const registerOidcConfigSchema = z.object({
  tenantId: z.string().min(1),
  provider: z.enum(['azure-ad', 'okta', 'auth0', 'keycloak', 'google', 'generic']),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).optional(),
});

export async function registerEnterpriseAuthRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // ============================================================================
  // SAML 2.0 Routes
  // ============================================================================

  /**
   * GET /v1/auth/saml/login/:tenantId
   * Initiate SAML SSO login
   */
  app.get('/v1/auth/saml/login/:tenantId', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    const { redirect } = z.object({ redirect: z.string().optional() }).parse(request.query);

    try {
      const { url } = await samlProvider.getLoginUrl(redirect || '/dashboard');
      return reply.redirect(url);
    } catch (error: any) {
      request.log.error({ error: error?.message, tenantId }, 'SAML login initiation failed');
      return reply.code(500).send({ error: 'saml_initiation_failed', message: error?.message });
    }
  });

  /**
   * POST /v1/auth/saml/callback
   * Handle SAML assertion callback from IdP
   */
  app.post('/v1/auth/saml/callback', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const body = samlCallbackSchema.parse(request.body);

    try {
      const authResult = await identityService.authenticate({
        providerType: 'SAML',
        samlResponse: body.SAMLResponse,
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      const redirectTarget = body.RelayState || '/dashboard';
      const separator = redirectTarget.includes('?') ? '&' : '?';
      return reply.redirect(`${redirectTarget}${separator}token=${authResult.accessToken}&refreshToken=${authResult.refreshToken}`);
    } catch (error: any) {
      request.log.error({ error: error?.message }, 'SAML callback authentication failed');
      return reply.redirect(`/login?error=saml_authentication_failed&reason=${encodeURIComponent(error?.message || '')}`);
    }
  });

  /**
   * GET /v1/auth/saml/metadata
   * Returns SP SAML metadata XML
   */
  app.get('/v1/auth/saml/metadata', {
    config: { noAuth: true },
  }, async (_request, reply) => {
    const metadata = samlProvider.getMetadata();
    return reply.type('application/xml').send(metadata);
  });

  // ============================================================================
  // OpenID Connect (OIDC) / Azure AD Routes
  // ============================================================================

  /**
   * GET /v1/auth/oidc/login/:tenantId
   * Initiate OIDC login with PKCE
   */
  app.get('/v1/auth/oidc/login/:tenantId', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const { tenantId } = oidcLoginParamsSchema.parse(request.params);
    const { redirect } = z.object({ redirect: z.string().optional() }).parse(request.query);

    try {
      const { authUrl } = await oidcProvider.initiateLogin(tenantId, redirect);
      return reply.redirect(authUrl);
    } catch (error: any) {
      request.log.error({ error: error?.message, tenantId }, 'OIDC initiation failed');
      return reply.code(500).send({ error: 'oidc_initiation_failed', message: error?.message });
    }
  });

  /**
   * GET/POST /v1/auth/oidc/callback
   * Handle OIDC Authorization Code callback
   */
  const handleOidcCallback = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.method === 'POST' ? request.body : request.query;
    const body = oidcCallbackSchema.parse(params);

    try {
      const authResult = await identityService.authenticate({
        providerType: 'OIDC',
        oidcCallback: {
          code: body.code,
          state: body.state,
          id_token: body.id_token,
        },
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(200).send({
        success: true,
        data: authResult,
      });
    } catch (error: any) {
      request.log.error({ error: error?.message }, 'OIDC callback authentication failed');
      return reply.code(401).send({ error: 'oidc_authentication_failed', message: error?.message });
    }
  };

  app.get('/v1/auth/oidc/callback', { config: { noAuth: true } }, handleOidcCallback);
  app.post('/v1/auth/oidc/callback', { config: { noAuth: true } }, handleOidcCallback);

  // ============================================================================
  // LDAP & Local Authentication Routes
  // ============================================================================

  /**
   * POST /v1/auth/ldap/login
   */
  app.post('/v1/auth/ldap/login', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const body = ldapLoginSchema.parse(request.body);

    try {
      const authResult = await identityService.authenticate({
        providerType: 'LDAP',
        tenantId: body.tenantId,
        username: body.username,
        password: body.password,
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(200).send({
        success: true,
        data: authResult,
      });
    } catch (error: any) {
      return reply.code(401).send({ error: 'ldap_authentication_failed', message: error?.message });
    }
  });

  /**
   * POST /v1/auth/local/login
   */
  app.post('/v1/auth/local/login', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const body = localLoginSchema.parse(request.body);

    try {
      const authResult = await identityService.authenticate({
        providerType: 'LOCAL',
        tenantId: body.tenantId,
        username: body.username,
        password: body.password,
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(200).send({
        success: true,
        data: authResult,
      });
    } catch (error: any) {
      return reply.code(401).send({ error: 'invalid_credentials', message: error?.message });
    }
  });

  // ============================================================================
  // Token Refresh & Revocation
  // ============================================================================

  /**
   * POST /v1/auth/enterprise/refresh
   */
  app.post('/v1/auth/enterprise/refresh', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);

    try {
      const result = await identityService.refreshSession(body.refreshToken);
      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return reply.code(401).send({ error: 'invalid_refresh_token', message: error?.message });
    }
  });

  /**
   * POST /v1/auth/enterprise/logout
   */
  app.post('/v1/auth/enterprise/logout', async (request, reply) => {
    const body = logoutSchema.parse(request.body);
    await identityService.logout(body.sessionId, body.refreshToken);
    return reply.code(200).send({ success: true, message: 'Logged out successfully' });
  });

  // ============================================================================
  // Admin Identity Provider Management (Strict RBAC Guarded)
  // ============================================================================

  app.post('/v1/identity/providers/oidc', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.manage permission' });
    }

    const body = registerOidcConfigSchema.parse(request.body);
    await oidcProvider.registerTenant(body as any);

    return reply.code(201).send({
      success: true,
      message: `OIDC provider registered for tenant ${body.tenantId}`,
    });
  });

  app.get('/v1/identity/audit-logs', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN') && !user.roles?.includes('COMPLIANCE_AUDITOR'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires audit.read permission' });
    }

    const logs = identityService.getAuditLogs(user.tenantId);
    return reply.code(200).send({
      success: true,
      data: logs,
    });
  });
}
