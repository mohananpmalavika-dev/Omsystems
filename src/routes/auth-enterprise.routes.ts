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
import { oidcProvider, getOidcProviderPreset } from '../security/oidc-provider.js';
import { samlProvider } from '../security/saml-provider.js';
import { BankingPermissions } from '../identity/domain/identity.types.js';

const samlCallbackSchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
});

const oidcLoginParamsSchema = z.object({
  tenantId: z.string().min(1),
});

const oidcLoginQuerySchema = z.object({
  redirect: z.string().optional(),
  prompt: z.string().optional(),
  login_hint: z.string().optional(),
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
  hostedDomain: z.string().optional(),
  allowedDomains: z.array(z.string()).optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userinfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  attributeMapping: z.record(z.string()).optional(),
  roleMapping: z.record(z.array(z.string())).optional(),
  defaultRole: z.string().optional(),
  clockToleranceSeconds: z.number().int().positive().optional(),
  sessionDurationSeconds: z.number().int().positive().optional(),
});

const registerSamlConfigSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().optional(),
  idpUrl: z.string().url().optional(),
  idpCertificate: z.string().optional(),
  idpEntityId: z.string().optional(),
  spEntityId: z.string().optional(),
  spCallbackUrl: z.string().url().optional(),
  spSloUrl: z.string().url().optional(),
  metadataXml: z.string().optional(),
  wantAssertionsSigned: z.boolean().optional(),
  wantAuthnResponseSigned: z.boolean().optional(),
  signRequests: z.boolean().optional(),
  acceptedClockSkewMs: z.number().int().positive().optional(),
  attributeMapping: z.record(z.string()).optional(),
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
    const { redirect, json } = z.object({
      redirect: z.string().optional(),
      json: z.string().optional(),
    }).parse(request.query);

    try {
      const { url, requestId } = await samlProvider.getLoginUrl(tenantId, redirect || '/dashboard');
      const wantsJson = json === 'true' || (request.headers.accept || '').includes('application/json');
      if (wantsJson) {
        return reply.code(200).send({
          success: true,
          data: {
            authUrl: url,
            requestId,
            tenantId,
          },
        });
      }
      return reply.redirect(url);
    } catch (error: any) {
      request.log.error({ error: error?.message, tenantId }, 'SAML login initiation failed');
      return reply.code(500).send({ error: 'saml_initiation_failed', message: error?.message });
    }
  });

  /**
   * Helper to process SAML assertion callback
   */
  const handleSamlCallback = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.method === 'POST' ? request.body : request.query;
    const body = samlCallbackSchema.parse(params);
    const { tenantId } = z.object({ tenantId: z.string().optional() }).parse(request.query || {});

    try {
      const authResult = await identityService.authenticate({
        providerType: 'SAML',
        samlResponse: body.SAMLResponse,
        relayState: body.RelayState,
        tenantId,
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      });

      const wantsJson = (request.headers.accept || '').includes('application/json');
      if (wantsJson) {
        return reply.code(200).send({
          success: true,
          data: authResult,
        });
      }

      const redirectTarget = body.RelayState || '/dashboard';
      const separator = redirectTarget.includes('?') ? '&' : '?';
      return reply.redirect(`${redirectTarget}${separator}token=${authResult.accessToken}&refreshToken=${authResult.refreshToken}`);
    } catch (error: any) {
      request.log.error({ error: error?.message }, 'SAML callback authentication failed');
      const wantsJson = (request.headers.accept || '').includes('application/json');
      if (wantsJson) {
        return reply.code(401).send({ error: 'saml_authentication_failed', message: error?.message });
      }
      return reply.redirect(`/login?error=saml_authentication_failed&reason=${encodeURIComponent(error?.message || '')}`);
    }
  };

  /**
   * POST /v1/auth/saml/callback
   * Handle SAML assertion callback from IdP (HTTP-POST Binding)
   */
  app.post('/v1/auth/saml/callback', {
    config: { noAuth: true },
  }, handleSamlCallback);

  /**
   * GET /v1/auth/saml/callback
   * Handle SAML assertion callback from IdP (HTTP-Redirect Binding)
   */
  app.get('/v1/auth/saml/callback', {
    config: { noAuth: true },
  }, handleSamlCallback);

  /**
   * GET /v1/auth/saml/metadata
   * Returns default SP SAML metadata XML
   */
  app.get('/v1/auth/saml/metadata', {
    config: { noAuth: true },
  }, async (_request, reply) => {
    try {
      const metadata = await samlProvider.getMetadata();
      return reply.type('application/xml').send(metadata);
    } catch (error: any) {
      return reply.code(404).send({ error: 'saml_metadata_not_found', message: error?.message });
    }
  });

  /**
   * GET /v1/auth/saml/metadata/:tenantId
   * Returns tenant-specific SP SAML metadata XML
   */
  app.get('/v1/auth/saml/metadata/:tenantId', {
    config: { noAuth: true },
  }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    try {
      const metadata = await samlProvider.getMetadata(tenantId);
      return reply.type('application/xml').send(metadata);
    } catch (error: any) {
      return reply.code(404).send({ error: 'saml_metadata_not_found', message: error?.message });
    }
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
    const { redirect, prompt, login_hint } = oidcLoginQuerySchema.parse(request.query);

    try {
      const { authUrl } = await oidcProvider.initiateLogin(tenantId, redirect, { prompt, loginHint: login_hint });
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

  app.get('/v1/identity/providers/oidc/presets', async (_request: any, reply) => {
    const presets = {
      google: getOidcProviderPreset('google', {
        tenantId: 'TEMPLATE-GOOGLE',
        clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
        redirectUri: 'https://vms.domain.com/v1/auth/oidc/callback',
        hostedDomain: 'company.com',
      }),
      okta: getOidcProviderPreset('okta', {
        tenantId: 'TEMPLATE-OKTA',
        clientId: 'YOUR_OKTA_CLIENT_ID',
        redirectUri: 'https://vms.domain.com/v1/auth/oidc/callback',
        domain: 'dev-123456.okta.com',
      }),
      generic: getOidcProviderPreset('generic', {
        tenantId: 'TEMPLATE-GENERIC',
        clientId: 'YOUR_CLIENT_ID',
        redirectUri: 'https://vms.domain.com/v1/auth/oidc/callback',
        domain: 'https://sso.enterprise.local',
      }),
    };
    return reply.code(200).send({ success: true, data: presets });
  });

  app.get('/v1/identity/providers/oidc/:tenantId', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN') && !user.roles?.includes('BRANCH_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.view permission' });
    }

    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    const config = await oidcProvider.getTenantConfig(tenantId);
    if (!config) {
      return reply.code(404).send({ error: 'not_found', message: `OIDC configuration not found for tenant: ${tenantId}` });
    }

    // Redact sensitive secret
    const sanitized = {
      ...config,
      clientSecret: config.clientSecret ? '********' : undefined,
    };
    return reply.code(200).send({ success: true, data: sanitized });
  });

  app.delete('/v1/identity/providers/oidc/:tenantId', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.manage permission' });
    }

    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    await oidcProvider.removeTenant(tenantId);
    return reply.code(200).send({ success: true, message: `OIDC provider removed for tenant ${tenantId}` });
  });

  app.get('/v1/identity/providers/oidc/:tenantId/health', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN') && !user.roles?.includes('BRANCH_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.view permission' });
    }

    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    const health = await oidcProvider.testDiscovery(tenantId);
    return reply.code(health.healthy ? 200 : 503).send({ success: health.healthy, data: health });
  });

  // ============================================================================
  // SAML Admin Identity Provider Management
  // ============================================================================

  /**
   * POST /v1/identity/providers/saml
   * Register or update SAML IdP configuration for a tenant (Admin only)
   */
  app.post('/v1/identity/providers/saml', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.manage permission' });
    }

    const body = registerSamlConfigSchema.parse(request.body);

    let parsedConfig: Partial<import('../security/saml-provider.js').SamlTenantConfig> = {};
    if (body.metadataXml) {
      parsedConfig = samlProvider.parseIdpMetadata(body.metadataXml);
    }

    const spEntityId = body.spEntityId || process.env.SAML_SP_ENTITY_ID || `https://vms.bank.internal/saml/metadata/${body.tenantId}`;
    const spCallbackUrl = body.spCallbackUrl || process.env.SAML_SP_CALLBACK_URL || `https://vms.bank.internal/v1/auth/saml/callback`;

    const idpUrl = body.idpUrl || parsedConfig.idpUrl;
    const idpCertificate = body.idpCertificate || parsedConfig.idpCertificate;
    const idpEntityId = body.idpEntityId || parsedConfig.idpEntityId;
    const spSloUrl = body.spSloUrl || parsedConfig.spSloUrl;

    if (!idpUrl) {
      return reply.code(400).send({ error: 'missing_idp_url', message: 'idpUrl or metadataXml with SingleSignOnService is required' });
    }
    if (!idpCertificate) {
      return reply.code(400).send({ error: 'missing_idp_certificate', message: 'idpCertificate or metadataXml with KeyDescriptor is required' });
    }

    await samlProvider.registerTenant({
      tenantId: body.tenantId,
      tenantSlug: body.tenantSlug,
      idpUrl,
      idpCertificate,
      idpEntityId,
      spEntityId,
      spCallbackUrl,
      spSloUrl,
      wantAssertionsSigned: body.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: body.wantAuthnResponseSigned ?? true,
      signRequests: body.signRequests ?? false,
      acceptedClockSkewMs: body.acceptedClockSkewMs ?? 60000,
      attributeMapping: body.attributeMapping,
    });

    return reply.code(201).send({
      success: true,
      message: `SAML provider registered for tenant ${body.tenantId}`,
      tenantId: body.tenantId,
      idpUrl,
      spEntityId,
      spCallbackUrl,
    });
  });

  /**
   * GET /v1/identity/providers/saml/:tenantId
   * Inspect SAML IdP status and configuration for a tenant
   */
  app.get('/v1/identity/providers/saml/:tenantId', async (request: any, reply) => {
    const user = request.currentUser;
    if (!user || (!user.isSuperAdmin && !user.roles?.includes('SUPER_ADMIN') && !user.roles?.includes('BRANCH_ADMIN'))) {
      return reply.code(403).send({ error: 'forbidden', message: 'Requires identity_provider.view permission' });
    }

    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);
    const tenantConfig = samlProvider.getTenant(tenantId);
    if (!tenantConfig) {
      return reply.code(404).send({ error: 'tenant_not_found', message: `No SAML provider configured for tenant ${tenantId}` });
    }

    return reply.code(200).send({
      success: true,
      data: {
        tenantId: tenantConfig.tenantId,
        tenantSlug: tenantConfig.tenantSlug,
        idpUrl: tenantConfig.idpUrl,
        idpEntityId: tenantConfig.idpEntityId,
        spEntityId: tenantConfig.spEntityId,
        spCallbackUrl: tenantConfig.spCallbackUrl,
        spSloUrl: tenantConfig.spSloUrl,
        wantAssertionsSigned: tenantConfig.wantAssertionsSigned,
        wantAuthnResponseSigned: tenantConfig.wantAuthnResponseSigned,
        acceptedClockSkewMs: tenantConfig.acceptedClockSkewMs,
        hasCertificate: !!tenantConfig.idpCertificate,
      },
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
