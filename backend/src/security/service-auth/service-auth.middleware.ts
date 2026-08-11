/**
 * Service Authentication Middleware
 * 
 * Fastify preHandler middleware for service-to-service authentication.
 * Extracts and validates service JWT, attaches ServicePrincipal to request.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  ServicePrincipal,
  ServiceCapability,
  IServiceAuthService,
  ServiceAuthError,
  ServiceAuthorizationError,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Extend Fastify request with service principal
 */
declare module 'fastify' {
  interface FastifyRequest {
    servicePrincipal?: ServicePrincipal;
  }
}

/**
 * Create service authentication middleware
 * 
 * Usage:
 *   fastify.post('/internal/api', {
 *     preHandler: [requireServiceAuthentication]
 *   }, handler);
 */
export function createServiceAuthMiddleware(authService: IServiceAuthService) {
  /**
   * Require service authentication
   * 
   * Authenticates the service and attaches ServicePrincipal to request.
   * Returns 401 if authentication fails.
   */
  return async function requireServiceAuthentication(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Authenticate service
      const principal = await authService.authenticate(request.headers);

      // Attach principal to request for downstream handlers
      request.servicePrincipal = principal;

      logger.debug('Service authenticated via middleware', {
        serviceId: principal.serviceId,
        path: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof ServiceAuthError) {
        logger.warn('Service authentication failed', {
          code: error.code,
          message: error.message,
          path: request.url,
          method: request.method,
        });

        return reply.code(error.statusCode).send({
          error: 'Unauthorized',
          code: error.code,
          message: error.message,
        });
      }

      // Unexpected error
      logger.error('Unexpected authentication error', {
        error,
        path: request.url,
        method: request.method,
      });

      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Authentication processing failed',
      });
    }
  };
}

/**
 * Create capability requirement middleware
 * 
 * Usage:
 *   fastify.post('/internal/api', {
 *     preHandler: [
 *       requireServiceAuthentication,
 *       requireCapability('notifications:create')
 *     ]
 *   }, handler);
 */
export function createCapabilityMiddleware(requiredCapability: ServiceCapability) {
  return async function requireCapability(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const principal = request.servicePrincipal;

    if (!principal) {
      logger.error('Capability check without authentication', {
        path: request.url,
        method: request.method,
      });

      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Service authentication required',
      });
    }

    // Check if principal has required capability
    if (!principal.capabilities.includes(requiredCapability)) {
      logger.warn('Service lacks required capability', {
        serviceId: principal.serviceId,
        requiredCapability,
        availableCapabilities: principal.capabilities,
        path: request.url,
        method: request.method,
      });

      return reply.code(403).send({
        error: 'Forbidden',
        code: 'MISSING_CAPABILITY',
        message: `Service lacks required capability: ${requiredCapability}`,
      });
    }

    logger.debug('Capability check passed', {
      serviceId: principal.serviceId,
      capability: requiredCapability,
      path: request.url,
    });
  };
}

/**
 * Error handler for service auth errors
 * 
 * Register this as a Fastify error handler to provide consistent
 * error responses for authentication/authorization failures.
 * 
 * Usage:
 *   fastify.setErrorHandler(createServiceAuthErrorHandler());
 */
export function createServiceAuthErrorHandler() {
  return function handleServiceAuthError(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    if (error instanceof ServiceAuthError) {
      logger.warn('Service auth error', {
        code: error.code,
        message: error.message,
        serviceId: request.servicePrincipal?.serviceId,
        path: request.url,
      });

      reply.code(error.statusCode).send({
        error: 'Unauthorized',
        code: error.code,
        message: error.message,
        metadata: error.metadata,
      });
      return;
    }

    if (error instanceof ServiceAuthorizationError) {
      logger.warn('Service authorization error', {
        code: error.code,
        message: error.message,
        serviceId: request.servicePrincipal?.serviceId,
        path: request.url,
      });

      reply.code(error.statusCode).send({
        error: 'Forbidden',
        code: error.code,
        message: error.message,
        metadata: error.metadata,
      });
      return;
    }

    // Not a service auth error - pass to default handler
    throw error;
  };
}

/**
 * Helper to get service principal from request
 * 
 * Throws if principal is not present (should be unreachable if middleware is used correctly).
 */
export function getServicePrincipal(request: FastifyRequest): ServicePrincipal {
  const principal = request.servicePrincipal;

  if (!principal) {
    throw new Error('Service principal not found on request. Ensure requireServiceAuthentication middleware is applied.');
  }

  return principal;
}

/**
 * Helper to check if request is from a specific service
 */
export function isService(request: FastifyRequest, serviceId: string): boolean {
  const principal = request.servicePrincipal;
  return principal?.serviceId === serviceId;
}

/**
 * Helper to check if request has capability
 */
export function hasCapability(request: FastifyRequest, capability: ServiceCapability): boolean {
  const principal = request.servicePrincipal;
  return principal?.capabilities.includes(capability) || false;
}
