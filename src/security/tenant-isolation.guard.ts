/**
 * Multi-Tenant Isolation Guard
 * 
 * Enforces strict tenant boundary verification across all repository lookups,
 * API mutations, video streams, recording segments, incidents, evidence packages,
 * and AI configurations.
 * 
 * Invariants:
 * - Never permit cross-tenant access.
 * - Any cross-tenant access attempt must throw CrossTenantAccessForbiddenError (HTTP 403).
 * - All unauthorized cross-tenant attempts must be audited in the central audit ledger.
 */

import { centralAuditService } from "../audit/services/central-audit.service.js";

export class CrossTenantAccessForbiddenError extends Error {
  public readonly statusCode = 403;
  public readonly code = "CROSS_TENANT_ACCESS_FORBIDDEN";

  constructor(
    public readonly actorTenantId: string,
    public readonly targetTenantId: string,
    public readonly resourceType: string,
    public readonly resourceId: string
  ) {
    super(
      `Cross-tenant access denied: Tenant '${actorTenantId}' cannot access ${resourceType} '${resourceId}' belonging to Tenant '${targetTenantId}'`
    );
    this.name = "CrossTenantAccessForbiddenError";
  }
}

export class TenantIsolationGuard {
  async assertTenantAccess(params: {
    actorTenantId: string;
    targetTenantId: string;
    resourceType: "CAMERA" | "RECORDING" | "INCIDENT" | "EVIDENCE" | "CONFIG" | "USER" | "AI";
    resourceId: string;
    actorId: string;
    correlationId: string;
  }): Promise<void> {
    if (params.actorTenantId !== params.targetTenantId) {
      // Audit security breach attempt
      await centralAuditService.recordAuditEvent({
        tenantId: params.actorTenantId,
        actorId: params.actorId,
        action: "PERMISSION_CHANGE",
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        reason: `CROSS_TENANT_BREACH_ATTEMPT: Tried to access tenant '${params.targetTenantId}'`,
        correlationId: params.correlationId,
        result: "DENIED",
      }).catch(() => {});

      throw new CrossTenantAccessForbiddenError(
        params.actorTenantId,
        params.targetTenantId,
        params.resourceType,
        params.resourceId
      );
    }
  }

  isTenantAllowed(actorTenantId: string, targetTenantId: string): boolean {
    return actorTenantId === targetTenantId;
  }
}

export const tenantIsolationGuard = new TenantIsolationGuard();
