/**
 * Security Posture Integration for Certificate Infrastructure
 * Provides certificate metrics for security posture dashboard
 * Properly handles VALID/INVALID/UNKNOWN states without manufacturing certainty
 */

import { certificateRepository } from './certificate-repository';
import { certificatePolicyEvaluator } from './policy-evaluator';

export interface CertificateSecurityMetrics {
  available: boolean;
  state: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  confidence: number;
  score: number;
  reason: string;
  evidence: {
    totalCertificates: number;
    parsed: number;
    valid: number;
    invalid: number;
    unknown: number;
    expired: number;
    expiringSoon: number;
    revocationUnknown: number;
    chainUntrusted: number;
  };
  unavailableControls?: string[];
}

export class SecurityPostureIntegration {
  /**
   * Get certificate security metrics for posture dashboard
   * NEVER manufactures VALID status - returns UNKNOWN when evidence is insufficient
   */
  async getCertificateMetrics(): Promise<CertificateSecurityMetrics> {
    try {
      const stats = await certificateRepository.getStatistics();

      // If no certificates are managed, we can't assess
      if (stats.totalCertificates === 0) {
        return {
          available: false,
          state: 'UNKNOWN',
          confidence: 0,
          score: 0,
          reason: 'No certificates under management',
          evidence: {
            totalCertificates: 0,
            parsed: 0,
            valid: 0,
            invalid: 0,
            unknown: 0,
            expired: 0,
            expiringSoon: 0,
            revocationUnknown: 0,
            chainUntrusted: 0
          }
        };
      }

      // Get all certificates and their latest assessments
      const certificates = await certificateRepository.listCertificates();
      
      let validCount = 0;
      let invalidCount = 0;
      let unknownCount = 0;
      let expiredCount = 0;
      let expiringSoonCount = 0;
      let revocationUnknownCount = 0;
      let chainUntrustedCount = 0;

      for (const cert of certificates) {
        // Check if expired
        if (new Date() > cert.notAfter) {
          expiredCount++;
          invalidCount++;
          continue;
        }

        // Check if expiring soon (30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        if (cert.notAfter <= thirtyDaysFromNow) {
          expiringSoonCount++;
        }

        // Get latest assessment if available
        const latestAssessment = await certificateRepository.getLatestAssessment(cert.id);

        if (!latestAssessment) {
          // No assessment available
          unknownCount++;
          continue;
        }

        // Analyze assessment
        if (latestAssessment.overallStatus === 'VALID') {
          validCount++;
        } else if (latestAssessment.overallStatus === 'INVALID') {
          invalidCount++;
        } else {
          unknownCount++;
        }

        // Track specific issues
        if (latestAssessment.revocationStatus === 'UNKNOWN') {
          revocationUnknownCount++;
        }

        if (latestAssessment.chainStatus === 'FAIL') {
          chainUntrustedCount++;
        }
      }

      // Calculate score and confidence
      const { score, confidence, state, reason, unavailableControls } = this.calculatePostureScore({
        totalCertificates: stats.totalCertificates,
        parsed: stats.certificatesByStatus.PARSED || 0,
        valid: validCount,
        invalid: invalidCount,
        unknown: unknownCount,
        expired: expiredCount,
        expiringSoon: expiringSoonCount,
        revocationUnknown: revocationUnknownCount,
        chainUntrusted: chainUntrustedCount
      });

      return {
        available: true,
        state,
        confidence,
        score,
        reason,
        evidence: {
          totalCertificates: stats.totalCertificates,
          parsed: stats.certificatesByStatus.PARSED || 0,
          valid: validCount,
          invalid: invalidCount,
          unknown: unknownCount,
          expired: expiredCount,
          expiringSoon: expiringSoonCount,
          revocationUnknown: revocationUnknownCount,
          chainUntrusted: chainUntrustedCount
        },
        unavailableControls
      };
    } catch (error) {
      return {
        available: false,
        state: 'UNKNOWN',
        confidence: 0,
        score: 0,
        reason: `Certificate metrics unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
        evidence: {
          totalCertificates: 0,
          parsed: 0,
          valid: 0,
          invalid: 0,
          unknown: 0,
          expired: 0,
          expiringSoon: 0,
          revocationUnknown: 0,
          chainUntrusted: 0
        }
      };
    }
  }

  /**
   * Calculate posture score from certificate evidence
   * Conservative scoring: UNKNOWN reduces confidence, doesn't inflate score
   */
  private calculatePostureScore(evidence: CertificateSecurityMetrics['evidence']): {
    score: number;
    confidence: number;
    state: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
    reason: string;
    unavailableControls?: string[];
  } {
    const {
      totalCertificates,
      valid,
      invalid,
      unknown,
      expired,
      expiringSoon,
      revocationUnknown,
      chainUntrusted
    } = evidence;

    const unavailableControls: string[] = [];

    // Calculate base score (0-100)
    let score = 100;

    // Critical issues
    if (expired > 0) {
      score -= expired * 20; // -20 per expired cert
    }

    if (chainUntrusted > 0) {
      score -= chainUntrusted * 15; // -15 per untrusted chain
    }

    // High severity issues
    if (invalid > 0) {
      score -= invalid * 10; // -10 per invalid cert
    }

    // Medium severity issues
    if (expiringSoon > 0) {
      score -= expiringSoon * 5; // -5 per expiring soon
    }

    // Cap score at 0
    score = Math.max(0, score);

    // Calculate confidence based on unknown states
    let confidence = 1.0;

    if (revocationUnknown > 0) {
      // Reduce confidence if we can't verify revocation
      const revocationUnknownRatio = revocationUnknown / totalCertificates;
      confidence -= revocationUnknownRatio * 0.3; // Up to -0.3 for all unknown
      unavailableControls.push('certificate_revocation_checking');
    }

    if (unknown > 0) {
      // Reduce confidence for completely unknown certificates
      const unknownRatio = unknown / totalCertificates;
      confidence -= unknownRatio * 0.4; // Up to -0.4 for all unknown
      unavailableControls.push('certificate_validation');
    }

    confidence = Math.max(0, Math.min(1, confidence));

    // Determine state
    let state: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
    let reason: string;

    if (expired > 0 || chainUntrusted > 0) {
      state = 'CRITICAL';
      reason = `${expired} expired, ${chainUntrusted} untrusted chain`;
    } else if (invalid > 0 || expiringSoon > 0) {
      state = 'DEGRADED';
      reason = `${invalid} invalid, ${expiringSoon} expiring soon`;
    } else if (unknown > totalCertificates * 0.5) {
      // If more than 50% are unknown, overall state is unknown
      state = 'UNKNOWN';
      reason = `${unknown} certificates have unknown validation status`;
    } else if (valid === totalCertificates && revocationUnknown === 0) {
      state = 'HEALTHY';
      reason = 'All certificates valid and verified';
    } else if (valid > 0) {
      state = 'DEGRADED';
      reason = `${valid} valid, ${revocationUnknown} revocation status unknown`;
    } else {
      state = 'UNKNOWN';
      reason = 'Certificate validation status unclear';
    }

    return {
      score,
      confidence,
      state,
      reason,
      unavailableControls: unavailableControls.length > 0 ? unavailableControls : undefined
    };
  }

  /**
   * Convert certificate metrics to legacy SecurityMetrics.certificates format
   */
  async getLegacyCertificateMetrics(): Promise<{
    score: number;
    healthy: number;
    expiringSoon: number;
    expired: number;
    revoked: number;
  }> {
    const metrics = await this.getCertificateMetrics();

    return {
      score: metrics.score,
      healthy: metrics.evidence.valid,
      expiringSoon: metrics.evidence.expiringSoon,
      expired: metrics.evidence.expired,
      revoked: 0 // Would be populated from actual revocation data
    };
  }
}

// Singleton instance
export const securityPostureIntegration = new SecurityPostureIntegration();
