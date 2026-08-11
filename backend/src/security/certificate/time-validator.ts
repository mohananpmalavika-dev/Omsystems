/**
 * Certificate Time Validator
 * Validates certificate temporal validity - separate from trust validation
 * Checks notBefore, notAfter, and expiration warnings
 */

import { ParsedCertificate, TimeValidity } from './types';

export interface TimeValidationResult {
  status: TimeValidity;
  daysUntilExpiry?: number;
  daysFromStart?: number;
  warning?: string;
  expiryLevel?: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EXPIRED';
}

export interface TimeValidatorConfig {
  expiryWarningDays: number;
  expiryCriticalDays: number;
  allowClockSkewSeconds: number;
}

export class TimeValidator {
  private readonly config: TimeValidatorConfig;

  constructor(config?: Partial<TimeValidatorConfig>) {
    this.config = {
      expiryWarningDays: config?.expiryWarningDays ?? 30,
      expiryCriticalDays: config?.expiryCriticalDays ?? 7,
      allowClockSkewSeconds: config?.allowClockSkewSeconds ?? 300 // 5 minutes
    };
  }

  /**
   * Check certificate time validity
   * Does NOT check trust, chain, or revocation - only temporal validity
   */
  validateTime(
    cert: ParsedCertificate,
    referenceTime: Date = new Date()
  ): TimeValidationResult {
    const now = referenceTime.getTime();
    const notBefore = cert.validFrom.getTime();
    const notAfter = cert.validTo.getTime();

    // Allow small clock skew for notBefore check
    const clockSkewMs = this.config.allowClockSkewSeconds * 1000;

    // Check if certificate is not yet valid
    if (now < (notBefore - clockSkewMs)) {
      const daysFromStart = Math.ceil((notBefore - now) / (1000 * 60 * 60 * 24));
      return {
        status: 'NOT_YET_VALID',
        daysFromStart,
        warning: `Certificate not valid until ${cert.validFrom.toISOString()}`,
        expiryLevel: 'EXPIRED'
      };
    }

    // Check if certificate has expired
    if (now > notAfter) {
      const daysExpired = Math.ceil((now - notAfter) / (1000 * 60 * 60 * 24));
      return {
        status: 'EXPIRED',
        daysUntilExpiry: -daysExpired,
        warning: `Certificate expired ${daysExpired} days ago`,
        expiryLevel: 'EXPIRED'
      };
    }

    // Certificate is currently valid - check expiration proximity
    const msUntilExpiry = notAfter - now;
    const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

    let expiryLevel: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    let warning: string | undefined;

    if (daysUntilExpiry <= this.config.expiryCriticalDays) {
      expiryLevel = 'CRITICAL';
      warning = `Certificate expires in ${daysUntilExpiry} days`;
    } else if (daysUntilExpiry <= this.config.expiryWarningDays) {
      expiryLevel = 'WARNING';
      warning = `Certificate expires in ${daysUntilExpiry} days`;
    }

    return {
      status: 'VALID',
      daysUntilExpiry,
      warning,
      expiryLevel
    };
  }

  /**
   * Check if certificate is expiring soon
   */
  isExpiringSoon(cert: ParsedCertificate, referenceTime: Date = new Date()): boolean {
    const result = this.validateTime(cert, referenceTime);
    return result.expiryLevel === 'WARNING' || result.expiryLevel === 'CRITICAL';
  }

  /**
   * Check if certificate is expired
   */
  isExpired(cert: ParsedCertificate, referenceTime: Date = new Date()): boolean {
    return referenceTime.getTime() > cert.validTo.getTime();
  }

  /**
   * Check if certificate is not yet valid
   */
  isNotYetValid(cert: ParsedCertificate, referenceTime: Date = new Date()): boolean {
    const clockSkewMs = this.config.allowClockSkewSeconds * 1000;
    return referenceTime.getTime() < (cert.validFrom.getTime() - clockSkewMs);
  }

  /**
   * Get certificate lifetime in days
   */
  getCertificateLifetimeDays(cert: ParsedCertificate): number {
    const lifetimeMs = cert.validTo.getTime() - cert.validFrom.getTime();
    return Math.floor(lifetimeMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate certificate age in days
   */
  getCertificateAgeDays(cert: ParsedCertificate, referenceTime: Date = new Date()): number {
    const ageMs = referenceTime.getTime() - cert.validFrom.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get time until expiry in milliseconds
   */
  getTimeUntilExpiryMs(cert: ParsedCertificate, referenceTime: Date = new Date()): number {
    return cert.validTo.getTime() - referenceTime.getTime();
  }

  /**
   * Classify certificate validity window
   */
  classifyValidityPeriod(cert: ParsedCertificate): {
    classification: 'SHORT_LIVED' | 'NORMAL' | 'LONG_LIVED' | 'VERY_LONG';
    days: number;
  } {
    const days = this.getCertificateLifetimeDays(cert);

    if (days <= 90) {
      return { classification: 'SHORT_LIVED', days };
    } else if (days <= 398) {
      // Modern CA/Browser Forum baseline (was 825 days, now 398 days max for public certs)
      return { classification: 'NORMAL', days };
    } else if (days <= 825) {
      return { classification: 'LONG_LIVED', days };
    } else {
      return { classification: 'VERY_LONG', days };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TimeValidatorConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TimeValidatorConfig {
    return { ...this.config };
  }
}

// Default singleton instance
export const timeValidator = new TimeValidator();
