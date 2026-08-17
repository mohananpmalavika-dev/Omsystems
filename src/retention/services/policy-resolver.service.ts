/**
 * Hierarchical Retention Policy Resolver Service
 * Resolves effective retention policy via hierarchy:
 * Camera Override -> Camera Group -> Branch -> Region -> Tenant Default
 */

import {
  ExtendedRetentionPolicy,
  EffectiveRetentionPolicy,
  PolicySource,
} from '../domain/retention-policy-engine.types.js';

export interface CameraHierarchyContext {
  cameraId: string;
  cameraGroup?: string;
  branchId: string;
  regionId?: string;
  tenantId: string;
}

export class PolicyResolverService {
  private tenantPolicies = new Map<string, ExtendedRetentionPolicy>();
  private regionPolicies = new Map<string, ExtendedRetentionPolicy>();
  private branchPolicies = new Map<string, ExtendedRetentionPolicy>();
  private groupPolicies = new Map<string, ExtendedRetentionPolicy>();
  private cameraOverrides = new Map<string, ExtendedRetentionPolicy>();

  constructor() {
    this.seedDefaultPolicies();
  }

  private seedDefaultPolicies() {
    // Tenant Default Policy: 90 Days
    const tenantDefault: ExtendedRetentionPolicy = {
      id: 'pol-tenant-default-90d',
      tenantId: 'BANK-001',
      name: 'Bank Default Retention (90 Days)',
      minimumRetentionDays: 90,
      targetRetentionDays: 100,
      priority: 'HIGH',
      storageClass: 'WARM',
      deleteAfterRetention: true,
      allowTiering: true,
      legalHoldOverride: true,
      enabled: true,
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      createdBy: 'sys-compliance-lead',
    };
    this.tenantPolicies.set('BANK-001', tenantDefault);

    // ATM Group Policy: 180 Days
    const atmPolicy: ExtendedRetentionPolicy = {
      id: 'pol-group-atm-180d',
      tenantId: 'BANK-001',
      name: 'ATM 180-Day Regulatory Policy',
      minimumRetentionDays: 180,
      targetRetentionDays: 190,
      priority: 'CRITICAL',
      storageClass: 'WARM',
      deleteAfterRetention: true,
      allowTiering: true,
      legalHoldOverride: true,
      enabled: true,
      version: 12,
      effectiveFrom: new Date('2026-01-01'),
      createdBy: 'sys-compliance-lead',
    };
    this.groupPolicies.set('ATM', atmPolicy);

    // Vault Group Policy: 180 Days
    const vaultPolicy: ExtendedRetentionPolicy = {
      id: 'pol-group-vault-180d',
      tenantId: 'BANK-001',
      name: 'Vault 180-Day Regulatory Policy',
      minimumRetentionDays: 180,
      targetRetentionDays: 190,
      priority: 'CRITICAL',
      storageClass: 'WARM',
      deleteAfterRetention: true,
      allowTiering: true,
      legalHoldOverride: true,
      enabled: true,
      version: 15,
      effectiveFrom: new Date('2026-01-01'),
      createdBy: 'sys-compliance-lead',
    };
    this.groupPolicies.set('VAULT', vaultPolicy);

    // Office Group Policy: 30 Days
    const officePolicy: ExtendedRetentionPolicy = {
      id: 'pol-group-office-30d',
      tenantId: 'BANK-001',
      name: 'Office Administrative Policy (30 Days)',
      minimumRetentionDays: 30,
      targetRetentionDays: 35,
      priority: 'NORMAL',
      storageClass: 'HOT',
      deleteAfterRetention: true,
      allowTiering: false,
      legalHoldOverride: true,
      enabled: true,
      version: 3,
      effectiveFrom: new Date('2026-01-01'),
      createdBy: 'sys-compliance-lead',
    };
    this.groupPolicies.set('OFFICE', officePolicy);
  }

  setCameraOverride(cameraId: string, policy: ExtendedRetentionPolicy): void {
    this.cameraOverrides.set(cameraId, policy);
  }

  setBranchPolicy(branchId: string, policy: ExtendedRetentionPolicy): void {
    this.branchPolicies.set(branchId, policy);
  }

  /**
   * Resolves effective policy through the 5-layer hierarchy.
   */
  resolve(context: CameraHierarchyContext): EffectiveRetentionPolicy {
    let resolvedPolicy: ExtendedRetentionPolicy | undefined;
    let source: PolicySource = 'TENANT';

    // 1. Camera Override
    if (this.cameraOverrides.has(context.cameraId)) {
      resolvedPolicy = this.cameraOverrides.get(context.cameraId);
      source = 'CAMERA';
    }
    // 2. Camera Group
    else if (context.cameraGroup && this.groupPolicies.has(context.cameraGroup.toUpperCase())) {
      resolvedPolicy = this.groupPolicies.get(context.cameraGroup.toUpperCase());
      source = 'GROUP';
    }
    // 3. Branch Policy
    else if (this.branchPolicies.has(context.branchId)) {
      resolvedPolicy = this.branchPolicies.get(context.branchId);
      source = 'BRANCH';
    }
    // 4. Region Policy
    else if (context.regionId && this.regionPolicies.has(context.regionId)) {
      resolvedPolicy = this.regionPolicies.get(context.regionId);
      source = 'REGION';
    }
    // 5. Tenant Default
    else {
      resolvedPolicy = this.tenantPolicies.get(context.tenantId) || this.tenantPolicies.get('BANK-001');
      source = 'TENANT';
    }

    if (!resolvedPolicy) {
      throw new Error(`Unable to resolve retention policy for camera ${context.cameraId}`);
    }

    return {
      cameraId: context.cameraId,
      policyId: resolvedPolicy.id,
      policyName: resolvedPolicy.name,
      source,
      minimumRetentionDays: resolvedPolicy.minimumRetentionDays,
      targetRetentionDays: resolvedPolicy.targetRetentionDays,
      priority: resolvedPolicy.priority,
      storageClass: resolvedPolicy.storageClass,
      allowTiering: resolvedPolicy.allowTiering,
      calculatedAt: new Date(),
    };
  }
}
