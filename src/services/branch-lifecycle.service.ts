/**
 * Branch Lifecycle Management Service
 * 
 * Manages branch lifecycle transitions (ACTIVE → DISABLED → ARCHIVED)
 * with proper validation, audit logging, and event publishing.
 */

import type { ControlPlaneStore, OrganizationStore } from '../control-plane-store.js';
import type { EventBus } from '../infrastructure/event-bus/event-bus.js';
import {
  BranchStatus,
  BranchLifecycleError,
  BranchLifecycleEventType,
  LifecycleErrorCode,
  isTransitionAllowed,
  type BranchLifecycleTransitionRequest,
  type BranchLifecycleImpact,
  type BranchLifecycleEventPayload,
  type LifecycleValidationResult,
} from '../domain/branch-lifecycle.types.js';

export class BranchLifecycleService {
  constructor(
    private readonly store: ControlPlaneStore & OrganizationStore,
    private readonly eventBus?: EventBus,
  ) {}

  /**
   * Disable a branch
   * 
   * Transitions from ACTIVE → DISABLED
   * Branch remains queryable but stops receiving monitoring operations
   */
  async disableBranch(
    request: BranchLifecycleTransitionRequest
  ): Promise<any> {
    const { tenantId, branchId, actorId, reason } = request;

    // Get current node
    const node = await this.store.getOrganizationNodeDetails(branchId);
    
    if (!node) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.BRANCH_NOT_FOUND,
        'Branch not found'
      );
    }

    if (node.tenantId !== tenantId) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.PERMISSION_DENIED,
        'Branch does not belong to tenant'
      );
    }

    // Get current status (default to ACTIVE for backward compatibility)
    const currentStatus = (node.metadata?.lifecycleStatus as BranchStatus) || BranchStatus.ACTIVE;

    // Check if transition is allowed
    if (!isTransitionAllowed(currentStatus, BranchStatus.DISABLED)) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.INVALID_TRANSITION,
        `Cannot disable branch in ${currentStatus} status. ${
          currentStatus === BranchStatus.DISABLED
            ? 'Branch is already disabled.'
            : 'Archived branches cannot be disabled.'
        }`
      );
    }

    // If already disabled, return idempotently
    if (currentStatus === BranchStatus.DISABLED) {
      return node;
    }

    // Validate transition
    const validation = await this.validateDisable(tenantId, branchId);
    if (!validation.allowed) {
      const blockerMessages = validation.blockers.map(b => b.message).join(', ');
      throw new BranchLifecycleError(
        LifecycleErrorCode.OPEN_INCIDENTS,
        `Cannot disable branch: ${blockerMessages}`,
        { blockers: validation.blockers }
      );
    }

    // Update node with lifecycle metadata
    const updated = await this.store.updateOrganizationNode(branchId, {
      metadata: {
        ...node.metadata,
        lifecycleStatus: BranchStatus.DISABLED,
        disabledAt: new Date().toISOString(),
        disabledBy: actorId,
        disableReason: reason,
        lifecycleVersion: (node.metadata?.lifecycleVersion || 0) + 1,
      },
    });

    // Write audit event
    await this.store.writeAudit({
      tenantId,
      actorUserId: actorId,
      action: 'organization.branch_disabled',
      resourceNodeId: branchId,
      outcome: 'success',
      details: {
        fromStatus: currentStatus,
        toStatus: BranchStatus.DISABLED,
        reason,
      },
    });

    // Publish domain event
    await this.publishLifecycleEvent({
      type: BranchLifecycleEventType.BRANCH_DISABLED,
      payload: {
        tenantId,
        branchId,
        branchName: node.name,
        fromStatus: currentStatus,
        toStatus: BranchStatus.DISABLED,
        actorId,
        reason,
        timestamp: new Date(),
      },
    });

    return updated;
  }

  /**
   * Reactivate a disabled branch
   * 
   * Transitions from DISABLED → ACTIVE
   * Restores monitoring operations
   */
  async reactivateBranch(
    request: BranchLifecycleTransitionRequest
  ): Promise<any> {
    const { tenantId, branchId, actorId, reason } = request;

    // Get current node
    const node = await this.store.getOrganizationNodeDetails(branchId);
    
    if (!node) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.BRANCH_NOT_FOUND,
        'Branch not found'
      );
    }

    if (node.tenantId !== tenantId) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.PERMISSION_DENIED,
        'Branch does not belong to tenant'
      );
    }

    // Get current status
    const currentStatus = (node.metadata?.lifecycleStatus as BranchStatus) || BranchStatus.ACTIVE;

    // Check if transition is allowed
    if (!isTransitionAllowed(currentStatus, BranchStatus.ACTIVE)) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.INVALID_TRANSITION,
        `Cannot reactivate branch in ${currentStatus} status. ${
          currentStatus === BranchStatus.ACTIVE
            ? 'Branch is already active.'
            : 'Archived branches cannot be reactivated.'
        }`
      );
    }

    // If already active, return idempotently
    if (currentStatus === BranchStatus.ACTIVE) {
      return node;
    }

    // Validate reactivation prerequisites
    const validation = await this.validateReactivate(tenantId, branchId);
    if (!validation.allowed) {
      const blockerMessages = validation.blockers.map(b => b.message).join(', ');
      throw new BranchLifecycleError(
        LifecycleErrorCode.INVALID_TRANSITION,
        `Cannot reactivate branch: ${blockerMessages}`,
        { blockers: validation.blockers }
      );
    }

    // Update node with lifecycle metadata
    const updated = await this.store.updateOrganizationNode(branchId, {
      metadata: {
        ...node.metadata,
        lifecycleStatus: BranchStatus.ACTIVE,
        reactivatedAt: new Date().toISOString(),
        reactivatedBy: actorId,
        reactivateReason: reason,
        lifecycleVersion: (node.metadata?.lifecycleVersion || 0) + 1,
      },
      isActive: true, // Ensure node is marked active in organization hierarchy
    });

    // Write audit event
    await this.store.writeAudit({
      tenantId,
      actorUserId: actorId,
      action: 'organization.branch_reactivated',
      resourceNodeId: branchId,
      outcome: 'success',
      details: {
        fromStatus: currentStatus,
        toStatus: BranchStatus.ACTIVE,
        reason,
      },
    });

    // Publish domain event
    await this.publishLifecycleEvent({
      type: BranchLifecycleEventType.BRANCH_REACTIVATED,
      payload: {
        tenantId,
        branchId,
        branchName: node.name,
        fromStatus: currentStatus,
        toStatus: BranchStatus.ACTIVE,
        actorId,
        reason,
        timestamp: new Date(),
      },
    });

    return updated;
  }

  /**
   * Archive a branch
   * 
   * Transitions from DISABLED → ARCHIVED (terminal state)
   * Branch disappears from operational views but history is preserved
   */
  async archiveBranch(
    request: BranchLifecycleTransitionRequest
  ): Promise<any> {
    const { tenantId, branchId, actorId, reason } = request;

    // Get current node
    const node = await this.store.getOrganizationNodeDetails(branchId);
    
    if (!node) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.BRANCH_NOT_FOUND,
        'Branch not found'
      );
    }

    if (node.tenantId !== tenantId) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.PERMISSION_DENIED,
        'Branch does not belong to tenant'
      );
    }

    // Get current status
    const currentStatus = (node.metadata?.lifecycleStatus as BranchStatus) || BranchStatus.ACTIVE;

    // Check if transition is allowed (must be DISABLED first)
    if (!isTransitionAllowed(currentStatus, BranchStatus.ARCHIVED)) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.INVALID_TRANSITION,
        `Cannot archive branch in ${currentStatus} status. ${
          currentStatus === BranchStatus.ACTIVE
            ? 'Branch must be disabled before archiving.'
            : 'Branch is already archived.'
        }`
      );
    }

    // If already archived, return idempotently
    if (currentStatus === BranchStatus.ARCHIVED) {
      return node;
    }

    // Validate archival
    const validation = await this.validateArchive(tenantId, branchId);
    if (!validation.allowed) {
      const blockerMessages = validation.blockers.map(b => b.message).join(', ');
      throw new BranchLifecycleError(
        LifecycleErrorCode.OPEN_INCIDENTS,
        `Cannot archive branch: ${blockerMessages}`,
        { blockers: validation.blockers }
      );
    }

    // Update node with lifecycle metadata
    const updated = await this.store.updateOrganizationNode(branchId, {
      metadata: {
        ...node.metadata,
        lifecycleStatus: BranchStatus.ARCHIVED,
        archivedAt: new Date().toISOString(),
        archivedBy: actorId,
        archiveReason: reason,
        lifecycleVersion: (node.metadata?.lifecycleVersion || 0) + 1,
      },
      isActive: false, // Mark as inactive in organization hierarchy
    });

    // Write audit event
    await this.store.writeAudit({
      tenantId,
      actorUserId: actorId,
      action: 'organization.branch_archived',
      resourceNodeId: branchId,
      outcome: 'success',
      details: {
        fromStatus: currentStatus,
        toStatus: BranchStatus.ARCHIVED,
        reason,
      },
    });

    // Publish domain event
    await this.publishLifecycleEvent({
      type: BranchLifecycleEventType.BRANCH_ARCHIVED,
      payload: {
        tenantId,
        branchId,
        branchName: node.name,
        fromStatus: currentStatus,
        toStatus: BranchStatus.ARCHIVED,
        actorId,
        reason,
        timestamp: new Date(),
      },
    });

    return updated;
  }

  /**
   * Get lifecycle impact analysis
   * 
   * Shows what would be affected by a lifecycle transition
   */
  async getLifecycleImpact(
    tenantId: string,
    branchId: string,
    targetStatus: BranchStatus
  ): Promise<BranchLifecycleImpact> {
    const node = await this.store.getOrganizationNodeDetails(branchId);
    
    if (!node || node.tenantId !== tenantId) {
      throw new BranchLifecycleError(
        LifecycleErrorCode.BRANCH_NOT_FOUND,
        'Branch not found'
      );
    }

    const currentStatus = (node.metadata?.lifecycleStatus as BranchStatus) || BranchStatus.ACTIVE;

    // Count affected resources
    const descendants = await this.store.getDescendantNodes(branchId, false);
    
    // Count cameras under this branch
    const cameras = await this.countCamerasInBranch(tenantId, branchId);
    
    // Count recorders under this branch
    const recorders = await this.countRecordersInBranch(tenantId, branchId);
    
    // Count open incidents
    // Count open incidents
    const openIncidents = await this.countOpenIncidents(tenantId, branchId);
    
    // Count active alerts
    const activeAlerts = await this.countActiveAlerts(tenantId, branchId);

    // Count scheduled jobs
    const scheduledJobs = await this.countScheduledJobs(tenantId, branchId);

    // Count active users
    const activeUsers = await this.countActiveUsers(tenantId, branchId);

    // Determine blockers and warnings based on target status
    const blockers: Array<{ code: string; message: string; count?: number }> = [];
    const warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];

    // Validate transition
    if (!isTransitionAllowed(currentStatus, targetStatus)) {
      blockers.push({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${currentStatus} to ${targetStatus}`,
      });
    }

    // Archive-specific validation
    if (targetStatus === BranchStatus.ARCHIVED) {
      if (openIncidents > 0) {
        blockers.push({
          code: 'OPEN_INCIDENTS',
          message: `${openIncidents} open incident(s) must be resolved first`,
          count: openIncidents,
        });
      }

      if (activeAlerts > 0) {
        warnings.push({
          code: 'ACTIVE_ALERTS',
          message: `${activeAlerts} active alert(s) will be suppressed`,
          details: { count: activeAlerts },
        });
      }
    }

    // General warnings
    if (cameras > 0) {
      warnings.push({
        code: 'ACTIVE_CAMERAS',
        message: `${cameras} camera(s) will stop being monitored`,
        details: { count: cameras },
      });
    }

    if (recorders > 0) {
      warnings.push({
        code: 'ACTIVE_RECORDERS',
        message: `${recorders} recorder(s) will stop being polled`,
        details: { count: recorders },
      });
    }

    if (descendants.length > 0) {
      warnings.push({
        code: 'DESCENDANT_NODES',
        message: `${descendants.length} child node(s) will be affected`,
        details: { count: descendants.length },
      });
    }

    if (scheduledJobs > 0) {
      warnings.push({
        code: 'SCHEDULED_JOBS',
        message: `${scheduledJobs} scheduled or running job(s) will be halted`,
        details: { count: scheduledJobs },
      });
    }

    if (activeUsers > 0) {
      warnings.push({
        code: 'ACTIVE_USERS',
        message: `${activeUsers} active user(s) assigned to this branch`,
        details: { count: activeUsers },
      });
    }

    return {
      branchId,
      branchName: node.name,
      currentStatus,
      requestedStatus: targetStatus,
      impact: {
        cameras,
        recorders,
        activeAlerts,
        openIncidents,
        scheduledJobs,
        activeUsers,
        descendantNodes: descendants.length,
      },
      blockers,
      warnings,
      allowed: blockers.length === 0,
    };
  }

  /**
   * Validate disable operation
   */
  private async validateDisable(
    tenantId: string,
    branchId: string
  ): Promise<LifecycleValidationResult> {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];

    // Disabling is generally safe - no hard blockers
    // Warnings are informational

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Validate reactivate operation
   */
  private async validateReactivate(
    tenantId: string,
    branchId: string
  ): Promise<LifecycleValidationResult> {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];

    // Check if parent node is active
    const node = await this.store.getOrganizationNodeDetails(branchId);
    if (node?.parentId) {
      const parent = await this.store.getOrganizationNodeDetails(node.parentId);
      if (parent && !parent.isActive) {
        blockers.push({
          code: 'PARENT_INACTIVE',
          message: 'Parent node must be active before reactivating this branch',
        });
      }
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Validate archive operation
   */
  private async validateArchive(
    tenantId: string,
    branchId: string
  ): Promise<LifecycleValidationResult> {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];

    // Check for open incidents
    const openIncidents = await this.countOpenIncidents(tenantId, branchId);
    if (openIncidents > 0) {
      blockers.push({
        code: 'OPEN_INCIDENTS',
        message: `${openIncidents} open incident(s) must be resolved before archiving`,
      });
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Count cameras in branch (including descendants)
   */
  private async countCamerasInBranch(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          'SELECT COUNT(*) as count FROM cameras WHERE (branch_id = $1 OR node_id = $1) AND tenant_id = $2',
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      const cams = await this.store.listAccessibleCameras({ tenantId } as any, 'live:view', { limit: 1000, offset: 0 });
      return cams.cameras.filter((c: any) => c.branchId === branchId || c.nodeId === branchId).length;
    } catch {
      return 0;
    }
  }

  /**
   * Count recorders in branch (including descendants)
   */
  private async countRecordersInBranch(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          'SELECT COUNT(*) as count FROM recorders WHERE (branch_id = $1 OR node_id = $1) AND tenant_id = $2',
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Count open incidents in branch
   */
  private async countOpenIncidents(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          "SELECT COUNT(*) as count FROM incidents WHERE branch_id = $1 AND tenant_id = $2 AND status != 'closed'",
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      const incidents = await this.store.listIncidents(tenantId, { branchId, limit: 100 });
      return incidents.filter((i) => i.status !== 'closed').length;
    } catch {
      return 0;
    }
  }

  /**
   * Count active alerts in branch
   */
  private async countActiveAlerts(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          "SELECT COUNT(*) as count FROM analytics_alerts WHERE branch_id = $1 AND tenant_id = $2 AND status IN ('new', 'acknowledged', 'investigating', 'escalated')",
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      const alerts = await this.store.listAnalyticsAlerts(tenantId, { branchId, limit: 1000 });
      return alerts.filter((a) => a.status !== 'resolved' && a.status !== 'false_alarm' && a.status !== 'suppressed').length;
    } catch {
      return 0;
    }
  }

  /**
   * Count scheduled jobs in branch
   */
  private async countScheduledJobs(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          "SELECT COUNT(*) as count FROM device_jobs WHERE (branch_id = $1 OR node_id = $1) AND tenant_id = $2 AND status IN ('pending', 'running')",
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Count active users assigned to branch
   */
  private async countActiveUsers(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    try {
      if ((this.store as any).db?.query) {
        const res = await (this.store as any).db.query(
          "SELECT COUNT(*) as count FROM users WHERE (branch_id = $1 OR default_node_id = $1) AND tenant_id = $2 AND status = 'active'",
          [branchId, tenantId]
        );
        return parseInt(res.rows[0]?.count || '0', 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Publish lifecycle event to event bus
   */
  private async publishLifecycleEvent(event: {
    type: BranchLifecycleEventType;
    payload: BranchLifecycleEventPayload;
  }): Promise<void> {
    if (!this.eventBus) {
      console.warn('EventBus not available, skipping event publication');
      return;
    }

    try {
      await this.eventBus.publish(
        event.type,
        event.payload,
        {
          tenantId: event.payload.tenantId || 'system',
          branchId: event.payload.branchId,
        }
      );
    } catch (error) {
      console.error('Error publishing lifecycle event:', error);
      // Don't throw - event publication failure shouldn't block the operation
    }
  }
}
