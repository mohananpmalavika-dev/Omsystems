/**
 * Branch Lifecycle Management API Routes
 * 
 * Provides REST endpoints for branch lifecycle operations:
 * - POST /v1/organization/nodes/:id/disable
 * - POST /v1/organization/nodes/:id/reactivate
 * - POST /v1/organization/nodes/:id/archive
 * - GET /v1/organization/nodes/:id/lifecycle-impact
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore, OrganizationStore } from '../control-plane-store.js';
import { BranchLifecycleService } from '../services/branch-lifecycle.service.js';
import { BranchLifecycleError, BranchStatus } from '../domain/branch-lifecycle.types.js';
// import type { EventBus } from '../events/event-bus.js';

// Stub EventBus type
type EventBus = any;

const nodeIdSchema = z.object({ id: z.string().uuid() });

const lifecycleReasonSchema = z.object({
  reason: z.string().min(1).max(500).trim(),
});

const lifecycleImpactQuerySchema = z.object({
  targetStatus: z.nativeEnum(BranchStatus),
});

export async function registerBranchLifecycleRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & OrganizationStore,
  eventBus?: EventBus,
) {
  const lifecycleService = new BranchLifecycleService(store, eventBus);

  /**
   * Disable a branch
   * 
   * POST /v1/organization/nodes/:id/disable
   * 
   * Transitions branch from ACTIVE → DISABLED
   * Monitoring operations stop but history is preserved
   */
  app.post(
    '/v1/organization/nodes/:id/disable',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = nodeIdSchema.parse(request.params);
        const { reason } = lifecycleReasonSchema.parse(request.body);

        // Check permission
        if (!(await requireAccess(request, reply, store, 'org:manage', id))) {
          return;
        }

        // Verify it's a branch node
        const node = await store.getOrganizationNodeDetails(id);
        if (!node) {
          return reply.code(404).send({
            error: 'node_not_found',
            message: 'Organization node not found',
          });
        }

        if (node.type !== 'branch') {
          return reply.code(400).send({
            error: 'invalid_node_type',
            message: 'Only branch nodes can be disabled. This operation is not supported for other node types.',
            details: { nodeType: node.type },
          });
        }

        // Execute lifecycle transition
        const result = await lifecycleService.disableBranch({
          tenantId: request.currentUser.tenantId,
          branchId: id,
          actorId: request.currentUser.id,
          reason,
        });

        return reply.code(200).send({
          success: true,
          data: result,
          message: 'Branch disabled successfully',
        });
      } catch (error) {
        return handleLifecycleError(error, reply);
      }
    }
  );

  /**
   * Reactivate a disabled branch
   * 
   * POST /v1/organization/nodes/:id/reactivate
   * 
   * Transitions branch from DISABLED → ACTIVE
   * Restores monitoring operations
   */
  app.post(
    '/v1/organization/nodes/:id/reactivate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = nodeIdSchema.parse(request.params);
        const { reason } = lifecycleReasonSchema.parse(request.body);

        // Check permission
        if (!(await requireAccess(request, reply, store, 'org:manage', id))) {
          return;
        }

        // Verify it's a branch node
        const node = await store.getOrganizationNodeDetails(id);
        if (!node) {
          return reply.code(404).send({
            error: 'node_not_found',
            message: 'Organization node not found',
          });
        }

        if (node.type !== 'branch') {
          return reply.code(400).send({
            error: 'invalid_node_type',
            message: 'Only branch nodes can be reactivated. This operation is not supported for other node types.',
            details: { nodeType: node.type },
          });
        }

        // Execute lifecycle transition
        const result = await lifecycleService.reactivateBranch({
          tenantId: request.currentUser.tenantId,
          branchId: id,
          actorId: request.currentUser.id,
          reason,
        });

        return reply.code(200).send({
          success: true,
          data: result,
          message: 'Branch reactivated successfully',
        });
      } catch (error) {
        return handleLifecycleError(error, reply);
      }
    }
  );

  /**
   * Archive a branch
   * 
   * POST /v1/organization/nodes/:id/archive
   * 
   * Transitions branch from DISABLED → ARCHIVED (terminal state)
   * Branch removed from operational views, history preserved
   */
  app.post(
    '/v1/organization/nodes/:id/archive',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = nodeIdSchema.parse(request.params);
        const { reason } = lifecycleReasonSchema.parse(request.body);

        // Check permission
        if (!(await requireAccess(request, reply, store, 'org:manage', id))) {
          return;
        }

        // Verify it's a branch node
        const node = await store.getOrganizationNodeDetails(id);
        if (!node) {
          return reply.code(404).send({
            error: 'node_not_found',
            message: 'Organization node not found',
          });
        }

        if (node.type !== 'branch') {
          return reply.code(400).send({
            error: 'invalid_node_type',
            message: 'Only branch nodes can be archived. This operation is not supported for other node types.',
            details: { nodeType: node.type },
          });
        }

        // Execute lifecycle transition
        const result = await lifecycleService.archiveBranch({
          tenantId: request.currentUser.tenantId,
          branchId: id,
          actorId: request.currentUser.id,
          reason,
        });

        return reply.code(200).send({
          success: true,
          data: result,
          message: 'Branch archived successfully',
        });
      } catch (error) {
        return handleLifecycleError(error, reply);
      }
    }
  );

  /**
   * Get lifecycle impact analysis
   * 
   * GET /v1/organization/nodes/:id/lifecycle-impact?targetStatus=DISABLED
   * 
   * Shows what would be affected by a lifecycle transition
   * without actually performing it
   */
  app.get(
    '/v1/organization/nodes/:id/lifecycle-impact',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = nodeIdSchema.parse(request.params);
        const { targetStatus } = lifecycleImpactQuerySchema.parse(request.query);

        // Check permission
        if (!(await requireAccess(request, reply, store, 'org:manage', id))) {
          return;
        }

        // Verify it's a branch node
        const node = await store.getOrganizationNodeDetails(id);
        if (!node) {
          return reply.code(404).send({
            error: 'node_not_found',
            message: 'Organization node not found',
          });
        }

        if (node.type !== 'branch') {
          return reply.code(400).send({
            error: 'invalid_node_type',
            message: 'Lifecycle operations are only supported for branch nodes.',
            details: { nodeType: node.type },
          });
        }

        // Get impact analysis
        const impact = await lifecycleService.getLifecycleImpact(
          request.currentUser.tenantId,
          id,
          targetStatus
        );

        return reply.code(200).send({
          success: true,
          data: impact,
        });
      } catch (error) {
        return handleLifecycleError(error, reply);
      }
    }
  );
}

/**
 * Check if user has required access to the resource
 */
async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string,
): Promise<boolean> {
  const decision = await store.checkAccess(
    request.currentUser,
    action as any,
    resourceNodeId,
  );

  if (!decision) {
    await reply.code(404).send({
      error: 'resource_not_found',
      message: 'The requested resource was not found',
    });
    return false;
  }

  if (!decision.allowed) {
    await reply.code(403).send({
      error: 'forbidden',
      message: 'You do not have permission to perform this operation',
      reason: decision.reason,
    });
    return false;
  }

  return true;
}

/**
 * Handle lifecycle-specific errors with appropriate HTTP responses
 */
function handleLifecycleError(error: unknown, reply: FastifyReply) {
  console.error('Branch lifecycle operation error:', error);

  if (error instanceof BranchLifecycleError) {
    // Map lifecycle error codes to HTTP status codes
    const statusCode = getStatusCodeForLifecycleError(error.code);
    
    return reply.code(statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  // Generic error handling
  return reply.code(500).send({
    error: 'internal_server_error',
    message: error instanceof Error ? error.message : 'An unexpected error occurred',
  });
}

/**
 * Map lifecycle error codes to HTTP status codes
 */
function getStatusCodeForLifecycleError(code: string): number {
  switch (code) {
    case 'BRANCH_NOT_FOUND':
      return 404;
    case 'PERMISSION_DENIED':
      return 403;
    case 'INVALID_LIFECYCLE_TRANSITION':
      return 409; // Conflict
    case 'OPEN_INCIDENTS':
    case 'ACTIVE_ALERTS':
    case 'ACTIVE_RECORDINGS':
      return 422; // Unprocessable Entity
    case 'VERSION_CONFLICT':
      return 409; // Conflict
    default:
      return 500;
  }
}
