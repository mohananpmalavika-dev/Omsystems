/**
 * Certificate Policy Evaluator
 * Evaluates certificates against security policies and generates findings
 * Separates policy judgement from parsing facts
 */

import { ParsedCertificate, SecurityFinding, CertificatePolicy } from './types';
import { timeValidator, TimeValidationResult } from './time-validator';

export class CertificatePolicyEvaluator {
  private policy: CertificatePolicy;

  constructor(policy?: Partial<CertificatePolicy>) {
    this.policy = {
      expiryWarningDays: policy?.expiryWarningDays ?? 30,
      expiryCriticalDays: policy?.expiryCriticalDays ?? 7,
      minKeySize: {
        rsa: policy?.minKeySize?.rsa ?? 2048,
        ecdsa: policy?.minKeySize?.ecdsa ?? 256
      },
      allowedSignatureAlgorithms: policy?.allowedSignatureAlgorithms ?? [
        'sha256',
        'sha384',
        'sha512',
        'ecdsa-with-SHA256',
        'ecdsa-with-SHA384',
        'ecdsa-with-SHA512'
      ],
      requireOcspValidation: policy?.requireOcspValidation ?? false,
      requireChainValidation: policy?.requireChainValidation ?? true
    };
  }

  /**
   * Evaluate certificate against security policy
   * Returns list of findings (issues/warnings)
   */
  evaluate(
    cert: ParsedCertificate,
    timeValidation?: TimeValidationResult
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 1. Check public key strength
    findings.push(...this.evaluatePublicKeyStrength(cert));

    // 2. Check signature algorithm (though not directly exposed by X509Certificate)
    // In a full implementation, would parse signatureAlgorithm from certificate
    // For now, we check key type which is a good proxy

    // 3. Check certificate lifetime
    findings.push(...this.evaluateCertificateLifetime(cert));

    // 4. Check expiration
    if (timeValidation) {
      findings.push(...this.evaluateExpiration(cert, timeValidation));
    }

    // 5. Check certificate age (very new certs can be suspicious)
    findings.push(...this.evaluateCertificateAge(cert));

    // 6. Check for self-signed certificates
    findings.push(...this.evaluateSelfSigned(cert));

    // 7. Check Subject Alternative Names
    findings.push(...this.evaluateSubjectAltNames(cert));

    return findings;
  }

  /**
   * Evaluate public key strength
   */
  private evaluatePublicKeyStrength(cert: ParsedCertificate): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const keyType = cert.publicKey.type.toLowerCase();
    const keySize = cert.publicKey.size;

    if (keyType === 'rsa') {
      if (keySize && keySize < this.policy.minKeySize.rsa) {
        findings.push({
          code: 'WEAK_RSA_KEY',
          severity: keySize < 1024 ? 'CRITICAL' : 'HIGH',
          message: `RSA key size ${keySize} bits is below minimum ${this.policy.minKeySize.rsa} bits`,
          recommendation: `Use RSA key size of at least ${this.policy.minKeySize.rsa} bits`
        });
      } else if (keySize && keySize < 3072) {
        findings.push({
          code: 'RSA_KEY_SIZE_WARNING',
          severity: 'MEDIUM',
          message: `RSA key size ${keySize} bits is acceptable but 3072+ bits recommended for long-term security`,
          recommendation: 'Consider using RSA-3072 or higher, or switch to ECDSA'
        });
      }
    } else if (keyType === 'ec' || keyType === 'ecdsa') {
      if (keySize && keySize < this.policy.minKeySize.ecdsa) {
        findings.push({
          code: 'WEAK_ECDSA_KEY',
          severity: 'HIGH',
          message: `ECDSA key size ${keySize} bits is below minimum ${this.policy.minKeySize.ecdsa} bits`,
          recommendation: `Use ECDSA key size of at least ${this.policy.minKeySize.ecdsa} bits (P-256 or higher)`
        });
      }
    } else if (keyType === 'dsa') {
      findings.push({
        code: 'DEPRECATED_KEY_ALGORITHM',
        severity: 'HIGH',
        message: 'DSA key algorithm is deprecated and should not be used',
        recommendation: 'Migrate to RSA-2048+ or ECDSA P-256+'
      });
    } else if (keyType === 'unknown') {
      findings.push({
        code: 'UNKNOWN_KEY_ALGORITHM',
        severity: 'MEDIUM',
        message: 'Certificate uses unknown or unsupported key algorithm',
        recommendation: 'Use standard RSA or ECDSA keys'
      });
    }

    return findings;
  }

  /**
   * Evaluate certificate lifetime
   */
  private evaluateCertificateLifetime(cert: ParsedCertificate): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    const lifetimeMs = cert.validTo.getTime() - cert.validFrom.getTime();
    const lifetimeDays = Math.floor(lifetimeMs / (1000 * 60 * 60 * 24));

    // CA/Browser Forum Baseline Requirements limit
    if (lifetimeDays > 398) {
      findings.push({
        code: 'EXCESSIVE_VALIDITY_PERIOD',
        severity: 'MEDIUM',
        message: `Certificate validity period of ${lifetimeDays} days exceeds recommended 398 days`,
        recommendation: 'Issue certificates with validity period of 398 days or less per CA/Browser Forum baseline'
      });
    }

    // Very long-lived certificates (legacy)
    if (lifetimeDays > 825) {
      findings.push({
        code: 'VERY_LONG_VALIDITY_PERIOD',
        severity: 'HIGH',
        message: `Certificate validity period of ${lifetimeDays} days is excessively long`,
        recommendation: 'Rotate certificate and implement regular renewal process'
      });
    }

    // Extremely short-lived (may indicate testing cert)
    if (lifetimeDays < 7) {
      findings.push({
        code: 'VERY_SHORT_VALIDITY_PERIOD',
        severity: 'LOW',
        message: `Certificate validity period of ${lifetimeDays} days is very short`,
        recommendation: 'Verify this is not a test certificate in production'
      });
    }

    return findings;
  }

  /**
   * Evaluate certificate expiration
   */
  private evaluateExpiration(
    cert: ParsedCertificate,
    timeValidation: TimeValidationResult
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (timeValidation.status === 'EXPIRED') {
      findings.push({
        code: 'CERTIFICATE_EXPIRED',
        severity: 'CRITICAL',
        message: `Certificate expired ${Math.abs(timeValidation.daysUntilExpiry || 0)} days ago`,
        recommendation: 'Renew certificate immediately'
      });
    } else if (timeValidation.status === 'NOT_YET_VALID') {
      findings.push({
        code: 'CERTIFICATE_NOT_YET_VALID',
        severity: 'HIGH',
        message: `Certificate not valid until ${cert.validFrom.toISOString()}`,
        recommendation: 'Verify system clock is correct or wait for certificate validity period'
      });
    } else if (timeValidation.expiryLevel === 'CRITICAL') {
      findings.push({
        code: 'CERTIFICATE_EXPIRING_CRITICAL',
        severity: 'CRITICAL',
        message: `Certificate expires in ${timeValidation.daysUntilExpiry} days`,
        recommendation: 'Renew certificate urgently'
      });
    } else if (timeValidation.expiryLevel === 'WARNING') {
      findings.push({
        code: 'CERTIFICATE_EXPIRING_SOON',
        severity: 'MEDIUM',
        message: `Certificate expires in ${timeValidation.daysUntilExpiry} days`,
        recommendation: 'Schedule certificate renewal'
      });
    }

    return findings;
  }

  /**
   * Evaluate certificate age (very new certs can be suspicious)
   */
  private evaluateCertificateAge(cert: ParsedCertificate): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    const ageMs = Date.now() - cert.validFrom.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    // Certificate issued very recently (< 1 day)
    if (ageDays < 1 && ageMs > 0) {
      findings.push({
        code: 'RECENTLY_ISSUED_CERTIFICATE',
        severity: 'LOW',
        message: 'Certificate was issued very recently (less than 1 day ago)',
        recommendation: 'Verify certificate rotation was authorized'
      });
    }

    // Certificate has future notBefore (clock skew)
    if (ageMs < 0) {
      const hoursInFuture = Math.ceil(Math.abs(ageMs) / (1000 * 60 * 60));
      
      if (hoursInFuture > 1) {
        findings.push({
          code: 'CERTIFICATE_FUTURE_ISSUE',
          severity: 'MEDIUM',
          message: `Certificate notBefore is ${hoursInFuture} hours in the future`,
          recommendation: 'Check system clock synchronization'
        });
      }
    }

    return findings;
  }

  /**
   * Evaluate self-signed certificates
   */
  private evaluateSelfSigned(cert: ParsedCertificate): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (cert.subject === cert.issuer) {
      findings.push({
        code: 'SELF_SIGNED_CERTIFICATE',
        severity: 'MEDIUM',
        message: 'Certificate is self-signed',
        recommendation: 'Use CA-issued certificates for production or explicitly trust/pin this certificate'
      });
    }

    return findings;
  }

  /**
   * Evaluate Subject Alternative Names
   */
  private evaluateSubjectAltNames(cert: ParsedCertificate): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Modern certificates should have SANs
    if (cert.subjectAltNames.length === 0) {
      findings.push({
        code: 'NO_SUBJECT_ALT_NAMES',
        severity: 'LOW',
        message: 'Certificate has no Subject Alternative Names',
        recommendation: 'Modern certificates should include SANs for hostname/IP verification'
      });
    }

    // Check for wildcard certificates
    const hasWildcard = cert.subjectAltNames.some(
      san => san.type === 'DNS' && san.value.startsWith('*.')
    );

    if (hasWildcard) {
      findings.push({
        code: 'WILDCARD_CERTIFICATE',
        severity: 'LOW',
        message: 'Certificate uses wildcard DNS name',
        recommendation: 'Consider using specific hostnames for better security and monitoring'
      });
    }

    return findings;
  }

  /**
   * Evaluate revocation status findings
   */
  evaluateRevocationStatus(
    revocationStatus: 'GOOD' | 'REVOKED' | 'UNKNOWN'
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (revocationStatus === 'REVOKED') {
      findings.push({
        code: 'CERTIFICATE_REVOKED',
        severity: 'CRITICAL',
        message: 'Certificate has been revoked',
        recommendation: 'Replace certificate immediately - it should not be trusted'
      });
    } else if (revocationStatus === 'UNKNOWN') {
      if (this.policy.requireOcspValidation) {
        findings.push({
          code: 'REVOCATION_STATUS_UNKNOWN',
          severity: 'HIGH',
          message: 'Certificate revocation status could not be determined',
          recommendation: 'Enable OCSP/CRL checking or accept elevated risk'
        });
      } else {
        findings.push({
          code: 'REVOCATION_STATUS_UNKNOWN',
          severity: 'LOW',
          message: 'Certificate revocation status could not be determined',
          recommendation: 'Consider enabling OCSP/CRL checking for enhanced security'
        });
      }
    }

    return findings;
  }

  /**
   * Evaluate chain validation findings
   */
  evaluateChainValidation(
    chainStatus: 'TRUSTED' | 'UNTRUSTED' | 'INCOMPLETE' | 'UNKNOWN'
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (chainStatus === 'UNTRUSTED') {
      findings.push({
        code: 'UNTRUSTED_CERTIFICATE_CHAIN',
        severity: 'CRITICAL',
        message: 'Certificate chain does not validate to a trusted root',
        recommendation: 'Install issuer CA certificate in trust store or verify certificate source'
      });
    } else if (chainStatus === 'INCOMPLETE') {
      findings.push({
        code: 'INCOMPLETE_CERTIFICATE_CHAIN',
        severity: 'HIGH',
        message: 'Certificate chain is incomplete - missing intermediate or root certificate',
        recommendation: 'Obtain and install missing intermediate certificates'
      });
    } else if (chainStatus === 'UNKNOWN') {
      if (this.policy.requireChainValidation) {
        findings.push({
          code: 'CHAIN_VALIDATION_FAILED',
          severity: 'HIGH',
          message: 'Certificate chain validation could not be completed',
          recommendation: 'Configure trust anchors and retry validation'
        });
      }
    }

    return findings;
  }

  /**
   * Update policy configuration
   */
  updatePolicy(policy: Partial<CertificatePolicy>): void {
    Object.assign(this.policy, policy);
  }

  /**
   * Get current policy
   */
  getPolicy(): CertificatePolicy {
    return { ...this.policy };
  }

  /**
   * Calculate risk score from findings
   */
  calculateRiskScore(findings: SecurityFinding[]): number {
    let score = 0;

    const severityScores = {
      LOW: 10,
      MEDIUM: 25,
      HIGH: 50,
      CRITICAL: 100
    };

    for (const finding of findings) {
      score += severityScores[finding.severity];
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Get highest severity from findings
   */
  getHighestSeverity(findings: SecurityFinding[]): SecurityFinding['severity'] | null {
    if (findings.length === 0) return null;

    const severityOrder: SecurityFinding['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    for (const severity of severityOrder) {
      if (findings.some(f => f.severity === severity)) {
        return severity;
      }
    }

    return null;
  }
}

// Singleton instance
export const certificatePolicyEvaluator = new CertificatePolicyEvaluator();
