/**
 * Authorization Policy Engine
 * Policy-Based Access Control (PBAC) with attribute evaluation
 */

import {
  IAuthorizationEngine,
  ProviderContext,
  AuthorizationResult,
  PolicyMatch,
  Permission,
  PolicyCondition,
  AttributeSet,
  SecurityVerdict
} from './types';

interface Policy {
  id: string;
  name: string;
  description: string;
  effect: 'allow' | 'deny';
  priority: number; // Higher priority wins
  subjects: PolicyRule; // Who: user attributes
  resources: PolicyRule; // What: resource attributes
  actions: string[]; // Which actions
  conditions: PolicyCondition[]; // When/Where/How
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PolicyRule {
  type: 'all' | 'any' | 'match';
  attributes: Record<string, any>;
}

interface RolePermission {
  role: string;
  permissions: Permission[];
}

interface UserRole {
  userId: string;
  roles: string[];
  grantedAt: Date;
  expiresAt?: Date;
}

export class AuthorizationEngine implements IAuthorizationEngine {
  readonly name = 'AuthorizationEngine';
  readonly version = '1.0.0';

  private policies: Map<string, Policy> = new Map();
  private rolePermissions: Map<string, RolePermission> = new Map();
  private userRoles: Map<string, UserRole> = new Map();
  private userPermissions: Map<string, Permission[]> = new Map(); // Direct user permissions

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Verify authorization for access request
   */
  async verify(context: ProviderContext): Promise<AuthorizationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];

    // 1. Build attribute set
    const attributes = this.buildAttributeSet(context);
    evidence.attributes = attributes;

    // 2. Evaluate policies
    const matchedPolicies = await this.evaluatePolicies(attributes);
    evidence.matchedPolicies = matchedPolicies.length;

    // Sort by priority (highest first)
    matchedPolicies.sort((a, b) => b.priority - a.priority);

    // 3. Determine authorization decision
    let authorized = false;
    let finalEffect: 'allow' | 'deny' | null = null;

    // Explicit deny always wins
    const denyPolicy = matchedPolicies.find(p => p.effect === 'deny');
    if (denyPolicy) {
      authorized = false;
      finalEffect = 'deny';
      score = 100;
      reasons.push(`Denied by policy: ${denyPolicy.policyName}`);
    } else {
      // Check for allow policies
      const allowPolicy = matchedPolicies.find(p => p.effect === 'allow');
      if (allowPolicy) {
        authorized = true;
        finalEffect = 'allow';
        reasons.push(`Allowed by policy: ${allowPolicy.policyName}`);
      } else {
        // Default deny (no matching policy)
        authorized = false;
        score = 80;
        reasons.push('No matching policy - default deny');
      }
    }

    // 4. Get effective permissions
    const effectivePermissions = await this.getEffectivePermissions(context.userId);
    evidence.effectivePermissionsCount = effectivePermissions.length;

    // 5. Check if specific permission exists
    const hasPermission = await this.checkPermission(
      context.userId,
      context.resource,
      context.action
    );
    evidence.hasPermission = hasPermission;

    if (!hasPermission && authorized) {
      score += 20;
      reasons.push('Permission not explicitly granted');
    }

    // 6. Evaluate policy conditions
    const unsatisfiedConditions: PolicyCondition[] = [];
    
    for (const policy of matchedPolicies) {
      if (policy.effect === 'allow') {
        const policyDef = this.policies.get(policy.policyId);
        if (policyDef) {
          const conditions = this.evaluateConditions(policyDef.conditions, context);
          const unsatisfied = conditions.filter(c => c.required && !c.satisfied);
          unsatisfiedConditions.push(...unsatisfied);
        }
      }
    }

    evidence.unsatisfiedConditions = unsatisfiedConditions.length;

    if (unsatisfiedConditions.length > 0) {
      score += unsatisfiedConditions.length * 15;
      reasons.push(`${unsatisfiedConditions.length} policy conditions not satisfied`);
      
      // If critical conditions are not met, deny access
      if (authorized) {
        authorized = false;
        finalEffect = 'deny';
      }
    }

    // 7. Check time-based restrictions
    const timeRestrictions = this.checkTimeRestrictions(context, effectivePermissions);
    if (timeRestrictions) {
      score += 30;
      reasons.push(timeRestrictions);
      
      if (authorized && timeRestrictions.includes('outside allowed hours')) {
        authorized = false;
        finalEffect = 'deny';
      }
    }

    // 8. Check for privilege escalation attempts
    const escalationAttempt = this.detectEscalationAttempt(context, effectivePermissions);
    evidence.escalationAttempt = escalationAttempt;

    if (escalationAttempt) {
      score += 50;
      reasons.push('Possible privilege escalation attempt detected');
    }

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.95;
    const requiredActions: string[] = [];

    if (!authorized || finalEffect === 'deny') {
      verdict = SecurityVerdict.DENY;
      confidence = 1.0;
      requiredActions.push('REQUEST_ACCESS', 'CONTACT_ADMIN');
    } else if (unsatisfiedConditions.length > 0) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.9;
      
      unsatisfiedConditions.forEach(c => {
        if (c.type === 'mfa') requiredActions.push('COMPLETE_MFA');
        if (c.type === 'approval') requiredActions.push('REQUEST_APPROVAL');
      });
    } else if (score >= 40) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.85;
      requiredActions.push('AUDIT_LOG', 'MANAGER_NOTIFICATION');
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.95;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Authorization granted',
      evidence,
      authorized,
      matchedPolicies,
      effectivePermissions,
      conditions: unsatisfiedConditions,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Evaluate policies against attributes
   */
  async evaluatePolicies(attributes: AttributeSet): Promise<PolicyMatch[]> {
    const matches: PolicyMatch[] = [];

    for (const policy of this.policies.values()) {
      if (!policy.enabled) {
        continue;
      }

      // Check if subject matches
      const subjectMatch = this.matchRule(policy.subjects, attributes.subject);
      if (!subjectMatch) {
        continue;
      }

      // Check if resource matches
      const resourceMatch = this.matchRule(policy.resources, attributes.resource);
      if (!resourceMatch) {
        continue;
      }

      // Check if action matches
      const actionMatch = policy.actions.includes('*') || 
                         policy.actions.includes(attributes.action);
      if (!actionMatch) {
        continue;
      }

      // Evaluate conditions
      const conditions = this.evaluateConditions(policy.conditions, attributes.environment);
      const matchedConditions = conditions
        .filter(c => c.satisfied)
        .map(c => `${c.type}:${c.operator}`);

      matches.push({
        policyId: policy.id,
        policyName: policy.name,
        effect: policy.effect,
        priority: policy.priority,
        matchedConditions
      });
    }

    return matches;
  }

  /**
   * Check permission
   */
  async checkPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId);

    for (const permission of permissions) {
      // Check if resource matches (support wildcards)
      const resourceMatch = this.matchResource(permission.resource, resource);
      if (!resourceMatch) {
        continue;
      }

      // Check if action is allowed
      const actionMatch = permission.actions.includes('*') || 
                         permission.actions.includes(action);
      if (!actionMatch) {
        continue;
      }

      // Check if permission has expired
      if (permission.expiresAt && permission.expiresAt < new Date()) {
        continue;
      }

      // Check conditions if present
      if (permission.conditions && permission.conditions.length > 0) {
        const allSatisfied = permission.conditions.every(c => c.satisfied);
        if (!allSatisfied) {
          continue;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Get effective permissions for user
   */
  async getEffectivePermissions(userId: string): Promise<Permission[]> {
    const permissions: Permission[] = [];

    // 1. Get direct user permissions
    const userPerms = this.userPermissions.get(userId) || [];
    permissions.push(...userPerms);

    // 2. Get role-based permissions
    const userRole = this.userRoles.get(userId);
    if (userRole) {
      // Check if roles have expired
      if (!userRole.expiresAt || userRole.expiresAt > new Date()) {
        for (const role of userRole.roles) {
          const rolePerms = this.rolePermissions.get(role);
          if (rolePerms) {
            permissions.push(...rolePerms.permissions);
          }
        }
      }
    }

    // Remove duplicates and expired permissions
    const uniquePerms = this.deduplicatePermissions(permissions);
    const validPerms = uniquePerms.filter(
      p => !p.expiresAt || p.expiresAt > new Date()
    );

    return validPerms;
  }

  /**
   * Add policy
   */
  async addPolicy(policy: Omit<Policy, 'createdAt' | 'updatedAt'>): Promise<void> {
    const fullPolicy: Policy = {
      ...policy,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.policies.set(policy.id, fullPolicy);
    console.log(`✓ Policy added: ${policy.name}`);
  }

  /**
   * Remove policy
   */
  async removePolicy(policyId: string): Promise<boolean> {
    const removed = this.policies.delete(policyId);
    if (removed) {
      console.log(`✓ Policy removed: ${policyId}`);
    }
    return removed;
  }

  /**
   * Grant role to user
   */
  async grantRole(userId: string, role: string, expiresAt?: Date): Promise<void> {
    let userRole = this.userRoles.get(userId);

    if (!userRole) {
      userRole = {
        userId,
        roles: [],
        grantedAt: new Date(),
        expiresAt
      };
    }

    if (!userRole.roles.includes(role)) {
      userRole.roles.push(role);
      this.userRoles.set(userId, userRole);
      console.log(`✓ Role granted: ${role} to user ${userId}`);
    }
  }

  /**
   * Revoke role from user
   */
  async revokeRole(userId: string, role: string): Promise<boolean> {
    const userRole = this.userRoles.get(userId);

    if (!userRole) {
      return false;
    }

    const index = userRole.roles.indexOf(role);
    if (index > -1) {
      userRole.roles.splice(index, 1);
      console.log(`✓ Role revoked: ${role} from user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Grant permission to user
   */
  async grantPermission(userId: string, permission: Permission): Promise<void> {
    const userPerms = this.userPermissions.get(userId) || [];
    userPerms.push(permission);
    this.userPermissions.set(userId, userPerms);
    console.log(`✓ Permission granted to user ${userId}: ${permission.resource} [${permission.actions.join(', ')}]`);
  }

  /**
   * Define role permissions
   */
  async defineRolePermissions(role: string, permissions: Permission[]): Promise<void> {
    this.rolePermissions.set(role, { role, permissions });
    console.log(`✓ Role permissions defined: ${role}`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Clean up expired roles and permissions
    await this.cleanupExpired();
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private buildAttributeSet(context: ProviderContext): AttributeSet {
    // Get user roles
    const userRole = this.userRoles.get(context.userId);

    return {
      subject: {
        userId: context.userId,
        roles: userRole?.roles || [],
        sessionId: context.sessionId,
        ...context.metadata
      },
      resource: {
        path: context.resource,
        type: this.getResourceType(context.resource),
        sensitivity: this.getResourceSensitivity(context.resource)
      },
      environment: {
        timestamp: context.timestamp,
        ipAddress: context.ipAddress,
        deviceId: context.deviceId,
        userAgent: context.userAgent,
        ...context.metadata
      },
      action: context.action
    };
  }

  private matchRule(rule: PolicyRule, attributes: Record<string, any>): boolean {
    if (rule.type === 'all') {
      // All attributes must match
      return Object.entries(rule.attributes).every(([key, value]) => {
        return this.matchAttribute(attributes[key], value);
      });
    } else if (rule.type === 'any') {
      // Any attribute can match
      return Object.entries(rule.attributes).some(([key, value]) => {
        return this.matchAttribute(attributes[key], value);
      });
    } else if (rule.type === 'match') {
      // Exact match required
      return Object.entries(rule.attributes).every(([key, value]) => {
        return attributes[key] === value;
      });
    }

    return false;
  }

  private matchAttribute(actual: any, expected: any): boolean {
    if (expected === '*') {
      return true; // Wildcard matches anything
    }

    if (Array.isArray(expected)) {
      // Check if actual is in array
      if (Array.isArray(actual)) {
        return expected.some(e => actual.includes(e));
      }
      return expected.includes(actual);
    }

    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }

    return actual === expected;
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    context: Record<string, any>
  ): PolicyCondition[] {
    return conditions.map(condition => {
      const actualValue = context[condition.type];
      let satisfied = false;

      switch (condition.operator) {
        case 'equals':
          satisfied = actualValue === condition.value;
          break;
        case 'not_equals':
          satisfied = actualValue !== condition.value;
          break;
        case 'in':
          satisfied = Array.isArray(condition.value) && condition.value.includes(actualValue);
          break;
        case 'not_in':
          satisfied = Array.isArray(condition.value) && !condition.value.includes(actualValue);
          break;
        case 'gt':
          satisfied = actualValue > condition.value;
          break;
        case 'lt':
          satisfied = actualValue < condition.value;
          break;
        case 'gte':
          satisfied = actualValue >= condition.value;
          break;
        case 'lte':
          satisfied = actualValue <= condition.value;
          break;
        case 'between':
          satisfied = Array.isArray(condition.value) && 
                     actualValue >= condition.value[0] && 
                     actualValue <= condition.value[1];
          break;
        default:
          satisfied = false;
      }

      return {
        ...condition,
        satisfied
      };
    });
  }

  private matchResource(pattern: string, resource: string): boolean {
    // Support wildcards
    if (pattern === '*' || pattern === '**') {
      return true;
    }

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resource);
  }

  private checkTimeRestrictions(context: ProviderContext, permissions: Permission[]): string | null {
    const hour = context.timestamp.getHours();
    const dayOfWeek = context.timestamp.getDay();

    // Check business hours (9-17, Mon-Fri)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isBusinessHours = hour >= 9 && hour < 17;

    // Check if any permission has time restrictions
    for (const permission of permissions) {
      if (!permission.conditions) {
        continue;
      }

      const timeCondition = permission.conditions.find(c => c.type === 'time');
      if (timeCondition && timeCondition.required) {
        if (!timeCondition.satisfied) {
          return 'Access outside allowed hours';
        }
      }
    }

    // Check for sensitive resources outside business hours
    const isSensitive = context.resource.includes('/admin') || 
                       context.resource.includes('/settings');

    if (isSensitive && (isWeekend || !isBusinessHours)) {
      return 'Sensitive resource access outside business hours';
    }

    return null;
  }

  private detectEscalationAttempt(context: ProviderContext, permissions: Permission[]): boolean {
    // Check if trying to access admin resources without admin role
    const isAdminResource = context.resource.includes('/admin') || 
                           context.resource.includes('/users') ||
                           context.action === 'delete' ||
                           context.action === 'admin';

    if (isAdminResource) {
      const hasAdminPermission = permissions.some(p => 
        (p.resource.includes('admin') || p.resource === '*') &&
        (p.actions.includes('admin') || p.actions.includes('*'))
      );

      return !hasAdminPermission;
    }

    return false;
  }

  private getResourceType(resource: string): string {
    if (resource.startsWith('/api/')) return 'api';
    if (resource.startsWith('/admin/')) return 'admin';
    if (resource.startsWith('/settings/')) return 'settings';
    if (resource.startsWith('/users/')) return 'user-management';
    return 'general';
  }

  private getResourceSensitivity(resource: string): 'public' | 'internal' | 'confidential' | 'restricted' {
    if (resource.includes('/admin') || resource.includes('/keys')) return 'restricted';
    if (resource.includes('/settings') || resource.includes('/users')) return 'confidential';
    if (resource.startsWith('/api/')) return 'internal';
    return 'public';
  }

  private deduplicatePermissions(permissions: Permission[]): Permission[] {
    const seen = new Map<string, Permission>();

    for (const permission of permissions) {
      const key = `${permission.resource}:${permission.actions.join(',')}`;
      
      if (!seen.has(key)) {
        seen.set(key, permission);
      } else {
        // Merge actions
        const existing = seen.get(key)!;
        existing.actions = Array.from(new Set([...existing.actions, ...permission.actions]));
      }
    }

    return Array.from(seen.values());
  }

  private async cleanupExpired(): Promise<void> {
    const now = new Date();

    // Clean up expired roles
    for (const [userId, userRole] of this.userRoles.entries()) {
      if (userRole.expiresAt && userRole.expiresAt <= now) {
        this.userRoles.delete(userId);
      }
    }

    // Clean up expired permissions
    for (const [userId, permissions] of this.userPermissions.entries()) {
      const validPerms = permissions.filter(p => !p.expiresAt || p.expiresAt > now);
      
      if (validPerms.length === 0) {
        this.userPermissions.delete(userId);
      } else if (validPerms.length < permissions.length) {
        this.userPermissions.set(userId, validPerms);
      }
    }
  }

  private initializeDefaultPolicies(): void {
    // Admin access policy
    this.addPolicy({
      id: 'policy-admin-access',
      name: 'Admin Full Access',
      description: 'Administrators have full access to all resources',
      effect: 'allow',
      priority: 100,
      subjects: {
        type: 'any',
        attributes: { roles: ['admin', 'superadmin'] }
      },
      resources: {
        type: 'all',
        attributes: { path: '*' }
      },
      actions: ['*'],
      conditions: [],
      enabled: true
    });

    // User read access policy
    this.addPolicy({
      id: 'policy-user-read',
      name: 'User Read Access',
      description: 'Users can read their own data',
      effect: 'allow',
      priority: 50,
      subjects: {
        type: 'all',
        attributes: { roles: ['user'] }
      },
      resources: {
        type: 'match',
        attributes: { type: 'general' }
      },
      actions: ['read', 'list'],
      conditions: [],
      enabled: true
    });

    // Deny outside business hours for sensitive resources
    this.addPolicy({
      id: 'policy-deny-after-hours',
      name: 'Deny After Hours Access',
      description: 'Deny access to sensitive resources outside business hours',
      effect: 'deny',
      priority: 90,
      subjects: {
        type: 'all',
        attributes: { roles: ['user'] } // Doesn't apply to admins
      },
      resources: {
        type: 'match',
        attributes: { sensitivity: 'restricted' }
      },
      actions: ['*'],
      conditions: [
        {
          type: 'time',
          operator: 'between',
          value: [9, 17],
          satisfied: false,
          required: true
        }
      ],
      enabled: true
    });

    // Default role permissions
    this.defineRolePermissions('admin', [
      {
        resource: '*',
        actions: ['*']
      }
    ]);

    this.defineRolePermissions('user', [
      {
        resource: '/api/*',
        actions: ['read', 'list']
      },
      {
        resource: '/cameras/*',
        actions: ['read', 'list', 'view']
      }
    ]);

    this.defineRolePermissions('operator', [
      {
        resource: '/api/*',
        actions: ['read', 'list', 'update']
      },
      {
        resource: '/cameras/*',
        actions: ['*']
      },
      {
        resource: '/recordings/*',
        actions: ['read', 'list', 'export']
      }
    ]);

    console.log('✓ Default authorization policies initialized');
  }

  /**
   * Get authorization statistics
   */
  async getAuthorizationStats(): Promise<{
    totalPolicies: number;
    enabledPolicies: number;
    totalRoles: number;
    totalUserRoles: number;
    totalPermissions: number;
  }> {
    const stats = {
      totalPolicies: this.policies.size,
      enabledPolicies: 0,
      totalRoles: this.rolePermissions.size,
      totalUserRoles: this.userRoles.size,
      totalPermissions: 0
    };

    for (const policy of this.policies.values()) {
      if (policy.enabled) stats.enabledPolicies++;
    }

    for (const perms of this.userPermissions.values()) {
      stats.totalPermissions += perms.length;
    }

    return stats;
  }

  /**
   * Get user authorization details
   */
  async getUserAuthorization(userId: string): Promise<{
    roles: string[];
    permissions: Permission[];
    matchedPolicies: number;
  }> {
    const userRole = this.userRoles.get(userId);
    const permissions = await this.getEffectivePermissions(userId);

    return {
      roles: userRole?.roles || [],
      permissions,
      matchedPolicies: 0 // Would need context to evaluate
    };
  }
}
