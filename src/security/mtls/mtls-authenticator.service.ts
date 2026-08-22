/**
 * mTLS Authenticator Service
 * Banking-Grade X.509 client certificate validation for edge gateways,
 * media nodes, and recording engines.
 */

import { X509Certificate, createHash } from "node:crypto";

export type NodeRole = "EDGE_GATEWAY" | "MEDIA_NODE" | "RECORDING_ENGINE" | "CONTROL_PLANE" | "EDGE_AGENT";

export interface TrustedCertificatePin {
  nodeId: string;
  role: NodeRole;
  /** SHA-256 fingerprint of the expected certificate (hex) */
  certFingerprint: string;
  allowedSans: string[];
  notAfterMs?: number; // unix ms expiry
}

export interface MtlsValidationResult {
  valid: boolean;
  nodeId?: string;
  role?: NodeRole;
  fingerprint?: string;
  rejectionReason?: string;
}

export interface IMtlsAuthenticatorService {
  validateClientCert(pemCert: string, expectedRole: NodeRole): MtlsValidationResult;
  pinCertificate(pin: TrustedCertificatePin): void;
  revokeCertificate(fingerprint: string): void;
  isRevoked(fingerprint: string): boolean;
  listPins(): TrustedCertificatePin[];
}

export class MtlsAuthenticatorService implements IMtlsAuthenticatorService {
  /** Map of fingerprint -> pin record */
  private pinnedCerts = new Map<string, TrustedCertificatePin>();
  /** Set of revoked certificate fingerprints */
  private revokedFingerprints = new Set<string>();
  /** Minimum acceptable key size in bits */
  private readonly MIN_RSA_KEY_BITS = 2048;

  pinCertificate(pin: TrustedCertificatePin): void {
    this.pinnedCerts.set(pin.certFingerprint.toLowerCase(), pin);
  }

  revokeCertificate(fingerprint: string): void {
    this.revokedFingerprints.add(fingerprint.toLowerCase());
  }

  isRevoked(fingerprint: string): boolean {
    return this.revokedFingerprints.has(fingerprint.toLowerCase());
  }

  listPins(): TrustedCertificatePin[] {
    return Array.from(this.pinnedCerts.values());
  }

  validateClientCert(pemCert: string, expectedRole: NodeRole): MtlsValidationResult {
    let cert: X509Certificate;

    // 1. Parse certificate
    try {
      cert = new X509Certificate(pemCert);
    } catch (err) {
      return {
        valid: false,
        rejectionReason: `Certificate parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 2. Compute SHA-256 fingerprint
    const fingerprint = createHash("sha256")
      .update(cert.raw)
      .digest("hex")
      .toLowerCase();

    // 3. Check revocation list
    if (this.revokedFingerprints.has(fingerprint)) {
      return {
        valid: false,
        fingerprint,
        rejectionReason: "Certificate is on the revocation list",
      };
    }

    // 4. Validate validity window
    const now = Date.now();
    const notBefore = new Date(cert.validFrom).getTime();
    const notAfter = new Date(cert.validTo).getTime();

    if (now < notBefore) {
      return {
        valid: false,
        fingerprint,
        rejectionReason: `Certificate not yet valid — validFrom: ${cert.validFrom}`,
      };
    }
    if (now > notAfter) {
      return {
        valid: false,
        fingerprint,
        rejectionReason: `Certificate expired — validTo: ${cert.validTo}`,
      };
    }

    // 5. Check pinned certificate registry
    const pin = this.pinnedCerts.get(fingerprint);
    if (!pin) {
      return {
        valid: false,
        fingerprint,
        rejectionReason: "Certificate fingerprint not found in trusted pin registry",
      };
    }

    // 6. Validate role matches the pin record
    if (pin.role !== expectedRole) {
      return {
        valid: false,
        fingerprint,
        nodeId: pin.nodeId,
        rejectionReason: `Role mismatch: certificate is pinned as ${pin.role}, but request claims ${expectedRole}`,
      };
    }

    // 7. Validate Subject Alternative Names
    const certSan = cert.subjectAltName || "";
    const sanEntries = certSan.split(",").map((s) => s.trim().replace(/^DNS:|^IP Address:/, ""));
    const sanValid = pin.allowedSans.every((expected) => sanEntries.includes(expected));

    if (!sanValid) {
      return {
        valid: false,
        fingerprint,
        nodeId: pin.nodeId,
        rejectionReason: `SAN mismatch: certificate SANs [${sanEntries.join(", ")}] do not include required [${pin.allowedSans.join(", ")}]`,
      };
    }

    return {
      valid: true,
      nodeId: pin.nodeId,
      role: pin.role,
      fingerprint,
    };
  }
}

export const mtlsAuthenticator = new MtlsAuthenticatorService();
