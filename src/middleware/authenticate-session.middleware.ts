/**
 * Session Authentication Middleware
 * 
 * Validates JWT access tokens and resolves authenticated principals.
 * 
 * This is the primary authentication middleware for protected endpoints.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../identity/services/session.service.js';
import { PrincipalService } from '../identity/services/principal.service.js';
import type { AuthenticatedPrincipal } from '../identity/domain/authenticated-principal.js';
import { SessionError, EnterpriseAuthError } from '../identity/domain/auth-errors.js';

// Extend Fastify request with principal
declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal;
    sessionId?: string;
  }
}

/**
 * Authentication middleware options
 */
export interface AuthenticateSessionOptions {
  /**
   * Whether to make authentication optional
   * If true, continues without principal if no token provided
   */
  optional?: boolean;

  /**
   * Require active user account
   */
  requireActive?: boolean;

  /**
   * Require active tenant membership
   */
  requireActiveMembership?: boolean;
}

/**
 * Create authentication middleware
 */
export function createAuthenticateSession(
  sessionService: SessionService,
  principalService: PrincipalService,
  options: AuthenticateSessionOptions = {},
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Extract bearer token from Authorization header
      const token = extractBearerToken(request);

      if (!token) {
        if (options.optional) {
          // Optional authentication, continue without principal
          return;
        }

        return reply.code(401).send({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Authorization header with Bearer token is required',
        });
      }

      // Verify access token
      const payload = await sessionService.verifyAccessToken(token);

      if (!payload) {
        return reply.code(401).send({
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired access token',
        });
      }

      // Resolve principal from session
      const principal = await principalService.resolveFromSession(
        payload.sub,
        payload.tid,
        payload.sid,
        {
          source: 'PASSWORD', // Will be updated based on actual auth method
          mfa: false, // Will be loaded from session
          authenticatedAt: new Date(payload.iat * 1000),
        },
      );

      // Attach principal to request
      request.principal = principal;
      request.sessionId = payload.sid;

    } catch (error) {
      if (error instanceof SessionError) {
        return reply.code(401).send({
          error: error.code,
          message: error.message,
        });
      }

      if (error instanceof EnterpriseAuthError) {
        return reply.code(401).send({
          error: error.code,
          message: error.message,
        });
      }

      // Log unexpected errors
      request.log.error({ error }, 'Authentication middleware error');

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      });
    }
  };
}

/**
 * Extract bearer token from request
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Require authenticated principal
 * 
 * Use this after authenticateSession middleware to ensure principal exists
 */
export function requireAuthenticated() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }
  };
}

/**
 * Require specific account status
 */
export function requireAccountStatus(
  ...statuses: Array<'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'LOCKED' | 'PENDING_ACTIVATION'>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (!statuses.includes(request.principal.userStatus)) {
      return reply.code(403).send({
        error: 'ACCOUNT_NOT_ACTIVE',
        message: `Account status is ${request.principal.userStatus}`,
      });
    }
  };
}

/**
 * Require MFA authentication
 */
export function requireMFA() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (!request.principal.authentication.mfa) {
      return reply.code(403).send({
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for this operation',
      });
    }
  };
}

/**
 * Require recent authentication
 */
export function requireRecentAuthentication(maxAgeSeconds: number) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const authAge = (Date.now() - request.principal.authentication.authenticatedAt.getTime()) / 1000;

    if (authAge > maxAgeSeconds) {
      return reply.code(403).send({
        error: 'AUTHENTICATION_TOO_OLD',
        message: `Authentication is ${Math.floor(authAge)} seconds old, maximum allowed is ${maxAgeSeconds}`,
        stepUpRequired: true,
      });
    }
  };
}

/**
 * Require minimum assurance level
 */
export function requireAssuranceLevel(
  minLevel: 'LOW' | 'MEDIUM' | 'HIGH'
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const levels = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    const currentLevel = request.principal.authentication.assuranceLevel || 'LOW';

    if (levels[currentLevel] < levels[minLevel]) {
      return reply.code(403).send({
        error: 'ASSURANCE_LEVEL_INSUFFICIENT',
        message: `Authentication assurance level is ${currentLevel}, minimum required is ${minLevel}`,
      });
    }
  };
}
