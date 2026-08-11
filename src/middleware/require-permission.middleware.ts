/**
 * Permission Authorization Middleware
 * 
 * Checks if authenticated principal has required permissions.
 * 
 * Use after authenticateSession middleware.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { PrincipalService } from '../identity/services/principal.service.js';

/**
 * Require specific permission
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (!request.principal.permissions.includes(permission)) {
      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
        permission,
        userPermissions: request.principal.permissions,
      }, 'Permission denied');

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action',
        requiredPermission: permission,
      });
    }
  };
}

/**
 * Require ANY of the specified permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const hasAny = permissions.some(p => request.principal!.permissions.includes(p));

    if (!hasAny) {
      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
        requiredPermissions: permissions,
        userPermissions: request.principal.permissions,
      }, 'Permission denied');

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action',
        requiredPermissions: permissions,
      });
    }
  };
}

/**
 * Require ALL of the specified permissions
 */
export function requireAllPermissions(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const hasAll = permissions.every(p => request.principal!.permissions.includes(p));

    if (!hasAll) {
      const missing = permissions.filter(p => !request.principal!.permissions.includes(p));

      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
        requiredPermissions: permissions,
        missingPermissions: missing,
        userPermissions: request.principal.permissions,
      }, 'Permission denied');

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action',
        requiredPermissions: permissions,
        missingPermissions: missing,
      });
    }
  };
}

/**
 * Require specific role
 */
export function requireRole(roleId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (!request.principal.roles.includes(roleId)) {
      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
        requiredRole: roleId,
        userRoles: request.principal.roles,
      }, 'Role requirement not met');

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have the required role to perform this action',
        requiredRole: roleId,
      });
    }
  };
}

/**
 * Require ANY of the specified roles
 */
export function requireAnyRole(...roleIds: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const hasAny = roleIds.some(r => request.principal!.roles.includes(r));

    if (!hasAny) {
      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
        requiredRoles: roleIds,
        userRoles: request.principal.roles,
      }, 'Role requirement not met');

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have the required role to perform this action',
        requiredRoles: roleIds,
      });
    }
  };
}

/**
 * Require tenant membership
 */
export function requireTenant(tenantId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (request.principal.tenantId !== tenantId) {
      request.log.warn({
        userId: request.principal.userId,
        userTenantId: request.principal.tenantId,
        requiredTenantId: tenantId,
      }, 'Tenant mismatch');

      return reply.code(403).send({
        error: 'TENANT_MISMATCH',
        message: 'You do not have access to this tenant',
      });
    }
  };
}

/**
 * Require tenant from route parameter
 */
export function requireTenantFromParam(paramName: string = 'tenantId') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const params = request.params as Record<string, string>;
    const tenantId = params[paramName];

    if (!tenantId) {
      return reply.code(400).send({
        error: 'MISSING_TENANT_ID',
        message: `Tenant ID parameter '${paramName}' is required`,
      });
    }

    if (request.principal.tenantId !== tenantId) {
      request.log.warn({
        userId: request.principal.userId,
        userTenantId: request.principal.tenantId,
        requestedTenantId: tenantId,
      }, 'Tenant mismatch');

      return reply.code(403).send({
        error: 'TENANT_MISMATCH',
        message: 'You do not have access to this tenant',
      });
    }
  };
}

/**
 * Custom authorization check
 */
export function requireAuthorization(
  check: (request: FastifyRequest) => boolean | Promise<boolean>,
  errorMessage: string = 'Authorization failed',
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.principal) {
      return reply.code(401).send({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    const authorized = await check(request);

    if (!authorized) {
      request.log.warn({
        userId: request.principal.userId,
        tenantId: request.principal.tenantId,
      }, 'Custom authorization check failed');

      return reply.code(403).send({
        error: 'AUTHORIZATION_FAILED',
        message: errorMessage,
      });
    }
  };
}

/**
 * Common permissions (define based on your application)
 */
export const Permissions = {
  // Identity Provider Management
  IDENTITY_PROVIDER_READ: 'identity-provider:read',
  IDENTITY_PROVIDER_CREATE: 'identity-provider:create',
  IDENTITY_PROVIDER_UPDATE: 'identity-provider:update',
  IDENTITY_PROVIDER_DELETE: 'identity-provider:delete',
  IDENTITY_PROVIDER_MANAGE: 'identity-provider:manage',

  // User Management
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE: 'user:manage',

  // Role Management
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_ASSIGN: 'role:assign',
  ROLE_MANAGE: 'role:manage',

  // Audit
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // System Administration
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_MONITOR: 'system:monitor',

  // Tenant Management
  TENANT_CREATE: 'tenant:create',
  TENANT_UPDATE: 'tenant:update',
  TENANT_DELETE: 'tenant:delete',
  TENANT_MANAGE: 'tenant:manage',
} as const;
