/**
 * Recipient Resolver Service
 * 
 * Orchestrates recipient resolution from selectors to principals.
 * Handles tenant scoping, deduplication, and provenance tracking.
 */

import { logger } from '../../utils/logger.js';
import {
  RecipientSelector,
  RecipientResolutionContext,
  RecipientResolutionResult,
  ResolvedPrincipal,
  RecipientResolutionFailure,
  ResolutionFailureCode,
  RecipientProvenance,
  ExternalPrincipal,
  UserIdentity,
  BranchMembership,
  TenantMembership,
  IncidentReference,
  BranchReference,
  OnCallAssignment,
  EscalationPolicy,
  assertNever,
  createPrincipalKey,
  mergeProvenances,
  normalizeE164,
} from './recipient.types.js';

/**
 * Repository interfaces for tenant-scoped queries
 * These will be implemented by actual repository classes
 */
export interface IUserRepository {
  findActiveTenantUser(params: {
    tenantId: string;
    userId: string;
  }): Promise<UserIdentity | null>;
}

export interface IMembershipRepository {
  findUsersByBranchRole(params: {
    tenantId: string;
    branchId: string;
    role: string;
    status?: string;
  }): Promise<UserIdentity[]>;

  findUsersByTenantRole(params: {
    tenantId: string;
    role: string;
    status?: string;
  }): Promise<UserIdentity[]>;
}

export interface IBranchRepository {
  findByIdForTenant(
    branchId: string,
    tenantId: string
  ): Promise<BranchReference | null>;
}

export interface IIncidentRepository {
  findByIdForTenant(
    incidentId: string,
    tenantId: string
  ): Promise<IncidentReference | null>;
}

export interface IOnCallService {
  resolveCurrentAssignments(params: {
    tenantId: string;
    scheduleId: string;
    at: Date;
  }): Promise<OnCallAssignment[]>;
}

export interface IEscalationPolicyService {
  findForTenant(
    policyId: string,
    tenantId: string
  ): Promise<EscalationPolicy | null>;
}

/**
 * RecipientResolver - main orchestration service
 */
export class RecipientResolver {
  // Track visited policies to prevent infinite recursion
  private visitedPolicies = new Set<string>();
  private maxRecursionDepth = 5;
  
  constructor(
    private readonly users: IUserRepository,
    private readonly memberships: IMembershipRepository,
    private readonly branches: IBranchRepository,
    private readonly incidents: IIncidentRepository,
    private readonly onCall: IOnCallService,
    private readonly escalationPolicies: IEscalationPolicyService,
  ) {}

  /**
   * Resolve recipient selectors to principals
   */
  async resolve(
    selectors: RecipientSelector[],
    context: RecipientResolutionContext,
  ): Promise<RecipientResolutionResult> {
    const startTime = Date.now();
    const principals: ResolvedPrincipal[] = [];
    const failures: RecipientResolutionFailure[] = [];

    // Reset recursion tracking
    this.visitedPolicies.clear();

    logger.debug('Starting recipient resolution', {
      tenantId: context.tenantId,
      selectorCount: selectors.length,
      notificationType: context.notificationType,
    });

    // Resolve each selector
    for (const selector of selectors) {
      try {
        const result = await this.resolveSelector(selector, context, 0);
        principals.push(...result.principals);
        failures.push(...result.failures);
      } catch (error) {
        logger.error('Selector resolution error', {
          selector,
          error,
        });
        
        failures.push({
          selector,
          code: 'INVALID_SELECTOR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Deduplicate principals
    const principalsBeforeDedup = principals.length;
    const deduplicated = this.deduplicatePrincipals(principals);

    // Determine resolution state
    const state = this.determineResolutionState(
      selectors.length,
      deduplicated.length,
      failures.length
    );

    const durationMs = Date.now() - startTime;

    logger.info('Recipient resolution complete', {
      tenantId: context.tenantId,
      state,
      principalsResolved: deduplicated.length,
      failures: failures.length,
      durationMs,
    });

    return {
      state,
      principals: deduplicated,
      failures,
      metadata: {
        selectorsProcessed: selectors.length,
        principalsBeforeDedup,
        durationMs,
      },
    };
  }

  /**
   * Resolve a single selector
   */
  private async resolveSelector(
    selector: RecipientSelector,
    context: RecipientResolutionContext,
    depth: number,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    // Check recursion depth
    if (depth > this.maxRecursionDepth) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INVALID_SELECTOR',
          message: 'Maximum recursion depth exceeded',
        }],
      };
    }

    switch (selector.type) {
      case 'USER':
        return this.resolveExplicitUser(selector, context);

      case 'EMAIL':
        return this.resolveExplicitEmail(selector, context);

      case 'PHONE':
        return this.resolveExplicitPhone(selector, context);

      case 'BRANCH_ROLE':
        return this.resolveBranchRole(selector, context);

      case 'TENANT_ROLE':
        return this.resolveTenantRole(selector, context);

      case 'ON_CALL':
        return this.resolveOnCall(selector, context);

      case 'INCIDENT_ASSIGNEE':
        return this.resolveIncidentAssignee(selector, context);

      case 'ESCALATION_POLICY':
        return this.resolveEscalationPolicy(selector, context, depth);

      default:
        return assertNever(selector);
    }
  }

  /**
   * Resolve explicit user selector
   * Validates tenant membership and active status
   */
  private async resolveExplicitUser(
    selector: Extract<RecipientSelector, { type: 'USER' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    const user = await this.users.findActiveTenantUser({
      tenantId: context.tenantId,
      userId: selector.userId,
    });

    if (!user) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'USER_NOT_FOUND',
          message: `User ${selector.userId} not found or inactive in tenant ${context.tenantId}`,
        }],
      };
    }

    if (user.status !== 'ACTIVE') {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'USER_INACTIVE',
          message: `User ${selector.userId} is ${user.status}`,
        }],
      };
    }

    return {
      principals: [{
        type: 'USER',
        userId: user.id,
        tenantId: context.tenantId,
        displayName: user.displayName,
        active: true,
        provenance: [{
          source: 'EXPLICIT_USER',
          selector: selector.userId,
          resolvedAt: context.now,
        }],
      }],
      failures: [],
    };
  }

  /**
   * Resolve explicit email selector
   * Creates external principal
   */
  private async resolveExplicitEmail(
    selector: Extract<RecipientSelector, { type: 'EMAIL' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(selector.email)) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INVALID_SELECTOR',
          message: `Invalid email format: ${selector.email}`,
        }],
      };
    }

    const principal: ExternalPrincipal = {
      type: 'EXTERNAL',
      tenantId: context.tenantId,
      displayName: selector.email,
      active: true,
      externalEndpoint: {
        channel: 'EMAIL',
        address: selector.email.toLowerCase().trim(),
      },
      provenance: [{
        source: 'EXPLICIT_EMAIL',
        selector: selector.email,
        resolvedAt: context.now,
      }],
    };

    return {
      principals: [principal],
      failures: [],
    };
  }

  /**
   * Resolve explicit phone selector
   * Creates external principal with normalized phone
   */
  private async resolveExplicitPhone(
    selector: Extract<RecipientSelector, { type: 'PHONE' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    try {
      const normalizedPhone = normalizeE164(selector.phone);

      const principal: ExternalPrincipal = {
        type: 'EXTERNAL',
        tenantId: context.tenantId,
        displayName: normalizedPhone,
        active: true,
        externalEndpoint: {
          channel: 'SMS',
          address: normalizedPhone,
        },
        provenance: [{
          source: 'EXPLICIT_PHONE',
          selector: selector.phone,
          resolvedAt: context.now,
        }],
      };

      return {
        principals: [principal],
        failures: [],
      };
    } catch (error) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INVALID_SELECTOR',
          message: `Invalid phone number: ${selector.phone}`,
        }],
      };
    }
  }

  /**
   * Resolve branch role
   * Critical: enforces branch and tenant scoping
   */
  private async resolveBranchRole(
    selector: Extract<RecipientSelector, { type: 'BRANCH_ROLE' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    // Validate branch exists and belongs to tenant
    const branch = await this.branches.findByIdForTenant(
      selector.branchId,
      context.tenantId
    );

    if (!branch) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'BRANCH_NOT_FOUND',
          message: `Branch ${selector.branchId} not found in tenant ${context.tenantId}`,
        }],
      };
    }

    // Find all users with this role in this branch
    const users = await this.memberships.findUsersByBranchRole({
      tenantId: context.tenantId,
      branchId: selector.branchId,
      role: selector.role,
      status: 'ACTIVE',
    });

    if (users.length === 0) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'ROLE_EMPTY',
          message: `No active users with role ${selector.role} in branch ${selector.branchId}`,
          metadata: {
            branchId: selector.branchId,
            branchName: branch.name,
          },
        }],
      };
    }

    // Convert to principals
    const principals: ResolvedPrincipal[] = users.map(user => ({
      type: 'USER',
      userId: user.id,
      tenantId: context.tenantId,
      displayName: user.displayName,
      active: true,
      provenance: [{
        source: 'BRANCH_ROLE',
        selector: selector.role,
        branchId: selector.branchId,
        resolvedAt: context.now,
      }],
    }));

    logger.debug('Resolved branch role', {
      branchId: selector.branchId,
      role: selector.role,
      userCount: principals.length,
    });

    return {
      principals,
      failures: [],
    };
  }

  /**
   * Resolve tenant role
   * Similar to branch role but tenant-wide
   */
  private async resolveTenantRole(
    selector: Extract<RecipientSelector, { type: 'TENANT_ROLE' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    const users = await this.memberships.findUsersByTenantRole({
      tenantId: context.tenantId,
      role: selector.role,
      status: 'ACTIVE',
    });

    if (users.length === 0) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'ROLE_EMPTY',
          message: `No active users with tenant role ${selector.role}`,
        }],
      };
    }

    const principals: ResolvedPrincipal[] = users.map(user => ({
      type: 'USER',
      userId: user.id,
      tenantId: context.tenantId,
      displayName: user.displayName,
      active: true,
      provenance: [{
        source: 'TENANT_ROLE',
        selector: selector.role,
        resolvedAt: context.now,
      }],
    }));

    return {
      principals,
      failures: [],
    };
  }

  /**
   * Resolve on-call schedule
   * Time-aware resolution with timezone support
   */
  private async resolveOnCall(
    selector: Extract<RecipientSelector, { type: 'ON_CALL' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    const assignments = await this.onCall.resolveCurrentAssignments({
      tenantId: context.tenantId,
      scheduleId: selector.scheduleId,
      at: context.now,
    });

    if (assignments.length === 0) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'NO_ON_CALL_USER',
          message: `No on-call user for schedule ${selector.scheduleId} at ${context.now.toISOString()}`,
        }],
      };
    }

    // Verify each assigned user still exists and is active
    const principals: ResolvedPrincipal[] = [];
    const failures: RecipientResolutionFailure[] = [];

    for (const assignment of assignments) {
      const user = await this.users.findActiveTenantUser({
        tenantId: context.tenantId,
        userId: assignment.userId,
      });

      if (user && user.status === 'ACTIVE') {
        principals.push({
          type: 'USER',
          userId: user.id,
          tenantId: context.tenantId,
          displayName: user.displayName,
          active: true,
          provenance: [{
            source: 'ON_CALL',
            selector: selector.scheduleId,
            resolvedAt: context.now,
          }],
        });
      }
    }

    return {
      principals,
      failures,
    };
  }

  /**
   * Resolve incident assignee
   * Authoritative incident state lookup
   */
  private async resolveIncidentAssignee(
    selector: Extract<RecipientSelector, { type: 'INCIDENT_ASSIGNEE' }>,
    context: RecipientResolutionContext,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    const incident = await this.incidents.findByIdForTenant(
      selector.incidentId,
      context.tenantId
    );

    if (!incident) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INCIDENT_NOT_FOUND',
          message: `Incident ${selector.incidentId} not found in tenant ${context.tenantId}`,
        }],
      };
    }

    if (!incident.assignedUserId) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INCIDENT_UNASSIGNED',
          message: `Incident ${selector.incidentId} has no assignee`,
          metadata: {
            incidentId: incident.id,
            status: incident.status,
          },
        }],
      };
    }

    const user = await this.users.findActiveTenantUser({
      tenantId: context.tenantId,
      userId: incident.assignedUserId,
    });

    if (!user || user.status !== 'ACTIVE') {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'USER_INACTIVE',
          message: `Incident assignee ${incident.assignedUserId} is not active`,
        }],
      };
    }

    return {
      principals: [{
        type: 'USER',
        userId: user.id,
        tenantId: context.tenantId,
        displayName: user.displayName,
        active: true,
        provenance: [{
          source: 'INCIDENT_ASSIGNEE',
          selector: selector.incidentId,
          incidentId: selector.incidentId,
          resolvedAt: context.now,
        }],
      }],
      failures: [],
    };
  }

  /**
   * Resolve escalation policy
   * Recursively expands policy levels with circular dependency protection
   */
  private async resolveEscalationPolicy(
    selector: Extract<RecipientSelector, { type: 'ESCALATION_POLICY' }>,
    context: RecipientResolutionContext,
    depth: number,
  ): Promise<{
    principals: ResolvedPrincipal[];
    failures: RecipientResolutionFailure[];
  }> {
    // Check for circular policy references
    if (this.visitedPolicies.has(selector.policyId)) {
      return {
        principals: [],
        failures: [{
          selector,
          code: 'INVALID_SELECTOR',
          message: `Circular escalation policy reference detected: ${selector.policyId}`,
        }],
      };
    }

    this.visitedPolicies.add(selector.policyId);

    try {
      const policy = await this.escalationPolicies.findForTenant(
        selector.policyId,
        context.tenantId
      );

      if (!policy) {
        return {
          principals: [],
          failures: [{
            selector,
            code: 'ESCALATION_POLICY_NOT_FOUND',
            message: `Escalation policy ${selector.policyId} not found`,
          }],
        };
      }

      if (!policy.enabled) {
        return {
          principals: [],
          failures: [{
            selector,
            code: 'ESCALATION_POLICY_NOT_FOUND',
            message: `Escalation policy ${selector.policyId} is disabled`,
          }],
        };
      }

      // Get the specific level or default to level 1
      const requestedLevel = selector.level ?? 1;
      const level = policy.levels.find(l => l.level === requestedLevel);

      if (!level) {
        return {
          principals: [],
          failures: [{
            selector,
            code: 'ESCALATION_LEVEL_NOT_FOUND',
            message: `Level ${requestedLevel} not found in policy ${selector.policyId}`,
          }],
        };
      }

      // Recursively resolve the level's recipients
      const allPrincipals: ResolvedPrincipal[] = [];
      const allFailures: RecipientResolutionFailure[] = [];

      for (const levelSelector of level.recipients) {
        const result = await this.resolveSelector(
          levelSelector,
          context,
          depth + 1
        );
        
        allPrincipals.push(...result.principals);
        allFailures.push(...result.failures);
      }

      // If primary resolution failed and fallback is configured
      if (allPrincipals.length === 0 && level.fallbackRecipients) {
        logger.warn('Primary escalation recipients failed, trying fallback', {
          policyId: selector.policyId,
          level: requestedLevel,
        });

        for (const fallbackSelector of level.fallbackRecipients) {
          const result = await this.resolveSelector(
            fallbackSelector,
            context,
            depth + 1
          );
          
          allPrincipals.push(...result.principals);
          allFailures.push(...result.failures);
        }
      }

      // Add escalation policy provenance to all principals
      const principalsWithProvenance = allPrincipals.map(principal => ({
        ...principal,
        provenance: [
          ...principal.provenance,
          {
            source: 'ESCALATION_POLICY' as const,
            selector: selector.policyId,
            policyId: selector.policyId,
            escalationLevel: requestedLevel,
            resolvedAt: context.now,
          },
        ],
      }));

      return {
        principals: principalsWithProvenance,
        failures: allFailures,
      };
    } finally {
      this.visitedPolicies.delete(selector.policyId);
    }
  }

  /**
   * Deduplicate principals by user ID or external endpoint
   * Merges provenance from duplicates
   */
  private deduplicatePrincipals(
    principals: ResolvedPrincipal[]
  ): ResolvedPrincipal[] {
    const map = new Map<string, ResolvedPrincipal>();

    for (const principal of principals) {
      const key = createPrincipalKey(principal);
      const existing = map.get(key);

      if (!existing) {
        map.set(key, principal);
        continue;
      }

      // Merge provenance
      existing.provenance = mergeProvenances([
        existing.provenance,
        principal.provenance,
      ]);
    }

    return [...map.values()];
  }

  /**
   * Determine overall resolution state
   */
  private determineResolutionState(
    selectorCount: number,
    principalCount: number,
    failureCount: number
  ): 'RESOLVED' | 'PARTIAL' | 'UNRESOLVED' {
    if (principalCount === 0) {
      return 'UNRESOLVED';
    }

    if (failureCount === 0) {
      return 'RESOLVED';
    }

    return 'PARTIAL';
  }
}
