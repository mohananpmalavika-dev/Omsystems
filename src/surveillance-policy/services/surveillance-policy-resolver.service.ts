import { randomUUID } from "node:crypto";
import {
  BANK_STANDARD_TEMPLATE,
  type EffectiveSurveillancePolicy,
  type PolicyFieldProvenance,
  type PolicyScopeType,
  type SurveillancePolicy,
  type SurveillancePolicyAssignment,
  type SurveillancePolicyOverride,
} from "../domain/surveillance-policy.types.js";

export class SurveillancePolicyResolverService {
  private readonly policies = new Map<string, SurveillancePolicy>();
  private readonly assignments: SurveillancePolicyAssignment[] = [];

  constructor() {}

  private seedDefaultPolicies() {
    const defaultPolicy: SurveillancePolicy = {
      id: "policy-bank-standard-default",
      tenantId: "omsystems",
      ...BANK_STANDARD_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(defaultPolicy.id, defaultPolicy);

    // Seed default tenant assignment
    this.assignments.push({
      id: "assign-tenant-default",
      tenantId: "omsystems",
      scopeType: "TENANT",
      scopeId: "omsystems",
      policyId: defaultPolicy.id,
      priority: 0,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // ==================== CRUD & MANAGEMENT ====================

  async createPolicy(tenantId: string, input: Omit<SurveillancePolicy, "id" | "tenantId" | "createdAt" | "updatedAt">): Promise<SurveillancePolicy> {
    const now = new Date().toISOString();
    const policy: SurveillancePolicy = {
      id: `policy-${randomUUID()}`,
      tenantId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.policies.set(policy.id, policy);
    return structuredClone(policy);
  }

  async getPolicy(id: string): Promise<SurveillancePolicy | undefined> {
    const policy = this.policies.get(id);
    return policy ? structuredClone(policy) : undefined;
  }

  async listPolicies(tenantId?: string): Promise<SurveillancePolicy[]> {
    return Array.from(this.policies.values())
      .filter((p) => !tenantId || p.tenantId === tenantId)
      .map((p) => structuredClone(p));
  }

  async assignPolicy(assignment: Omit<SurveillancePolicyAssignment, "id" | "createdAt" | "updatedAt">): Promise<SurveillancePolicyAssignment> {
    const now = new Date().toISOString();
    const item: SurveillancePolicyAssignment = {
      id: `assign-${randomUUID()}`,
      ...assignment,
      createdAt: now,
      updatedAt: now,
    };
    this.assignments.push(item);
    return structuredClone(item);
  }

  async listAssignments(tenantId: string): Promise<SurveillancePolicyAssignment[]> {
    return this.assignments.filter((a) => a.tenantId === tenantId).map((a) => structuredClone(a));
  }

  // ==================== HIERARCHICAL RESOLVER ====================

  /**
   * Resolves the Effective Surveillance Policy for a given scope hierarchy.
   * Precedence: DEVICE > DEVICE_TYPE > BRANCH > REGION > TENANT
   */
  async resolveEffectivePolicy(params: {
    tenantId: string;
    branchId: string;
    regionId?: string;
    deviceId?: string;
    deviceType?: string;
  }): Promise<EffectiveSurveillancePolicy> {
    const { tenantId, branchId, regionId, deviceId, deviceType } = params;

    // 1. Locate Tenant Default Policy
    const tenantAssign = this.assignments.find(
      (a) => a.tenantId === tenantId && a.scopeType === "TENANT" && a.enabled,
    );
    const basePolicy = tenantAssign?.policyId
      ? this.policies.get(tenantAssign.policyId)
      : undefined;
    if (!basePolicy) {
      throw new Error(`surveillance_policy_not_configured_for_tenant:${tenantId}`);
    }

    // Initialize effective accumulator with base tenant values
    const effective: Record<string, any> = {
      cameraAvailabilityTarget: basePolicy.cameraAvailabilityTarget,
      recordingRequired: basePolicy.recordingRequired,
      retentionDays: basePolicy.retentionDays,
      maxRecordingGapSeconds: basePolicy.maxRecordingGapSeconds,
      recorderHeartbeatSeconds: basePolicy.recorderHeartbeatSeconds,
      cameraHeartbeatSeconds: basePolicy.cameraHeartbeatSeconds,
      internetHeartbeatSeconds: basePolicy.internetHeartbeatSeconds,
      timeDriftToleranceSeconds: basePolicy.timeDriftToleranceSeconds,
      timeDriftCriticalSeconds: basePolicy.timeDriftCriticalSeconds ?? 30,
      diskFreeWarningPercent: basePolicy.diskFreeWarningPercent,
      diskFreeCriticalPercent: basePolicy.diskFreeCriticalPercent,
      offlineGraceSeconds: basePolicy.offlineGraceSeconds ?? 15,
    };

    const provenance: Record<string, PolicyFieldProvenance> = {};
    for (const key of Object.keys(effective)) {
      provenance[key] = {
        value: effective[key],
        sourceScope: "TENANT",
        sourceScopeId: tenantId,
        policyId: basePolicy.id,
      };
    }

    // Helper to apply override layer
    const applyLayer = (scopeType: PolicyScopeType, scopeId?: string) => {
      if (!scopeId) return;
      const match = this.assignments.find(
        (a) => a.tenantId === tenantId && a.scopeType === scopeType && a.scopeId === scopeId && a.enabled,
      );
      if (!match) return;

      // Check if assignment points to an explicit template policy
      if (match.policyId) {
        const assignedPolicy = this.policies.get(match.policyId);
        if (assignedPolicy) {
          for (const key of Object.keys(effective)) {
            if ((assignedPolicy as any)[key] !== undefined) {
              effective[key] = (assignedPolicy as any)[key];
              provenance[key] = {
                value: (assignedPolicy as any)[key],
                sourceScope: scopeType,
                sourceScopeId: scopeId,
                policyId: assignedPolicy.id,
              };
            }
          }
        }
      }

      // Apply discrete property overrides
      if (match.overrides) {
        for (const [key, val] of Object.entries(match.overrides)) {
          if (val !== undefined) {
            effective[key] = val;
            provenance[key] = {
              value: val,
              sourceScope: scopeType,
              sourceScopeId: scopeId,
              policyId: match.policyId,
            };
          }
        }
      }
    };

    // 2. Region Layer
    applyLayer("REGION", regionId);

    // 3. Branch Layer
    applyLayer("BRANCH", branchId);

    // 4. Device Type / Class Layer (e.g. VAULT, ATM, TELLER, etc.)
    applyLayer("DEVICE_TYPE", deviceType?.toUpperCase());

    // 5. Individual Device Layer
    applyLayer("DEVICE", deviceId);

    return {
      tenantId,
      branchId,
      deviceId,
      deviceType,
      cameraAvailabilityTarget: effective.cameraAvailabilityTarget,
      recordingRequired: effective.recordingRequired,
      retentionDays: effective.retentionDays,
      maxRecordingGapSeconds: effective.maxRecordingGapSeconds,
      recorderHeartbeatSeconds: effective.recorderHeartbeatSeconds,
      cameraHeartbeatSeconds: effective.cameraHeartbeatSeconds,
      internetHeartbeatSeconds: effective.internetHeartbeatSeconds,
      timeDriftToleranceSeconds: effective.timeDriftToleranceSeconds,
      timeDriftCriticalSeconds: effective.timeDriftCriticalSeconds,
      diskFreeWarningPercent: effective.diskFreeWarningPercent,
      diskFreeCriticalPercent: effective.diskFreeCriticalPercent,
      offlineGraceSeconds: effective.offlineGraceSeconds,
      provenance,
      policyVersion: basePolicy.version,
      resolvedAt: new Date().toISOString(),
    };
  }
}

export const surveillancePolicyResolver = new SurveillancePolicyResolverService();
