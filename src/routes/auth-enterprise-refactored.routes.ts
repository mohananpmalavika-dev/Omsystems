/**
 * Enterprise Authentication Routes (REFACTORED)
 * 
 * This file shows how to refactor the dangerous TODO-filled routes
 * to use the proper service layer.
 * 
 * Key changes:
 * 1. JWT generation removed from routes → SessionService
 * 2. User provisioning removed from routes → ProvisioningService
 * 3. Role mapping centralized → RoleMappingService
 * 4. Admin checks → Permission middleware
 * 5. Complete flow → EnterpriseLoginService
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import { EnterpriseLoginService } from '../identity/services/enterprise-login.service.js';
import { AzureADIdentityAdapter } from '../identity/adapters/azure-ad.adapter.js';
import { LDAPIdentityAdapter } from '../identity/adapters/ldap.adapter.js';
import { SAMLIdentityAdapter } from '../identity/adapters/saml.adapter.js';
import { EnterpriseIdentityAdapterRegistry } from '../identity/adapters/identity-adapter.js';
import { createAuthenticateSession } from '../middleware/authenticate-session.middleware.js';
import { requirePermission, Permissions } from '../middleware/require-permission.middleware.js';
import { EnterpriseAuthError } from '../identity/domain/auth-errors.js';
import type { IdentityProvider } from '../identity/domain/identity-provider.js';

/**
 * Register enterprise authentication routes
 */
export async function registerEnterpriseAuthRoutes(
  app: FastifyInstance,
  pool: Pool,
) {
  // Initialize services
  const enterpriseLoginService = new EnterpriseLoginService(pool, {
    jwtSecret: process.env.JWT_SECRET!,
    accessTokenLifetime: parseInt(process.env.ACCESS_TOKEN_LIFETIME || '900'),
    refreshTokenLifetime: parseInt(process.env.REFRESH_TOKEN_LIFETIME || '2592000'),
  });

  // Initialize adapters
  const adapterRegistry = new EnterpriseIdentityAdapterRegistry();
  adapterRegistry.register(new AzureADIdentityAdapter());
  adapterRegistry.register(new LDAPIdentityAdapter());
  adapterRegistry.register(new SAMLIdentityAdapter(pool));

  // Initialize middleware
  const sessionService = enterpriseLoginService.getSessionService();
  const authenticateSession = createAuthenticateSession(
    sessionService,
    new (await import('../identity/services/principal.service.js')).PrincipalService(pool)
  );

  // ============================================================================
  // Azure AD / OIDC Routes
  // ============================================================================

  /**
   * GET /v1/auth/azure/:providerId/login
   * Initiate Azure AD login
   */
  app.get('/v1/auth/azure/:providerId/login', {
    config: { noAuth: true },
    schema: {
      params: z.object({
        providerId: z.string().uuid(),
      }),
      querystring: z.object({
        redirect: z.string().url().optional(),
      }),
    },
  }, async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { redirect } = request.query as { redirect?: string };

    try {
      // Get provider configuration
      const provider = await getProvider(pool, providerId);

      if (provider.configuration.type !== 'AZURE_AD') {
        return reply.code(400).send({
          error: 'INVALID_PROVIDER_TYPE',
          message: 'Provider is not configured for Azure AD',
        });
      }

      // Generate OAuth state and nonce
      const state = generateRandomState();
      const nonce = generateRandomNonce();

      // Store transaction
      await storeAuthTransaction(pool, {
        tenantId: provider.tenantId,
        providerId: provider.id,
        state,
        nonce,
        redirectUri: redirect,
      });

      // Build authorization URL
      const authUrl = buildAzureAuthUrl(provider.configuration, state, nonce);

      return reply.redirect(authUrl);

    } catch (error) {
      request.log.error({ error, providerId }, 'Azure AD login initiation failed');
      return reply.code(500).send({
        error: 'AUTHENTICATION_FAILED',
        message: 'Failed to initiate Azure AD login',
      });
    }
  });

  /**
   * GET /v1/auth/azure/:providerId/callback
   * Handle Azure AD callback
   */
  app.get('/v1/auth/azure/:providerId/callback', {
    config: { noAuth: true },
    schema: {
      params: z.object({
        providerId: z.string().uuid(),
      }),
      querystring: z.object({
        code: z.string(),
        state: z.string(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { code, state, error: authError } = request.query as any;

    if (authError) {
      return reply.code(400).send({
        error: 'AUTHENTICATION_FAILED',
        message: request.query.error_description || authError,
      });
    }

    try {
      // Get provider configuration
      const provider = await getProvider(pool, providerId);

      // Get and consume transaction
      const transaction = await consumeAuthTransaction(pool, state);

      if (!transaction || transaction.providerId !== providerId) {
        return reply.code(400).send({
          error: 'INVALID_STATE',
          message: 'Invalid or expired state parameter',
        });
      }

      // Get adapter
      const adapter = adapterRegistry.get('AZURE_AD');

      // Verify external identity
      const identity = await adapter.authenticate({
        provider,
        request: {
          code,
          state,
          nonce: transaction.nonce,
          redirectUri: buildCallbackUrl(request, providerId),
        },
      });

      // Complete authentication (this does everything!)
      const result = await enterpriseLoginService.completeAuthentication({
        tenantId: provider.tenantId,
        providerId: provider.id,
        identity,
        context: {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      // Redirect to frontend with tokens
      const redirectUrl = transaction.redirectUri || '/dashboard';
      const tokenParams = new URLSearchParams({
        access_token: result.session.accessToken,
        refresh_token: result.session.refreshToken,
        expires_in: result.session.expiresIn.toString(),
      });

      return reply.redirect(`${redirectUrl}?${tokenParams.toString()}`);

    } catch (error) {
      if (error instanceof EnterpriseAuthError) {
        await enterpriseLoginService.recordAuthenticationFailure(
          (await getProvider(pool, providerId)).tenantId,
          providerId,
          error,
          {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          }
        );

        return reply.redirect(`/login?error=${encodeURIComponent(error.code)}`);
      }

      request.log.error({ error, providerId }, 'Azure AD callback failed');
      return reply.redirect('/login?error=authentication_failed');
    }
  });

  // ============================================================================
  // LDAP Routes
  // ============================================================================

  /**
   * POST /v1/auth/ldap/:providerId/login
   * Authenticate via LDAP
   */
  app.post('/v1/auth/ldap/:providerId/login', {
    config: { noAuth: true },
    schema: {
      params: z.object({
        providerId: z.string().uuid(),
      }),
      body: z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }),
    },
  }, async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { username, password } = request.body as any;

    try {
      // Get provider configuration
      const provider = await getProvider(pool, providerId);

      if (provider.configuration.type !== 'LDAP') {
        return reply.code(400).send({
          error: 'INVALID_PROVIDER_TYPE',
          message: 'Provider is not configured for LDAP',
        });
      }

      // Get adapter
      const adapter = adapterRegistry.get('LDAP');

      // Authenticate via LDAP
      const identity = await adapter.authenticate({
        provider,
        request: { username, password },
      });

      // Complete authentication
      const result = await enterpriseLoginService.completeAuthentication({
        tenantId: provider.tenantId,
        providerId: provider.id,
        identity,
        context: {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      // Return tokens
      return reply.send({
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresIn: result.session.expiresIn,
        tokenType: result.session.tokenType,
        user: {
          userId: result.principal.userId,
          email: result.principal.user.email,
          displayName: result.principal.user.displayName,
        },
      });

    } catch (error) {
      if (error instanceof EnterpriseAuthError) {
        await enterpriseLoginService.recordAuthenticationFailure(
          (await getProvider(pool, providerId)).tenantId,
          providerId,
          error,
          {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          }
        );

        return reply.code(401).send(error.toSafeResponse());
      }

      request.log.error({ error, providerId, username }, 'LDAP authentication failed');
      return reply.code(500).send({
        error: 'AUTHENTICATION_FAILED',
        message: 'LDAP authentication failed',
      });
    }
  });

  // ============================================================================
  // Token Management Routes
  // ============================================================================

  /**
   * POST /v1/auth/refresh
   * Refresh access token
   */
  app.post('/v1/auth/refresh', {
    config: { noAuth: true },
    schema: {
      body: z.object({
        refreshToken: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      // Note: In production, you need to resolve the principal from the refresh token
      // This is a simplified example
      const payload = await sessionService.verifyAccessToken(refreshToken);
      
      if (!payload) {
        return reply.code(401).send({
          error: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        });
      }

      // Load principal (simplified)
      const principalService = new (await import('../identity/services/principal.service.js')).PrincipalService(pool);
      const principal = await principalService.resolveFromSession(
        payload.sub,
        payload.tid,
        payload.sid,
        {
          source: 'PASSWORD',
          mfa: false,
          authenticatedAt: new Date(),
        }
      );

      // Refresh session
      const result = await sessionService.refresh(
        refreshToken,
        principal,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }
      );

      return reply.send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: result.tokenType,
      });

    } catch (error) {
      request.log.error({ error }, 'Token refresh failed');
      return reply.code(401).send({
        error: 'REFRESH_FAILED',
        message: 'Failed to refresh token',
      });
    }
  });

  /**
   * POST /v1/auth/logout
   * Revoke current session
   */
  app.post('/v1/auth/logout', {
    preHandler: [authenticateSession],
  }, async (request, reply) => {
    try {
      if (request.sessionId) {
        await sessionService.revoke(request.sessionId, 'User logout');
      }

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });

    } catch (error) {
      request.log.error({ error }, 'Logout failed');
      return reply.code(500).send({
        error: 'LOGOUT_FAILED',
        message: 'Failed to logout',
      });
    }
  });

  // ============================================================================
  // Admin Routes (FIXED: No more TODO comments!)
  // ============================================================================

  /**
   * GET /v1/admin/identity-providers
   * List identity providers (ADMIN ONLY)
   */
  app.get('/v1/admin/identity-providers', {
    preHandler: [
      authenticateSession,
      requirePermission(Permissions.IDENTITY_PROVIDER_READ),
    ],
  }, async (request, reply) => {
    try {
      const providers = await listProviders(pool, request.principal!.tenantId);
      return reply.send({ providers });
    } catch (error) {
      request.log.error({ error }, 'Failed to list providers');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to list identity providers',
      });
    }
  });

  /**
   * POST /v1/admin/identity-providers
   * Create identity provider (ADMIN ONLY)
   */
  app.post('/v1/admin/identity-providers', {
    preHandler: [
      authenticateSession,
      requirePermission(Permissions.IDENTITY_PROVIDER_CREATE),
    ],
    schema: {
      body: z.object({
        configuration: z.object({
          type: z.enum(['AZURE_AD', 'OIDC', 'SAML', 'LDAP']),
          enabled: z.boolean(),
          name: z.string(),
          // ... other configuration fields
        }),
        provisioning: z.object({
          mode: z.enum(['JIT', 'PREPROVISIONED_ONLY', 'DISABLED']),
          allowedDomains: z.array(z.string()),
        }),
        authorization: z.object({
          requireMappedRole: z.boolean(),
        }),
        security: z.object({
          requireMfa: z.boolean(),
        }),
      }),
    },
  }, async (request, reply) => {
    try {
      const provider = await createProvider(
        pool,
        request.principal!.tenantId,
        request.body as any,
        request.principal!.userId
      );

      return reply.code(201).send({ provider });
    } catch (error) {
      request.log.error({ error }, 'Failed to create provider');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create identity provider',
      });
    }
  });

  /**
   * POST /v1/admin/identity-providers/:id/test
   * Test provider health (ADMIN ONLY)
   */
  app.post('/v1/admin/identity-providers/:id/test', {
    preHandler: [
      authenticateSession,
      requirePermission(Permissions.IDENTITY_PROVIDER_MANAGE),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const provider = await getProvider(pool, id);
      const adapter = adapterRegistry.get(provider.configuration.type);
      const health = await adapter.healthCheck(provider);

      return reply.send({ health });
    } catch (error) {
      request.log.error({ error, providerId: id }, 'Provider health check failed');
      return reply.code(500).send({
        error: 'HEALTH_CHECK_FAILED',
        message: 'Failed to check provider health',
      });
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getProvider(pool: Pool, providerId: string): Promise<IdentityProvider> {
  const result = await pool.query(
    `SELECT id, tenant_id as "tenantId", configuration, provisioning, authorization, security
     FROM identity_providers
     WHERE id = $1`,
    [providerId]
  );

  if (result.rows.length === 0) {
    throw new Error('Provider not found');
  }

  return result.rows[0];
}

async function listProviders(pool: Pool, tenantId: string): Promise<IdentityProvider[]> {
  const result = await pool.query(
    `SELECT id, tenant_id as "tenantId", configuration, provisioning, authorization, security
     FROM identity_providers
     WHERE tenant_id = $1
     ORDER BY (configuration->>'name')`,
    [tenantId]
  );

  return result.rows;
}

async function createProvider(
  pool: Pool,
  tenantId: string,
  data: any,
  createdBy: string
): Promise<IdentityProvider> {
  const result = await pool.query(
    `INSERT INTO identity_providers (tenant_id, configuration, provisioning, authorization, security, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id as "tenantId", configuration, provisioning, authorization, security`,
    [
      tenantId,
      JSON.stringify(data.configuration),
      JSON.stringify(data.provisioning),
      JSON.stringify(data.authorization),
      JSON.stringify(data.security),
      createdBy,
    ]
  );

  return result.rows[0];
}

function generateRandomState(): string {
  return randomBytes(32).toString('base64url');
}

function generateRandomNonce(): string {
  return randomBytes(32).toString('base64url');
}

async function storeAuthTransaction(pool: Pool, data: any): Promise<void> {
  const stateHash = createHash('sha256').update(data.state).digest('hex');
  const nonceHash = data.nonce ? createHash('sha256').update(data.nonce).digest('hex') : null;

  await pool.query(
    `INSERT INTO auth_transactions (tenant_id, provider_id, state_hash, nonce_hash, redirect_uri, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')`,
    [data.tenantId, data.providerId, stateHash, nonceHash, data.redirectUri]
  );
}

async function consumeAuthTransaction(pool: Pool, state: string): Promise<any> {
  const stateHash = createHash('sha256').update(state).digest('hex');

  const result = await pool.query(
    `UPDATE auth_transactions
     SET consumed_at = now()
     WHERE state_hash = $1
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING provider_id as "providerId", nonce_hash as "nonceHash", redirect_uri as "redirectUri"`,
    [stateHash]
  );

  return result.rows[0] || null;
}

function buildAzureAuthUrl(config: any, state: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: config.scopes.join(' '),
    state,
    nonce,
  });

  const baseUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`;
  return `${baseUrl}?${params.toString()}`;
}

function buildCallbackUrl(request: any, providerId: string): string {
  return `${request.protocol}://${request.hostname}/v1/auth/azure/${providerId}/callback`;
}

import { randomBytes, createHash } from 'crypto';
