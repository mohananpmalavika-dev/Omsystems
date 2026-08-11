/**
 * Recipient Resolution Types
 * 
 * Defines the canonical types for recipient resolution with proper separation:
 * - RecipientSelector: describes WHY someone should receive a notification
 * - ResolvedPrincipal: identifies WHO will receive it
 * - DeliveryEndpoint: specifies WHERE to send it
 */

// =====================================================
// Recipient Selectors (Input)
// =====================================================

/**
 * Canonical recipient selector - discriminated union
 * Replaces arbitrary strings with explicit, type-safe selectors
 */
export type RecipientSelector =
  | {
      type: 'USER';
      userId: string;
    }
  | {
      type: 'EMAIL';
      email: string;
    }
  | {
      type: 'PHONE';
      phone: string;
    }
  | {
      type: 'BRANCH_ROLE';
      branchId: string;
      role: string;
    }
  | {
      type: 'TENANT_ROLE';
      role: string;
    }
  | {
      type: 'ON_CALL';
      scheduleId: string;
    }
  | {
      type: 'INCIDENT_ASSIGNEE';
      incidentId: string;
    }
  | {
      type: 'ESCALATION_POLICY';
      policyId: string;
      level?: number;
    };

/**
 * Context required for recipient resolution
 * Provides tenant scope and notification metadata
 */
export interface RecipientResolutionContext {
  /** Tenant ID for scoping (trusted server context) */
  tenantId: string;

  /** Notification type for preference filtering */
  notificationType: string;

  /** Optional branch context */
  branchId?: string;

  /** Optional incident context */
  incidentId?: string;

  /** Optional alert context */
  alertId?: string;

  /** Requested delivery channels */
  requestedChannels?: NotificationChannel[];

  /** Current timestamp for resolution */
  now: Date;

  /** Optional severity for policy filtering */
  severity?: NotificationSeverity;
}

// =====================================================
// Resolved Principals (Output)
// =====================================================

/**
 * Resolved principal - represents a verified recipient identity
 */
export interface ResolvedPrincipal {
  /** Principal type */
  type: 'USER' | 'EXTERNAL';

  /** User ID if type is USER */
  userId?: string;

  /** Tenant ID for isolation */
  tenantId: string;

  /** Display name for audit */
  displayName?: string;

  /** Provenance chain explaining how this principal was selected */
  provenance: RecipientProvenance[];

  /** Whether this principal is active */
  active: boolean;
}

/**
 * External principal (email/phone without user account)
 */
export interface ExternalPrincipal extends ResolvedPrincipal {
  type: 'EXTERNAL';

  /** Direct external endpoint */
  externalEndpoint: {
    channel: 'EMAIL' | 'SMS';
    address: string;
  };
}

/**
 * Provenance - audit trail of how a recipient was selected
 * Critical for escalation auditing and "why did I receive this?" queries
 */
export interface RecipientProvenance {
  /** Resolution source */
  source:
    | 'EXPLICIT_USER'
    | 'EXPLICIT_EMAIL'
    | 'EXPLICIT_PHONE'
    | 'BRANCH_ROLE'
    | 'TENANT_ROLE'
    | 'ON_CALL'
    | 'INCIDENT_ASSIGNEE'
    | 'ESCALATION_POLICY';

  /** Original selector value */
  selector: string;

  /** Branch context if applicable */
  branchId?: string;

  /** Incident context if applicable */
  incidentId?: string;

  /** Policy context if applicable */
  policyId?: string;

  /** Escalation level if applicable */
  escalationLevel?: number;

  /** When this resolution occurred */
  resolvedAt: Date;
}

// =====================================================
// Resolution Results
// =====================================================

/**
 * Complete recipient resolution result with audit trail
 */
export interface RecipientResolutionResult {
  /** Resolution state */
  state: ResolutionState;

  /** Successfully resolved principals */
  principals: ResolvedPrincipal[];

  /** Resolution failures with diagnostic codes */
  failures: RecipientResolutionFailure[];

  /** Resolution metadata */
  metadata?: {
    /** Total selectors processed */
    selectorsProcessed: number;

    /** Principals before deduplication */
    principalsBeforeDedup: number;

    /** Resolution duration */
    durationMs: number;
  };
}

/**
 * Resolution state
 */
export type ResolutionState = 
  | 'RESOLVED'    // All selectors resolved to at least one principal
  | 'PARTIAL'     // Some selectors failed but at least one succeeded
  | 'UNRESOLVED'; // No selectors resolved successfully

/**
 * Resolution failure with diagnostic information
 */
export interface RecipientResolutionFailure {
  /** Original selector that failed */
  selector: RecipientSelector;

  /** Failure reason code */
  code: ResolutionFailureCode;

  /** Human-readable message */
  message: string;

  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Resolution failure codes
 */
export type ResolutionFailureCode =
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'TENANT_MISMATCH'
  | 'BRANCH_NOT_FOUND'
  | 'ROLE_EMPTY'
  | 'NO_ON_CALL_USER'
  | 'INCIDENT_UNASSIGNED'
  | 'INCIDENT_NOT_FOUND'
  | 'NO_VERIFIED_ENDPOINT'
  | 'ESCALATION_POLICY_NOT_FOUND'
  | 'ESCALATION_LEVEL_NOT_FOUND'
  | 'SCHEDULE_NOT_FOUND'
  | 'INVALID_SELECTOR'
  | 'AUTHORIZATION_DENIED';

// =====================================================
// Supporting Types
// =====================================================

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK' | 'IN_APP';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export type NotificationPurpose =
  | 'OPERATIONAL'      // Internal system operations
  | 'SECURITY'         // Security incidents
  | 'INFORMATIONAL'    // General notifications
  | 'MARKETING';       // Marketing/promotional

// =====================================================
// User and Membership Types
// =====================================================

/**
 * User representation for recipient resolution
 */
export interface UserIdentity {
  id: string;
  tenantId: string;
  displayName: string;
  email?: string;
  emailVerifiedAt?: Date;
  emailStatus?: ContactStatus;
  phoneNumber?: string;
  phoneVerifiedAt?: Date;
  phoneStatus?: ContactStatus;
  status: UserStatus;
  metadata?: Record<string, unknown>;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED';

export type ContactStatus = 'ACTIVE' | 'UNVERIFIED' | 'BOUNCED' | 'OPTEDOUT';

/**
 * Branch membership for role resolution
 */
export interface BranchMembership {
  userId: string;
  branchId: string;
  tenantId: string;
  role: string;
  status: MembershipStatus;
}

/**
 * Tenant membership for role resolution
 */
export interface TenantMembership {
  userId: string;
  tenantId: string;
  role: string;
  status: MembershipStatus;
}

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

/**
 * Incident for assignee resolution
 */
export interface IncidentReference {
  id: string;
  tenantId: string;
  assignedUserId?: string;
  branchId?: string;
  status: string;
}

/**
 * Branch for context validation
 */
export interface BranchReference {
  id: string;
  tenantId: string;
  name: string;
  status: string;
}

// =====================================================
// On-Call Types
// =====================================================

/**
 * On-call schedule
 */
export interface OnCallSchedule {
  id: string;
  tenantId: string;
  name: string;
  timezone: string;
  enabled: boolean;
}

/**
 * Current on-call assignment
 */
export interface OnCallAssignment {
  userId: string;
  scheduleId: string;
  tenantId: string;
  effectiveFrom: Date;
  effectiveUntil: Date;
  rotationId?: string;
  overrideId?: string;
}

// =====================================================
// Escalation Types
// =====================================================

/**
 * Escalation policy
 */
export interface EscalationPolicy {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  levels: EscalationLevel[];
}

/**
 * Escalation level
 */
export interface EscalationLevel {
  /** Level number (1, 2, 3...) */
  level: number;

  /** Recipients for this level */
  recipients: RecipientSelector[];

  /** How long to wait after delivery before escalating */
  waitAfterDeliveryMs: number;

  /** Action when recipients resolve to empty */
  onEmpty: 'ADVANCE' | 'FAIL' | 'USE_FALLBACK';

  /** Optional fallback recipients if primary resolution fails */
  fallbackRecipients?: RecipientSelector[];
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Type guard for checking if a principal is external
 */
export function isExternalPrincipal(
  principal: ResolvedPrincipal
): principal is ExternalPrincipal {
  return principal.type === 'EXTERNAL';
}

/**
 * Type guard for checking if a principal is a user
 */
export function isUserPrincipal(
  principal: ResolvedPrincipal
): principal is ResolvedPrincipal & { userId: string } {
  return principal.type === 'USER' && !!principal.userId;
}

/**
 * Extract unique user IDs from principals
 */
export function extractUserIds(principals: ResolvedPrincipal[]): string[] {
  return [...new Set(
    principals
      .filter(isUserPrincipal)
      .map(p => p.userId)
  )];
}

/**
 * Normalize E.164 phone number
 */
export function normalizeE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If it starts with country code, use as-is
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }
  
  // If it's 10 digits, assume India (+91)
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  
  // Return with + prefix
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Create deduplication key for principal
 */
export function createPrincipalKey(principal: ResolvedPrincipal): string {
  if (principal.type === 'USER') {
    return `USER:${principal.userId}`;
  }
  
  const ext = principal as ExternalPrincipal;
  return `EXTERNAL:${ext.externalEndpoint.channel}:${ext.externalEndpoint.address}`;
}

/**
 * Merge provenance from duplicate principals
 */
export function mergeProvenances(
  provenances: RecipientProvenance[][]
): RecipientProvenance[] {
  const merged: RecipientProvenance[] = [];
  const seen = new Set<string>();
  
  for (const group of provenances) {
    for (const prov of group) {
      const key = `${prov.source}:${prov.selector}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(prov);
      }
    }
  }
  
  return merged;
}

/**
 * Assert never for exhaustive checks
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
