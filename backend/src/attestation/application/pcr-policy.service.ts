/**
 * PCR Policy Service
 * Evaluates platform state against approved PCR policies
 */

import crypto from 'crypto';
import {
  PcrPolicy,
  PcrValue,
  PcrPolicyEvaluationResult,
  PcrPolicyViolation,
  TpmHashAlgorithm,
  DeviceAttestationIdentity,
} from '../domain/attestation.types';
import { PcrPolicyError } from '../domain/attestation-errors';

/**
 * In-memory policy store
 * Production should use database with proper indexing and versioning
 */
interface PolicyStore {
  policies: Map<string, PcrPolicy>;
  tenantDefaultPolicies: Map<string, string>; // tenantId -> policyId
}

export class PcrPolicyService {
  private store: PolicyStore = {
    policies: new Map(),
    tenantDefaultPolicies: new Map(),
  };

  /**
   * Generate unique policy ID
   */
  private generatePolicyId(): string {
    return `policy_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Create PCR policy
   */
  async createPolicy(params: {
    tenantId: string;
    name: string;
    platform: string;
    deviceModel?: string;
    firmwareVersion?: string;
    allowedMeasurements: Array<{
      pcr: number;
      algorithm: TpmHashAlgorithm;
      digests: string[];
      description: string;
    }>;
    validFrom?: Date;
    validUntil?: Date;
  }): Promise<PcrPolicy> {
    // Validate PCR indices
    for (const measurement of params.allowedMeasurements) {
      if (measurement.pcr < 0 || measurement.pcr > 23) {
        throw new PcrPolicyError(
          'POLICY_MISMATCH' as any,
          `Invalid PCR index: ${measurement.pcr} (must be 0-23)`,
          { pcrIndex: measurement.pcr }
        );
      }

      // Validate digest format
      for (const digest of measurement.digests) {
        if (!/^[0-9a-fA-F]+$/.test(digest)) {
          throw new PcrPolicyError(
            'POLICY_MISMATCH' as any,
            `Invalid digest format for PCR ${measurement.pcr}: ${digest}`,
            { pcrIndex: measurement.pcr, digest }
          );
        }
      }
    }

    const policy: PcrPolicy = {
      id: this.generatePolicyId(),
      tenantId: params.tenantId,
      name: params.name,
      platform: params.platform,
      deviceModel: params.deviceModel,
      firmwareVersion: params.firmwareVersion,
      allowedMeasurements: params.allowedMeasurements,
      validFrom: params.validFrom ?? new Date(),
      validUntil: params.validUntil ?? null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.store.policies.set(policy.id, policy);

    console.log(
      `✓ Created PCR policy ${policy.id}: ${policy.name} (${policy.platform})`
    );

    return policy;
  }

  /**
   * Get policy by ID
   */
  async getPolicy(policyId: string): Promise<PcrPolicy | null> {
    return this.store.policies.get(policyId) ?? null;
  }

  /**
   * Find applicable policy for device
   */
  async findApplicablePolicy(params: {
    tenantId: string;
    platform: string;
    deviceModel?: string;
    firmwareVersion?: string;
  }): Promise<PcrPolicy | null> {
    const now = new Date();

    // Find best matching policy
    let bestMatch: PcrPolicy | null = null;
    let bestMatchScore = 0;

    for (const policy of this.store.policies.values()) {
      // Must match tenant
      if (policy.tenantId !== params.tenantId) {
        continue;
      }

      // Must be active
      if (policy.status !== 'ACTIVE') {
        continue;
      }

      // Must be within validity period
      if (policy.validFrom > now) {
        continue;
      }
      if (policy.validUntil && policy.validUntil < now) {
        continue;
      }

      // Must match platform
      if (policy.platform !== params.platform) {
        continue;
      }

      // Calculate match score
      let score = 1; // Base score for platform match

      if (policy.deviceModel && policy.deviceModel === params.deviceModel) {
        score += 10; // Model match is highly specific
      } else if (policy.deviceModel) {
        // Policy specifies model but doesn't match
        continue;
      }

      if (
        policy.firmwareVersion &&
        policy.firmwareVersion === params.firmwareVersion
      ) {
        score += 5; // Firmware match is moderately specific
      } else if (policy.firmwareVersion) {
        // Policy specifies firmware but doesn't match
        continue;
      }

      if (score > bestMatchScore) {
        bestMatch = policy;
        bestMatchScore = score;
      }
    }

    return bestMatch;
  }

  /**
   * Evaluate PCR values against policy
   */
  async evaluatePolicy(params: {
    pcrValues: PcrValue[];
    policy: PcrPolicy;
    identity?: DeviceAttestationIdentity;
  }): Promise<PcrPolicyEvaluationResult> {
    const violations: PcrPolicyViolation[] = [];

    // Build PCR value map
    const pcrMap = new Map<number, string>();
    for (const pcr of params.pcrValues) {
      pcrMap.set(pcr.index, pcr.value.toLowerCase());
    }

    // Check each policy requirement
    for (const measurement of params.policy.allowedMeasurements) {
      const actualValue = pcrMap.get(measurement.pcr);

      if (!actualValue) {
        // PCR value not provided
        violations.push({
          pcr: measurement.pcr,
          expectedPolicy: params.policy.id,
          actualDigest: '(missing)',
          expectedDigests: measurement.digests,
          description: `PCR ${measurement.pcr} value not provided in attestation`,
        });
        continue;
      }

      // Normalize digests for comparison
      const normalizedExpected = measurement.digests.map((d) => d.toLowerCase());

      // Check if actual value matches any allowed digest
      if (!normalizedExpected.includes(actualValue)) {
        violations.push({
          pcr: measurement.pcr,
          expectedPolicy: params.policy.id,
          actualDigest: actualValue,
          expectedDigests: measurement.digests,
          description: `PCR ${measurement.pcr} (${measurement.description}): value does not match policy`,
        });
      }
    }

    const matched = violations.length === 0;

    if (matched) {
      console.log(
        `✓ PCR policy ${params.policy.id} matched for device ${params.identity?.deviceId ?? 'unknown'}`
      );
    } else {
      console.log(
        `❌ PCR policy ${params.policy.id} failed for device ${params.identity?.deviceId ?? 'unknown'}: ${violations.length} violation(s)`
      );
    }

    return {
      matched,
      policyId: params.policy.id,
      violations,
      confidence: matched ? 1.0 : 0.0,
    };
  }

  /**
   * Evaluate PCR values with automatic policy selection
   */
  async evaluateWithAutoPolicy(params: {
    tenantId: string;
    pcrValues: PcrValue[];
    platform: string;
    deviceModel?: string;
    firmwareVersion?: string;
    identity?: DeviceAttestationIdentity;
  }): Promise<PcrPolicyEvaluationResult | null> {
    // Find applicable policy
    const policy = await this.findApplicablePolicy({
      tenantId: params.tenantId,
      platform: params.platform,
      deviceModel: params.deviceModel,
      firmwareVersion: params.firmwareVersion,
    });

    if (!policy) {
      console.log(
        `⚠️  No applicable PCR policy found for ${params.platform} (model: ${params.deviceModel ?? 'any'}, fw: ${params.firmwareVersion ?? 'any'})`
      );
      return null;
    }

    return this.evaluatePolicy({
      pcrValues: params.pcrValues,
      policy,
      identity: params.identity,
    });
  }

  /**
   * Revoke policy
   */
  async revokePolicy(policyId: string, reason: string): Promise<boolean> {
    const policy = this.store.policies.get(policyId);

    if (!policy) {
      return false;
    }

    policy.status = 'REVOKED';
    policy.updatedAt = new Date();

    console.log(`⚠️  Revoked PCR policy ${policyId}: ${reason}`);

    return true;
  }

  /**
   * List policies for tenant
   */
  async listPolicies(params: {
    tenantId: string;
    includeRevoked?: boolean;
    platform?: string;
  }): Promise<PcrPolicy[]> {
    const policies: PcrPolicy[] = [];

    for (const policy of this.store.policies.values()) {
      if (policy.tenantId !== params.tenantId) {
        continue;
      }

      if (!params.includeRevoked && policy.status === 'REVOKED') {
        continue;
      }

      if (params.platform && policy.platform !== params.platform) {
        continue;
      }

      policies.push(policy);
    }

    return policies;
  }

  /**
   * Set default policy for tenant
   */
  async setDefaultPolicy(tenantId: string, policyId: string): Promise<boolean> {
    const policy = this.store.policies.get(policyId);

    if (!policy || policy.tenantId !== tenantId) {
      return false;
    }

    this.store.tenantDefaultPolicies.set(tenantId, policyId);

    return true;
  }

  /**
   * Get default policy for tenant
   */
  async getDefaultPolicy(tenantId: string): Promise<PcrPolicy | null> {
    const policyId = this.store.tenantDefaultPolicies.get(tenantId);

    if (!policyId) {
      return null;
    }

    return this.getPolicy(policyId);
  }

  /**
   * Create default secure boot policy for Windows/UEFI platform
   */
  async createDefaultWindowsSecureBootPolicy(
    tenantId: string
  ): Promise<PcrPolicy> {
    return this.createPolicy({
      tenantId,
      name: 'Default Windows Secure Boot Policy',
      platform: 'Windows-UEFI',
      allowedMeasurements: [
        {
          pcr: 0,
          algorithm: TpmHashAlgorithm.SHA256,
          digests: [
            // These are example values - real policy needs actual baseline
            '3d6772b4f84ed47595d72a2c4c5ffd15f5bb72c7507fe26f2aaee2c69d5633ba',
          ],
          description: 'BIOS/UEFI firmware',
        },
        {
          pcr: 7,
          algorithm: TpmHashAlgorithm.SHA256,
          digests: [
            // Example secure boot state
            '8c23b8c95d92e3fc4f7c7db82f8c5f5d7a4e8c9b3d2f1e0a9c8b7a6f5e4d3c2b',
          ],
          description: 'Secure Boot state',
        },
      ],
    });
  }

  /**
   * Get policy statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalPolicies: number;
    activePolicies: number;
    revokedPolicies: number;
    policiesByPlatform: Record<string, number>;
  }> {
    const policies = await this.listPolicies({
      tenantId,
      includeRevoked: true,
    });

    let active = 0;
    let revoked = 0;
    const byPlatform: Record<string, number> = {};

    for (const policy of policies) {
      if (policy.status === 'ACTIVE') {
        active++;
      } else {
        revoked++;
      }

      byPlatform[policy.platform] = (byPlatform[policy.platform] ?? 0) + 1;
    }

    return {
      totalPolicies: policies.length,
      activePolicies: active,
      revokedPolicies: revoked,
      policiesByPlatform: byPlatform,
    };
  }
}
