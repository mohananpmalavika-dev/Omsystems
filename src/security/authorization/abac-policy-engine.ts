/**
 * ABAC + RBAC Policy Engine
 * Banking-Grade Attribute-Based Access Control with default-deny semantics.
 * Supports branch scope, camera classification, shift time windows, and network CIDR restrictions.
 */

import { createHash } from "node:crypto";

// ───────────────────────── Roles ─────────────────────────

export const ROLES = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "CHIEF_SECURITY_OFFICER",
  "BRANCH_SECURITY_OFFICER",
  "VIRTUAL_GUARD_OPERATOR",
  "COMPLIANCE_AUDITOR",
  "MAINTENANCE_ENGINEER",
] as const;

export type Role = (typeof ROLES)[number];

// ───────────────────────── Camera Classifications ─────────────────────────

export const CAMERA_CLASSIFICATIONS = [
  "VAULT_STRONG_ROOM",
  "CASH_COUNTER",
  "ATM_KIOSK",
  "SERVER_ROOM",
  "PUBLIC_LOBBY",
  "PARKING",
  "PERIMETER",
  "GENERAL",
] as const;

export type CameraClassification = (typeof CAMERA_CLASSIFICATIONS)[number];

// ───────────────────────── Actions ─────────────────────────

export const ACTIONS = [
  "LIVE_VIEW",
  "PLAYBACK",
  "PTZ_CONTROL",
  "EXPORT_EVIDENCE",
  "ACKNOWLEDGE_ALARM",
  "MANAGE_CAMERA",
  "MANAGE_USER",
  "VIEW_AUDIT_LOGS",
  "SYSTEM_CONFIG",
] as const;

export type Action = (typeof ACTIONS)[number];

// ───────────────────────── Request Context ─────────────────────────

export interface AbacRequestContext {
  /** Subject (operator) attributes */
  subject: {
    userId: string;
    tenantId: string;
    roles: Role[];
    branchScope: string[]; // Branch IDs this operator is authorised for
    shiftStart?: string;   // HH:MM
    shiftEnd?: string;     // HH:MM
    networkCidr?: string;  // Allowed source CIDR (e.g. "10.0.0.0/8")
  };
  /** Resource attributes */
  resource: {
    tenantId: string;
    branchId: string;
    cameraId?: string;
    classification?: CameraClassification;
  };
  /** Requested action */
  action: Action;
  /** Request environment */
  environment: {
    sourceIp?: string;
    requestTimeUtc: string; // ISO timestamp
  };
}

export interface AbacDecision {
  allowed: boolean;
  reason: string;
  appliedPolicies: string[];
}

// ───────────────────────── Role Capabilities ─────────────────────────

/** Default maximum actions per role. Policies can further restrict by attribute. */
const ROLE_CAPABILITIES: Record<Role, Set<Action>> = {
  SUPER_ADMIN: new Set(ACTIONS),
  TENANT_ADMIN: new Set(ACTIONS),
  CHIEF_SECURITY_OFFICER: new Set([
    "LIVE_VIEW", "PLAYBACK", "PTZ_CONTROL", "EXPORT_EVIDENCE", "ACKNOWLEDGE_ALARM",
    "MANAGE_CAMERA", "VIEW_AUDIT_LOGS",
  ]),
  BRANCH_SECURITY_OFFICER: new Set([
    "LIVE_VIEW", "PLAYBACK", "PTZ_CONTROL", "ACKNOWLEDGE_ALARM", "VIEW_AUDIT_LOGS",
  ]),
  VIRTUAL_GUARD_OPERATOR: new Set([
    "LIVE_VIEW", "PTZ_CONTROL", "ACKNOWLEDGE_ALARM",
  ]),
  COMPLIANCE_AUDITOR: new Set([
    "PLAYBACK", "EXPORT_EVIDENCE", "VIEW_AUDIT_LOGS",
  ]),
  MAINTENANCE_ENGINEER: new Set([
    "LIVE_VIEW", "MANAGE_CAMERA",
  ]),
};

/** Camera classifications that require elevated roles */
const SENSITIVE_CAMERA_POLICY: Record<CameraClassification, Role[]> = {
  VAULT_STRONG_ROOM: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER"],
  CASH_COUNTER: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER"],
  SERVER_ROOM: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER"],
  ATM_KIOSK: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER", "COMPLIANCE_AUDITOR"],
  PUBLIC_LOBBY: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER", "VIRTUAL_GUARD_OPERATOR", "COMPLIANCE_AUDITOR", "MAINTENANCE_ENGINEER"],
  PARKING: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER", "VIRTUAL_GUARD_OPERATOR", "COMPLIANCE_AUDITOR", "MAINTENANCE_ENGINEER"],
  PERIMETER: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER", "VIRTUAL_GUARD_OPERATOR", "COMPLIANCE_AUDITOR", "MAINTENANCE_ENGINEER"],
  GENERAL: ["SUPER_ADMIN", "TENANT_ADMIN", "CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER", "VIRTUAL_GUARD_OPERATOR", "COMPLIANCE_AUDITOR", "MAINTENANCE_ENGINEER"],
};

function parseCidr(cidr: string): { networkInt: number; mask: number } | null {
  const [ip, bits] = cidr.split("/");
  if (!ip || !bits) return null;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  const networkInt = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  const prefixLen = parseInt(bits, 10);
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return { networkInt: networkInt & mask, mask };
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const ipInt = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  return (ipInt & parsed.mask) === parsed.networkInt;
}

function timeInWindow(requestTime: string, shiftStart: string, shiftEnd: string): boolean {
  const d = new Date(requestTime);
  const hhmm = `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
  if (shiftStart <= shiftEnd) {
    return hhmm >= shiftStart && hhmm <= shiftEnd;
  }
  // Overnight shift (e.g. 22:00 -> 06:00)
  return hhmm >= shiftStart || hhmm <= shiftEnd;
}

// ───────────────────────── Policy Engine ─────────────────────────

export class AbacPolicyEngine {
  evaluate(ctx: AbacRequestContext): AbacDecision {
    const appliedPolicies: string[] = [];

    // P0: Tenant isolation — cross-tenant access is always denied
    if (ctx.subject.tenantId !== ctx.resource.tenantId) {
      return { allowed: false, reason: "Cross-tenant access is strictly prohibited", appliedPolicies: ["P0:TenantIsolation"] };
    }
    appliedPolicies.push("P0:TenantIsolation:PASS");

    // P1: RBAC — at least one role must have the requested action capability
    const hasRoleCapability = ctx.subject.roles.some((role) =>
      ROLE_CAPABILITIES[role]?.has(ctx.action),
    );
    if (!hasRoleCapability) {
      return {
        allowed: false,
        reason: `Roles [${ctx.subject.roles.join(", ")}] do not have capability for action '${ctx.action}'`,
        appliedPolicies: [...appliedPolicies, "P1:RBAC:DENY"],
      };
    }
    appliedPolicies.push("P1:RBAC:PASS");

    // P2: Branch Scope — SUPER_ADMIN and TENANT_ADMIN bypass scope; others must have the branch assigned
    const isSuperRole = ctx.subject.roles.includes("SUPER_ADMIN") || ctx.subject.roles.includes("TENANT_ADMIN");
    if (!isSuperRole && !ctx.subject.branchScope.includes(ctx.resource.branchId)) {
      return {
        allowed: false,
        reason: `Operator branch scope [${ctx.subject.branchScope.join(", ")}] does not include resource branch '${ctx.resource.branchId}'`,
        appliedPolicies: [...appliedPolicies, "P2:BranchScope:DENY"],
      };
    }
    appliedPolicies.push("P2:BranchScope:PASS");

    // P3: Camera Classification — sensitive cameras require elevated roles
    if (ctx.resource.classification) {
      const allowedRoles = SENSITIVE_CAMERA_POLICY[ctx.resource.classification] ?? [];
      const hasElevatedRole = ctx.subject.roles.some((role) => allowedRoles.includes(role));
      if (!hasElevatedRole) {
        return {
          allowed: false,
          reason: `Camera classification '${ctx.resource.classification}' requires elevated role. Operator has [${ctx.subject.roles.join(", ")}]`,
          appliedPolicies: [...appliedPolicies, "P3:CameraClassification:DENY"],
        };
      }
      appliedPolicies.push("P3:CameraClassification:PASS");
    }

    // P4: Shift Time Window (if configured)
    if (ctx.subject.shiftStart && ctx.subject.shiftEnd) {
      const withinShift = timeInWindow(ctx.environment.requestTimeUtc, ctx.subject.shiftStart, ctx.subject.shiftEnd);
      if (!withinShift) {
        return {
          allowed: false,
          reason: `Request at ${ctx.environment.requestTimeUtc} is outside operator shift window (${ctx.subject.shiftStart}–${ctx.subject.shiftEnd} UTC)`,
          appliedPolicies: [...appliedPolicies, "P4:ShiftWindow:DENY"],
        };
      }
      appliedPolicies.push("P4:ShiftWindow:PASS");
    }

    // P5: Network CIDR Restriction (if configured)
    if (ctx.subject.networkCidr && ctx.environment.sourceIp) {
      const ipAllowed = ipMatchesCidr(ctx.environment.sourceIp, ctx.subject.networkCidr);
      if (!ipAllowed) {
        return {
          allowed: false,
          reason: `Source IP ${ctx.environment.sourceIp} is not within allowed CIDR ${ctx.subject.networkCidr}`,
          appliedPolicies: [...appliedPolicies, "P5:NetworkCidr:DENY"],
        };
      }
      appliedPolicies.push("P5:NetworkCidr:PASS");
    }

    return {
      allowed: true,
      reason: `Access granted via RBAC+ABAC (${appliedPolicies.length} policies evaluated)`,
      appliedPolicies,
    };
  }

  /** Compute a stable hash for a given set of policies (for audit logging) */
  computePolicyHash(ctx: AbacRequestContext): string {
    const payload = JSON.stringify({
      roles: ctx.subject.roles.sort(),
      branchScope: ctx.subject.branchScope.sort(),
      action: ctx.action,
      classification: ctx.resource.classification,
    });
    return createHash("sha256").update(payload).digest("hex");
  }
}

export const abacPolicyEngine = new AbacPolicyEngine();
