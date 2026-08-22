/**
 * Boot Policy Service
 * Manages known-good PCR baselines and boot integrity policies
 */

import { Pool } from 'pg';
import {
  BootAttestationPolicy,
  BootPolicyMeasurement,
  PolicyStatus
} from '../types/attestation.types';
import { BootPolicyRepository } from '../repositories/boot-policy.repository';

export class BootPolicyService {
  private policyRepo: BootPolicyRepository;

  constructor(private pool: Pool) {
    this.policyRepo = new BootPolicyRepository(pool);
  }

  /**
   * Create new boot policy
   */
  async createPolicy(params: {
    tenantId: string;
    name: string;
    description?: string;
    platformType: string;
    hardwareModel?: string;
    firmwareVersion?: string;
    operatingSystem?: string;
    osVersion?: string;
    hashAlgorithm?: 'sha256' | 'sha384' | 'sha512';
    requiredPcrs?: number[];
    allowedMeasurements: BootPolicyMeasurement[];
    createdBy: string;
  }): Promise<BootAttestationPolicy> {
    const policy = await this.policyRepo.create({
      ...params,
      hashAlgorithm: params.hashAlgorithm || 'sha256',
      requiredPcrs: params.requiredPcrs || [0, 2, 4, 7],
      status: PolicyStatus.DRAFT
    });

    console.log(`✓ Created boot policy: ${policy.name} (${policy.id})`);

    return policy;
  }

  /**
   * Resolve active policy for device
   */
  async resolveForDevice(params: {
    tenantId: string;
    platformType: string;
    hardwareModel?: string;
  }): Promise<BootAttestationPolicy | null> {
    return this.policyRepo.findActiveForPlatform(
      params.tenantId,
      params.platformType,
      params.hardwareModel
    );
  }

  /**
   * Evaluate PCR values against policy
   */
  async evaluatePolicy(
    policy: BootAttestationPolicy,
    pcrValues: Record<string, string>
  ): Promise<{
    valid: boolean;
    failures: string[];
    matchedMeasurements: number;
    totalMeasurements: number;
  }> {
    const failures: string[] = [];
    let matchedMeasurements = 0;

    // Check all required PCRs are present
    for (const requiredPcr of policy.requiredPcrs) {
      const pcrValue = pcrValues[requiredPcr.toString()];

      if (!pcrValue) {
        failures.push(`MISSING_PCR_${requiredPcr}`);
        continue;
      }

      // Find policy measurement for this PCR
      const measurement = policy.allowedMeasurements.find(
        m => m.pcr === requiredPcr
      );

      if (!measurement) {
        failures.push(`NO_POLICY_FOR_PCR_${requiredPcr}`);
        continue;
      }

      // Check if PCR value matches any allowed value
      const matches = measurement.values.some(
        allowedValue => allowedValue.toLowerCase() === pcrValue.toLowerCase()
      );

      if (matches) {
        matchedMeasurements++;
      } else {
        failures.push(`PCR_${requiredPcr}_POLICY_MISMATCH`);
      }
    }

    const valid = failures.length === 0;

    return {
      valid,
      failures,
      matchedMeasurements,
      totalMeasurements: policy.allowedMeasurements.length
    };
  }

  /**
   * Transition policy to observing mode
   */
  async startObserving(policyId: string): Promise<BootAttestationPolicy | null> {
    const policy = await this.policyRepo.updateStatus(
      policyId,
      PolicyStatus.OBSERVING
    );

    if (policy) {
      console.log(`📊 Policy ${policy.name} is now observing`);
    }

    return policy;
  }

  /**
   * Approve policy for activation
   */
  async approve(policyId: string): Promise<BootAttestationPolicy | null> {
    const policy = await this.policyRepo.updateStatus(
      policyId,
      PolicyStatus.APPROVED
    );

    if (policy) {
      console.log(`✓ Policy ${policy.name} approved`);
    }

    return policy;
  }

  /**
   * Activate policy
   */
  async activate(policyId: string): Promise<BootAttestationPolicy | null> {
    const policy = await this.policyRepo.activate(policyId);

    if (policy) {
      console.log(`✓ Policy ${policy.name} activated`);
    }

    return policy;
  }

  /**
   * Retire policy
   */
  async retire(policyId: string): Promise<BootAttestationPolicy | null> {
    const policy = await this.policyRepo.retire(policyId);

    if (policy) {
      console.log(`📦 Policy ${policy.name} retired`);
    }

    return policy;
  }

  /**
   * Create new version of policy
   */
  async createVersion(
    basePolicyId: string,
    updates: {
      description?: string;
      allowedMeasurements?: BootPolicyMeasurement[];
      requiredPcrs?: number[];
    },
    createdBy: string
  ): Promise<BootAttestationPolicy> {
    const basePolicy = await this.policyRepo.findById(basePolicyId);

    if (!basePolicy) {
      throw new Error(`Policy ${basePolicyId} not found`);
    }

    const newPolicy = await this.policyRepo.createVersion(
      basePolicy,
      updates,
      createdBy
    );

    console.log(
      `✓ Created policy version ${newPolicy.version} from ${basePolicy.name}`
    );

    return newPolicy;
  }

  /**
   * Get policy by ID
   */
  async getPolicy(policyId: string): Promise<BootAttestationPolicy | null> {
    return this.policyRepo.findById(policyId);
  }

  /**
   * List policies for tenant
   */
  async listPolicies(
    tenantId: string,
    filter?: {
      status?: PolicyStatus;
      platformType?: string;
    }
  ): Promise<BootAttestationPolicy[]> {
    return this.policyRepo.listByTenant(tenantId, filter);
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    byStatus: Record<PolicyStatus, number>;
    platforms: string[];
  }> {
    return this.policyRepo.getStatistics(tenantId);
  }

  /**
   * Create default policy for common platform
   */
  async createDefaultPolicy(
    tenantId: string,
    platformType: 'linux-edge' | 'windows-edge' | 'generic',
    createdBy: string
  ): Promise<BootAttestationPolicy> {
    const defaults = this.getDefaultPolicyTemplate(platformType);

    return this.createPolicy({
      tenantId,
      createdBy,
      ...defaults
    });
  }

  /**
   * Get default policy templates
   */
  private getDefaultPolicyTemplate(
    platformType: 'linux-edge' | 'windows-edge' | 'generic'
  ): {
    name: string;
    description: string;
    platformType: string;
    requiredPcrs: number[];
    allowedMeasurements: BootPolicyMeasurement[];
  } {
    switch (platformType) {
      case 'linux-edge':
        return {
          name: 'Linux Edge Device Default Policy',
          description: 'Default boot integrity policy for Linux edge appliances',
          platformType: 'linux-edge',
          requiredPcrs: [0, 2, 4, 7],
          allowedMeasurements: [
            {
              pcr: 0,
              values: [],
              description: 'UEFI firmware and BIOS'
            },
            {
              pcr: 2,
              values: [],
              description: 'Option ROM code'
            },
            {
              pcr: 4,
              values: [],
              description: 'Boot loader (GRUB2)'
            },
            {
              pcr: 7,
              values: [],
              description: 'Secure Boot state'
            }
          ]
        };

      case 'windows-edge':
        return {
          name: 'Windows Edge Device Default Policy',
          description: 'Default boot integrity policy for Windows edge appliances',
          platformType: 'windows-edge',
          requiredPcrs: [0, 2, 4, 7, 11],
          allowedMeasurements: [
            {
              pcr: 0,
              values: [],
              description: 'UEFI firmware'
            },
            {
              pcr: 2,
              values: [],
              description: 'Option ROM code'
            },
            {
              pcr: 4,
              values: [],
              description: 'Windows Boot Manager'
            },
            {
              pcr: 7,
              values: [],
              description: 'Secure Boot state'
            },
            {
              pcr: 11,
              values: [],
              description: 'BitLocker access control'
            }
          ]
        };

      case 'generic':
      default:
        return {
          name: 'Generic Device Default Policy',
          description: 'Generic boot integrity policy for unknown platforms',
          platformType: 'generic',
          requiredPcrs: [0, 7],
          allowedMeasurements: [
            {
              pcr: 0,
              values: [],
              description: 'Firmware'
            },
            {
              pcr: 7,
              values: [],
              description: 'Secure Boot state'
            }
          ]
        };
    }
  }

  /**
   * Learn baseline from observed measurements
   * Use during OBSERVING phase to collect known-good values
   */
  async addObservedMeasurement(
    policyId: string,
    pcr: number,
    value: string,
    description?: string
  ): Promise<boolean> {
    const policy = await this.policyRepo.findById(policyId);

    if (!policy) {
      return false;
    }

    if (policy.status !== PolicyStatus.OBSERVING) {
      console.warn(
        `Cannot add observed measurement to policy in ${policy.status} status`
      );
      return false;
    }

    // Find existing measurement for this PCR
    const existingIdx = policy.allowedMeasurements.findIndex(m => m.pcr === pcr);

    if (existingIdx >= 0) {
      // Add value if not already present
      const existing = policy.allowedMeasurements[existingIdx];
      if (!existing.values.includes(value)) {
        existing.values.push(value);
        console.log(`📊 Added observed value to policy ${policy.name} PCR ${pcr}`);
      }
    } else {
      // Create new measurement
      policy.allowedMeasurements.push({
        pcr,
        values: [value],
        description: description || `PCR ${pcr}`
      });
      console.log(`📊 Added new PCR ${pcr} to policy ${policy.name}`);
    }

    // Update policy in database
    // Note: This would need a repository method to update measurements
    // For now, log the change

    return true;
  }
}
