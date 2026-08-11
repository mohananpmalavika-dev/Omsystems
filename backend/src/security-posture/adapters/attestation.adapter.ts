/**
 * Attestation Security Posture Adapter
 * Collects TPM attestation telemetry for security posture dashboard
 */

import { Pool } from 'pg';
import type {
  SecurityPostureCollector,
  SecurityTelemetryResult,
  TelemetryContext
} from '../contracts/security-posture-collector';
import { AttestationService } from '../../services/attestation.service';
import { AttestationStatus, AttestationAssurance } from '../../types/attestation.types';

export class AttestationAdapter implements SecurityPostureCollector {
  readonly id = 'attestation-security';
  readonly name = 'TPM Attestation Security';
  readonly description = 'TPM-based boot integrity and device attestation telemetry';
  readonly tags = ['attestation', 'tpm', 'boot-integrity', 'hardware-security'];

  private attestationService: AttestationService;

  constructor(private pool: Pool) {
    this.attestationService = new AttestationService(pool);
  }

  async collect(context: TelemetryContext): Promise<SecurityTelemetryResult[]> {
    const results: SecurityTelemetryResult[] = [];
    const timestamp = new Date();

    try {
      // Get attestation statistics
      const stats = await this.attestationService.getStatistics(context.tenantId);

      // TPM Attestation Overall Status
      results.push({
        source: 'tpm-attestation',
        observedAt: timestamp,
        available: true,
        value: {
          totalDevices: stats.totalDevices,
          verifiedDevices: stats.statusBreakdown[AttestationStatus.VERIFIED],
          failedDevices: stats.statusBreakdown[AttestationStatus.FAILED],
          staleDevices: stats.statusBreakdown[AttestationStatus.STALE],
          unsupportedDevices: stats.statusBreakdown[AttestationStatus.UNSUPPORTED],
          complianceRate: stats.policyComplianceRate
        },
        quality: {
          confidence: stats.totalDevices > 0 ? 1.0 : 0.0,
          completeness: 1.0,
          freshness: 1.0
        },
        evidence: {
          totalEnrolledDevices: stats.totalDevices,
          hardwareAttestedDevices: stats.assuranceBreakdown[AttestationAssurance.HARDWARE_ATTESTED],
          averageAttestationAgeSeconds: stats.averageAttestationAgeSeconds
        }
      });

      // Attestation Success Rate
      const successRate = stats.totalDevices > 0
        ? (stats.statusBreakdown[AttestationStatus.VERIFIED] / stats.totalDevices) * 100
        : 0;

      results.push({
        source: 'attestation-success-rate',
        observedAt: timestamp,
        available: true,
        value: {
          rate: successRate,
          verified: stats.statusBreakdown[AttestationStatus.VERIFIED],
          total: stats.totalDevices
        },
        quality: {
          confidence: stats.totalDevices > 0 ? 0.95 : 0.0,
          completeness: 1.0,
          freshness: 1.0
        },
        evidence: {
          verifiedCount: stats.statusBreakdown[AttestationStatus.VERIFIED],
          failedCount: stats.statusBreakdown[AttestationStatus.FAILED],
          totalCount: stats.totalDevices
        }
      });

      // Hardware Attestation Coverage
      const hardwareAttestationRate = stats.totalDevices > 0
        ? (stats.assuranceBreakdown[AttestationAssurance.HARDWARE_ATTESTED] / stats.totalDevices) * 100
        : 0;

      results.push({
        source: 'hardware-attestation-coverage',
        observedAt: timestamp,
        available: true,
        value: {
          coverage: hardwareAttestationRate,
          hardwareAttested: stats.assuranceBreakdown[AttestationAssurance.HARDWARE_ATTESTED],
          total: stats.totalDevices
        },
        quality: {
          confidence: 1.0,
          completeness: 1.0,
          freshness: 1.0
        },
        evidence: {
          assuranceBreakdown: stats.assuranceBreakdown
        }
      });

      // Attestation Freshness
      const maxStaleSeconds = 86400; // 24 hours
      const freshnessScore = stats.averageAttestationAgeSeconds <= maxStaleSeconds
        ? 100
        : Math.max(0, 100 - ((stats.averageAttestationAgeSeconds - maxStaleSeconds) / maxStaleSeconds * 100));

      results.push({
        source: 'attestation-freshness',
        observedAt: timestamp,
        available: true,
        value: {
          score: freshnessScore,
          averageAgeSeconds: stats.averageAttestationAgeSeconds,
          staleCount: stats.staleAttestations
        },
        quality: {
          confidence: 0.9,
          completeness: 1.0,
          freshness: freshnessScore > 50 ? 1.0 : 0.5
        },
        evidence: {
          averageAttestationAgeSeconds: stats.averageAttestationAgeSeconds,
          staleAttestations: stats.staleAttestations,
          maxAllowedAgeSeconds: maxStaleSeconds
        }
      });

      // Policy Compliance
      results.push({
        source: 'boot-policy-compliance',
        observedAt: timestamp,
        available: true,
        value: {
          complianceRate: stats.policyComplianceRate * 100,
          compliantDevices: stats.statusBreakdown[AttestationStatus.VERIFIED],
          totalDevices: stats.totalDevices
        },
        quality: {
          confidence: 1.0,
          completeness: 1.0,
          freshness: 1.0
        },
        evidence: {
          policyComplianceRate: stats.policyComplianceRate,
          verifiedCount: stats.statusBreakdown[AttestationStatus.VERIFIED],
          totalCount: stats.totalDevices
        }
      });

      // Recent Failures
      results.push({
        source: 'attestation-failures',
        observedAt: timestamp,
        available: true,
        value: {
          failureCount: stats.recentFailures,
          severity: stats.recentFailures > 0 ? 'high' : 'low'
        },
        quality: {
          confidence: 1.0,
          completeness: 1.0,
          freshness: 1.0
        },
        evidence: {
          recentFailures: stats.recentFailures,
          failedDevices: stats.statusBreakdown[AttestationStatus.FAILED]
        }
      });

    } catch (error: any) {
      // Return error telemetry
      results.push({
        source: 'tpm-attestation',
        observedAt: timestamp,
        available: false,
        value: null,
        quality: {
          confidence: 0,
          completeness: 0,
          freshness: 0
        },
        errorMessage: `Attestation telemetry collection failed: ${error.message}`,
        evidence: {
          error: error.toString()
        }
      });
    }

    return results;
  }
}
