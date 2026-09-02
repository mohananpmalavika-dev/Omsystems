/**
 * Certificate Lifecycle & Expiry Monitoring Manager
 * 
 * Tracks certificate metadata and monitors expiration windows
 * without storing or exposing private key material.
 */

import { X509Certificate } from "node:crypto";
import type { CertificateStatus } from "../../../packages/contracts/src/security/tls/tls-types.js";

export class CertificateManager {
  /**
   * Parses and inspects an X.509 certificate PEM string or Buffer
   */
  static inspectCertificate(pemOrBuffer: string | Buffer): CertificateStatus {
    const cert = new X509Certificate(pemOrBuffer);
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const now = Date.now();
    const msRemaining = validTo.getTime() - now;
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

    let state: CertificateStatus["state"] = "VALID";
    if (daysRemaining < 0) {
      state = "EXPIRED";
    } else if (daysRemaining <= 30) {
      state = "EXPIRING";
    }

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      daysRemaining,
      fingerprintSha256: cert.fingerprint256.replace(/:/g, "").toLowerCase(),
      state,
    };
  }

  /**
   * Checks if an alert should be raised for an expiring certificate
   */
  static evaluateExpiryAlert(status: CertificateStatus): {
    shouldAlert: boolean;
    level: "INFO" | "WARNING" | "CRITICAL";
    message: string;
  } {
    if (status.daysRemaining <= 0) {
      return {
        shouldAlert: true,
        level: "CRITICAL",
        message: `Certificate for '${status.subject}' EXPIRED on ${status.validTo}.`,
      };
    }
    if (status.daysRemaining <= 7) {
      return {
        shouldAlert: true,
        level: "CRITICAL",
        message: `Certificate for '${status.subject}' expires in ${status.daysRemaining} days (${status.validTo}). Immediate rotation required.`,
      };
    }
    if (status.daysRemaining <= 30) {
      return {
        shouldAlert: true,
        level: "WARNING",
        message: `Certificate for '${status.subject}' expires in ${status.daysRemaining} days (${status.validTo}).`,
      };
    }
    if (status.daysRemaining <= 90) {
      return {
        shouldAlert: true,
        level: "INFO",
        message: `Certificate for '${status.subject}' expires in ${status.daysRemaining} days.`,
      };
    }

    return {
      shouldAlert: false,
      level: "INFO",
      message: `Certificate for '${status.subject}' is healthy (${status.daysRemaining} days remaining).`,
    };
  }
}
