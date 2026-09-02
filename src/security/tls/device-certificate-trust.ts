/**
 * Device Certificate Trust & Fingerprint Pinning Manager
 * 
 * Manages certificate pinning and explicit trust states for legacy cameras,
 * NVRs, and intercoms that use self-signed or vendor-issued certificates.
 */

import { createHash } from "node:crypto";
import type {
  DeviceCertificateFingerprint,
  DeviceTlsTrustState,
} from "../../../packages/contracts/src/security/tls/tls-types.js";
import { DeviceCertificateUntrustedError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

export class DeviceCertificateTrustManager {
  private pinnedFingerprints: Map<string, DeviceCertificateFingerprint> = new Map();

  pinCertificate(entry: DeviceCertificateFingerprint): void {
    this.pinnedFingerprints.set(entry.deviceId, {
      ...entry,
      fingerprint: entry.fingerprint.toLowerCase().replace(/[^a-f0-9]/g, ""),
    });
  }

  getPinnedCertificate(deviceId: string): DeviceCertificateFingerprint | undefined {
    return this.pinnedFingerprints.get(deviceId);
  }

  revokePin(deviceId: string): boolean {
    return this.pinnedFingerprints.delete(deviceId);
  }

  calculateFingerprint(certBufferOrDer: Buffer | string): string {
    const buf = typeof certBufferOrDer === "string"
      ? Buffer.from(certBufferOrDer.replace(/-----[^\n]+-----/g, "").replace(/\s+/g, ""), "base64")
      : certBufferOrDer;
    return createHash("sha256").update(buf).digest("hex");
  }

  verifyCertificate(
    deviceId: string,
    certInfo: {
      raw?: Buffer | string;
      fingerprint?: string;
      validTo?: Date | string;
      validFrom?: Date | string;
      authorized?: boolean;
      selfSigned?: boolean;
    },
  ): {
    state: DeviceTlsTrustState;
    fingerprint: string;
    message?: string;
  } {
    const fingerprint = certInfo.fingerprint
      ? certInfo.fingerprint.toLowerCase().replace(/[^a-f0-9]/g, "")
      : certInfo.raw
      ? this.calculateFingerprint(certInfo.raw)
      : "";

    // 1. Expiry Check
    if (certInfo.validTo) {
      const expiry = new Date(certInfo.validTo).getTime();
      if (Date.now() > expiry) {
        return {
          state: "EXPIRED",
          fingerprint,
          message: `Device certificate expired on ${new Date(certInfo.validTo).toISOString()}`,
        };
      }
    }

    // 2. Public / Enterprise CA Trusted
    if (certInfo.authorized) {
      return { state: "TRUSTED", fingerprint };
    }

    // 3. Pinned Certificate Check
    const pinned = this.pinnedFingerprints.get(deviceId);
    if (pinned && pinned.fingerprint === fingerprint) {
      return { state: "PINNED", fingerprint };
    }

    // 4. Untrusted / Self-Signed Unapproved
    if (certInfo.selfSigned || !certInfo.authorized) {
      return {
        state: "SELF_SIGNED_UNAPPROVED",
        fingerprint,
        message: `Device certificate (SHA256: ${fingerprint}) is self-signed and has not been approved/pinned by an administrator.`,
      };
    }

    return { state: "UNKNOWN", fingerprint };
  }

  assertDeviceTrusted(
    deviceId: string,
    certInfo: {
      raw?: Buffer | string;
      fingerprint?: string;
      validTo?: Date | string;
      validFrom?: Date | string;
      authorized?: boolean;
      selfSigned?: boolean;
    },
  ): void {
    const result = this.verifyCertificate(deviceId, certInfo);
    if (result.state !== "TRUSTED" && result.state !== "PINNED") {
      throw new DeviceCertificateUntrustedError(
        deviceId,
        result.fingerprint,
        result.state,
        result.message,
      );
    }
  }
}

export const deviceCertificateTrustManager = new DeviceCertificateTrustManager();
