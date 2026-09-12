/**
 * Attribute-Based Access Control (ABAC - security.abac) Domain Types
 * Defines contextual access rules based on time of day, network subnet, and user clearance tags.
 */

export const CLEARANCE_LEVELS = [
  "UNCLASSIFIED",
  "RESTRICTED",
  "CONFIDENTIAL",
  "SECRET",
  "TOP_SECRET",
] as const;

export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[number];

export const CLEARANCE_RANKS: Record<ClearanceLevel, number> = {
  UNCLASSIFIED: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};

export type PolicyEffect = "PERMIT" | "DENY";

export type DayOfWeek = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface ContextualTimeRule {
  /** Start time of allowed window in HH:MM format (24h) */
  startTime: string;
  /** End time of allowed window in HH:MM format (24h) */
  endTime: string;
  /** Timezone identifier, e.g. "UTC", "Asia/Kolkata", "America/New_York". Default: "UTC" */
  timezone?: string;
  /** Allowed days of week (0=Sun, 1=Mon, ..., 6=Sat or string names) */
  daysOfWeek?: (number | DayOfWeek)[];
  /** Whether the time window crosses midnight (e.g. 22:00 to 06:00). If omitted, automatically determined by startTime > endTime */
  allowOvernight?: boolean;
}

export interface ContextualNetworkRule {
  /** List of allowed IPv4 or IPv6 CIDR subnets (e.g. ["10.0.0.0/8", "192.168.1.0/24", "2001:db8::/32"]) */
  allowedSubnets?: string[];
  /** List of explicitly denied IPv4 or IPv6 CIDRs (deny takes precedence over allow) */
  deniedSubnets?: string[];
  /** Whether non-private or external IP addresses are forbidden */
  requireInternalSubnet?: boolean;
}

export interface ContextualClearanceRule {
  /** Minimum clearance level required for access */
  minClearanceLevel?: ClearanceLevel;
  /** Required clearance tags (e.g. ["VAULT_ACCESS", "CASH_AREA", "FORENSICS"]) */
  requiredClearanceTags?: string[];
  /** Matching strategy for required tags: ALL (must possess all) or ANY (possess at least one). Default: ALL */
  matchMode?: "ALL" | "ANY";
  /** Prohibited clearance tags (e.g. ["REVOKED", "SUSPENDED_INVESTIGATION", "PROBATIONARY"]) */
  prohibitedClearanceTags?: string[];
}

export interface AbacPolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  effect: PolicyEffect;
  priority: number;
  actions: string[]; // Specific actions e.g. ["LIVE_VIEW", "PLAYBACK"] or ["*"]
  resourceTypes: string[]; // e.g. ["CAMERA", "RECORDER", "BRANCH", "EVIDENCE", "*"]
  resourceClassifications: string[]; // e.g. ["VAULT_STRONG_ROOM", "CASH_COUNTER", "*"]
  branchScope: string[]; // List of branch IDs or ["ALL"]
  roles: string[]; // Roles allowed or ["*"]
  timeRule?: ContextualTimeRule;
  networkRule?: ContextualNetworkRule;
  clearanceRule?: ContextualClearanceRule;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyInput {
  tenantId: string;
  name: string;
  description?: string;
  effect?: PolicyEffect;
  priority?: number;
  actions?: string[];
  resourceTypes?: string[];
  resourceClassifications?: string[];
  branchScope?: string[];
  roles?: string[];
  timeRule?: ContextualTimeRule;
  networkRule?: ContextualNetworkRule;
  clearanceRule?: ContextualClearanceRule;
  isActive?: boolean;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  effect?: PolicyEffect;
  priority?: number;
  actions?: string[];
  resourceTypes?: string[];
  resourceClassifications?: string[];
  branchScope?: string[];
  roles?: string[];
  timeRule?: ContextualTimeRule | null;
  networkRule?: ContextualNetworkRule | null;
  clearanceRule?: ContextualClearanceRule | null;
  isActive?: boolean;
}

export interface UserClearanceProfile {
  id: string;
  userId: string;
  tenantId: string;
  clearanceLevel: ClearanceLevel;
  clearanceTags: string[];
  validFrom: string;
  validUntil?: string;
  revoked: boolean;
  revokedAt?: string;
  revocationReason?: string;
  issuedBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertClearanceInput {
  userId: string;
  tenantId: string;
  clearanceLevel?: ClearanceLevel;
  clearanceTags?: string[];
  validFrom?: string;
  validUntil?: string;
  issuedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface RevokeClearanceInput {
  userId: string;
  tenantId: string;
  reason: string;
  revokedBy?: string;
}

export interface AbacEvaluationRequest {
  subject: {
    userId: string;
    tenantId: string;
    roles: string[];
    branchScope?: string[];
    clearanceLevel?: ClearanceLevel;
    clearanceTags?: string[];
    shiftStart?: string;
    shiftEnd?: string;
    networkCidr?: string;
  };
  resource: {
    tenantId: string;
    branchId: string;
    resourceType?: string;
    resourceId?: string;
    classification?: string;
    requiredTags?: string[];
  };
  action: string;
  environment: {
    sourceIp: string;
    requestTimeUtc?: string; // ISO 8601 string, defaults to now
    clientTimezone?: string;
  };
}

export interface EvaluationDetails {
  timeCheck: {
    passed: boolean;
    currentTime?: string;
    allowedWindow?: string;
    timezone?: string;
    reason?: string;
  };
  networkCheck: {
    passed: boolean;
    clientIp: string;
    matchedAllowedCidr?: string;
    matchedDeniedCidr?: string;
    reason?: string;
  };
  clearanceCheck: {
    passed: boolean;
    userLevel?: ClearanceLevel;
    requiredLevel?: ClearanceLevel;
    matchedTags?: string[];
    missingTags?: string[];
    prohibitedTags?: string[];
    reason?: string;
  };
  branchCheck: {
    passed: boolean;
    reason?: string;
  };
  rbacCheck: {
    passed: boolean;
    reason?: string;
  };
}

export interface AbacEvaluationResponse {
  allowed: boolean;
  decision: PolicyEffect;
  reason: string;
  policyHash: string;
  appliedPolicies: string[];
  evaluationDetails: EvaluationDetails;
  auditLogId: string;
  timestamp: string;
}

export interface AbacAuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceBranchId: string;
  resourceClassification?: string;
  sourceIp: string;
  requestTime: string;
  decision: PolicyEffect;
  reason: string;
  appliedPolicies: string[];
  policyHash: string;
  evaluationDetails: EvaluationDetails;
  latencyMs: number;
  createdAt: string;
}

export interface AbacMetrics {
  totalPolicies: number;
  activePolicies: number;
  totalClearanceProfiles: number;
  activeClearances: number;
  totalEvaluations: number;
  permitsCount: number;
  deniesCount: number;
  averageEvaluationLatencyMs: number;
}
