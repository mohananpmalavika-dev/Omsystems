/**
 * Branch Lifecycle Management Domain Types
 * 
 * Defines the lifecycle states, transitions, and validation rules for branches
 * in the organizational hierarchy.
 */

/**
 * Branch lifecycle status
 * 
 * ACTIVE: Branch is operational and receiving monitoring
 * DISABLED: Branch is temporarily inactive but can be reactivated
 * ARCHIVED: Branch is permanently removed from operations, history preserved
 */
export enum BranchStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Lifecycle metadata stored on the branch entity
 */
export interface BranchLifecycleMetadata {
  status: BranchStatus;
  
  // Disabled state metadata
  disabledAt: Date | null;
  disabledBy: string | null;
  disableReason: string | null;
  
  // Archived state metadata
  archivedAt: Date | null;
  archivedBy: string | null;
  archiveReason: string | null;
  
  // Optimistic concurrency control
  version: number;
}

/**
 * Lifecycle transition request
 */
export interface BranchLifecycleTransitionRequest {
  tenantId: string;
  branchId: string;
  actorId: string;
  reason: string;
}

/**
 * Lifecycle event for audit trail
 */
export interface BranchLifecycleEvent {
  id: string;
  tenantId: string;
  branchId: string;
  fromStatus: BranchStatus | null;
  toStatus: BranchStatus;
  actorId: string;
  reason: string;
  createdAt: Date;
}

/**
 * Lifecycle impact analysis
 */
export interface BranchLifecycleImpact {
  branchId: string;
  branchName: string;
  currentStatus: BranchStatus;
  requestedStatus: BranchStatus;
  
  impact: {
    cameras: number;
    recorders: number;
    activeAlerts: number;
    openIncidents: number;
    scheduledJobs: number;
    activeUsers: number;
    descendantNodes: number;
  };
  
  blockers: Array<{
    code: string;
    message: string;
    count?: number;
  }>;
  
  warnings: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  
  allowed: boolean;
}

/**
 * Lifecycle validation result
 */
export interface LifecycleValidationResult {
  allowed: boolean;
  
  blockers: Array<{
    code: string;
    message: string;
  }>;
  
  warnings: Array<{
    code: string;
    message: string;
  }>;
}

/**
 * Allowed lifecycle transitions
 * 
 * ACTIVE → DISABLED (can disable active branch)
 * DISABLED → ACTIVE (can reactivate disabled branch)
 * DISABLED → ARCHIVED (can archive disabled branch)
 * ARCHIVED → (no transitions allowed, terminal state)
 */
export const ALLOWED_TRANSITIONS: Record<BranchStatus, BranchStatus[]> = {
  [BranchStatus.ACTIVE]: [BranchStatus.DISABLED],
  [BranchStatus.DISABLED]: [BranchStatus.ACTIVE, BranchStatus.ARCHIVED],
  [BranchStatus.ARCHIVED]: [],
};

/**
 * Check if a lifecycle transition is allowed
 */
export function isTransitionAllowed(
  current: BranchStatus,
  target: BranchStatus
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(target);
}

/**
 * Get allowed transitions from current status
 */
export function getAllowedTransitions(current: BranchStatus): BranchStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

/**
 * Lifecycle transition error codes
 */
export enum LifecycleErrorCode {
  INVALID_TRANSITION = 'INVALID_LIFECYCLE_TRANSITION',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  OPEN_INCIDENTS = 'OPEN_INCIDENTS',
  ACTIVE_ALERTS = 'ACTIVE_ALERTS',
  ACTIVE_RECORDINGS = 'ACTIVE_RECORDINGS',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}

/**
 * Domain error for lifecycle operations
 */
export class BranchLifecycleError extends Error {
  constructor(
    public readonly code: LifecycleErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BranchLifecycleError';
  }
}

/**
 * Lifecycle transition event types for event bus
 */
export enum BranchLifecycleEventType {
  BRANCH_DISABLED = 'branch.disabled',
  BRANCH_REACTIVATED = 'branch.reactivated',
  BRANCH_ARCHIVED = 'branch.archived',
}

/**
 * Event payload for lifecycle transitions
 */
export interface BranchLifecycleEventPayload {
  tenantId: string;
  branchId: string;
  branchName: string;
  fromStatus: BranchStatus | null;
  toStatus: BranchStatus;
  actorId: string;
  reason: string;
  timestamp: Date;
}
