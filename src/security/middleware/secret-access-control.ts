/**
 * Secret Access Control Middleware
 * Enforces authorization, audit logging, and rate limiting for secret access
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../../config/database.js';

export interface SecretAccessContext {
  userId: string;
  userRole: string;
  secretId: string;
  action: 'read' | 'write' | 'rotate' | 'delete';
  ipAddress: string;
  userAgent?: string;
  justification?: string;
}

export interface SecretAccessDecision {
  allowed: boolean;
  reason: string;
  requiresApproval?: boolean;
  auditRequired: boolean;
}

/**
 * Check if user has permission to access a secret
 */
export async function checkSecretPermission(
  context: SecretAccessContext
): Promise<SecretAccessDecision> {
  const db = getDatabase();

  try {
    // 1. Get the secret metadata
    const secret = await db.collection('secrets').findOne({ id: context.secretId });
    
    if (!secret) {
      return {
        allowed: false,
        reason: 'secret_not_found',
        auditRequired: true,
      };
    }

    // 2. Check if secret is owned by user or user is admin
    const isOwner = secret.createdBy === context.userId;
    const isAdmin = ['admin', 'super_admin'].includes(context.userRole);

    // 3. Check secret-specific ACLs
    const hasExplicitAccess = secret.allowedUsers?.includes(context.userId);
    const hasRoleAccess = secret.allowedRoles?.includes(context.userRole);

    // 4. Apply access rules based on action
    switch (context.action) {
      case 'read':
        // Read requires ownership, explicit access, or admin role
        if (isOwner || hasExplicitAccess || hasRoleAccess || isAdmin) {
          return {
            allowed: true,
            reason: isOwner ? 'owner' : hasExplicitAccess ? 'explicit_access' : hasRoleAccess ? 'role_access' : 'admin',
            auditRequired: true, // Always audit secret reads
          };
        }
        break;

      case 'write':
      case 'rotate':
        // Write/rotate requires ownership or admin
        if (isOwner || isAdmin) {
          return {
            allowed: true,
            reason: isOwner ? 'owner' : 'admin',
            auditRequired: true,
          };
        }
        break;

      case 'delete':
        // Delete requires admin only
        if (isAdmin) {
          return {
            allowed: true,
            reason: 'admin',
            auditRequired: true,
          };
        }
        break;
    }

    // Default deny
    return {
      allowed: false,
      reason: `insufficient_permissions_for_${context.action}`,
      auditRequired: true, // Audit denial attempts
    };
  } catch (error) {
    return {
      allowed: false,
      reason: 'permission_check_failed',
      auditRequired: true,
    };
  }
}

/**
 * Audit secret access attempt
 */
export async function auditSecretAccess(
  context: SecretAccessContext,
  decision: SecretAccessDecision,
  success: boolean,
  error?: string
): Promise<void> {
  const db = getDatabase();

  const auditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(),
    category: 'secret_access',
    action: context.action,
    secretId: context.secretId,
    userId: context.userId,
    userRole: context.userRole,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    justification: context.justification,
    decision: {
      allowed: decision.allowed,
      reason: decision.reason,
    },
    success,
    error,
    severity: !decision.allowed ? 'high' : context.action === 'read' ? 'medium' : 'high',
  };

  try {
    await db.collection('secret_access_audit').insertOne(auditEntry);

    // Create security alert for suspicious activity
    if (!decision.allowed || error) {
      await db.collection('security_alerts').insertOne({
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'unauthorized_secret_access',
        severity: 'high',
        title: 'Unauthorized Secret Access Attempt',
        description: `User ${context.userId} attempted to ${context.action} secret ${context.secretId}`,
        source: 'secret_access_control',
        data: {
          userId: context.userId,
          secretId: context.secretId,
          action: context.action,
          reason: decision.reason,
        },
        timestamp: new Date(),
        acknowledged: false,
      });
    }
  } catch (auditError) {
    // Log audit failure but don't block the request
    console.error('Failed to audit secret access:', auditError);
  }
}

/**
 * Rate limiting for secret access
 */
const accessRateLimits = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  userId: string,
  action: 'read' | 'write' | 'rotate' | 'delete'
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const key = `${userId}:${action}`;

  // Limits per hour
  const limits = {
    read: 50,    // Max 50 reads per hour
    write: 20,   // Max 20 writes per hour
    rotate: 10,  // Max 10 rotations per hour
    delete: 5,   // Max 5 deletions per hour
  };

  const limit = limits[action];
  let entry = accessRateLimits.get(key);

  // Reset if window expired
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    accessRateLimits.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetIn: Math.max(0, entry.resetAt - now),
  };
}

/**
 * Fastify middleware for secret access control
 */
export async function requireSecretAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  action: 'read' | 'write' | 'rotate' | 'delete'
): Promise<boolean> {
  // Extract user from request (assumes authentication middleware already ran)
  const user = (request as any).currentUser;
  
  if (!user) {
    reply.code(401).send({
      error: 'authentication_required',
      message: 'You must be authenticated to access secrets',
    });
    return false;
  }

  // Extract secret ID from params
  const secretId = (request.params as any).secretId;
  
  if (!secretId) {
    reply.code(400).send({
      error: 'secret_id_required',
      message: 'Secret ID is required',
    });
    return false;
  }

  // Build access context
  const context: SecretAccessContext = {
    userId: user.id,
    userRole: user.role,
    secretId,
    action,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    justification: (request.body as any)?.justification,
  };

  // Check rate limit
  const rateLimit = await checkRateLimit(user.id, action);
  
  if (!rateLimit.allowed) {
    await auditSecretAccess(context, { allowed: false, reason: 'rate_limit_exceeded', auditRequired: true }, false, 'Rate limit exceeded');
    
    reply.code(429).send({
      error: 'rate_limit_exceeded',
      message: `Too many ${action} requests. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`,
      remaining: rateLimit.remaining,
      resetIn: rateLimit.resetIn,
    });
    return false;
  }

  // Check permissions
  const decision = await checkSecretPermission(context);

  if (!decision.allowed) {
    await auditSecretAccess(context, decision, false, 'Permission denied');
    
    reply.code(403).send({
      error: 'access_denied',
      message: `You do not have permission to ${action} this secret`,
      reason: decision.reason,
    });
    return false;
  }

  // Access granted - audit will be done after action completes
  // Store context in request for later use
  (request as any).secretAccessContext = context;
  (request as any).secretAccessDecision = decision;

  return true;
}

/**
 * Complete audit after action (call this after successful secret access)
 */
export async function completeSecretAccessAudit(
  request: FastifyRequest,
  success: boolean,
  error?: string
): Promise<void> {
  const context = (request as any).secretAccessContext as SecretAccessContext;
  const decision = (request as any).secretAccessDecision as SecretAccessDecision;

  if (context && decision) {
    await auditSecretAccess(context, decision, success, error);
  }
}

/**
 * Get secret access history for a user
 */
export async function getSecretAccessHistory(
  userId: string,
  limit: number = 100
): Promise<any[]> {
  const db = getDatabase();
  
  return await db.collection('secret_access_audit')
    .find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get secret access history for a specific secret
 */
export async function getSecretAuditTrail(
  secretId: string,
  limit: number = 100
): Promise<any[]> {
  const db = getDatabase();
  
  return await db.collection('secret_access_audit')
    .find({ secretId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}
