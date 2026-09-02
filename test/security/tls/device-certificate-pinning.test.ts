import { describe, it, expect } from "vitest";
import { DeviceCertificateTrustManager } from "../../../src/security/tls/device-certificate-trust.js";
import { DeviceCertificateUntrustedError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

describe("Device Certificate Trust & Fingerprint Pinning Tests", () => {
  it("trusts public / enterprise CA signed device certificates (state: TRUSTED)", () => {
    const manager = new DeviceCertificateTrustManager();
    const result = manager.verifyCertificate("cam-01", {
      authorized: true,
      validTo: new Date(Date.now() + 86400000 * 100),
    });

    expect(result.state).toBe("TRUSTED");
    expect(() => manager.assertDeviceTrusted("cam-01", { authorized: true })).not.toThrow();
  });

  it("permits self-signed camera certificates when administrator has pinned the SHA-256 fingerprint", () => {
    const manager = new DeviceCertificateTrustManager();
    const sampleFingerprint = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    manager.pinCertificate({
      deviceId: "cam-lobby-selfsigned",
      algorithm: "sha256",
      fingerprint: sampleFingerprint,
      approvedAt: new Date().toISOString(),
      approvedBy: "admin-security-officer",
    });

    const result = manager.verifyCertificate("cam-lobby-selfsigned", {
      authorized: false,
      selfSigned: true,
      fingerprint: sampleFingerprint,
      validTo: new Date(Date.now() + 86400000 * 30),
    });

    expect(result.state).toBe("PINNED");
    expect(() => manager.assertDeviceTrusted("cam-lobby-selfsigned", {
      fingerprint: sampleFingerprint,
      validTo: new Date(Date.now() + 86400000 * 30),
    })).not.toThrow();
  });

  it("strictly REJECTS unpinned self-signed camera certificates (state: SELF_SIGNED_UNAPPROVED)", () => {
    const manager = new DeviceCertificateTrustManager();
    const untrustedFingerprint = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff";

    const result = manager.verifyCertificate("cam-unapproved", {
      authorized: false,
      selfSigned: true,
      fingerprint: untrustedFingerprint,
      validTo: new Date(Date.now() + 86400000 * 30),
    });

    expect(result.state).toBe("SELF_SIGNED_UNAPPROVED");
    expect(() => manager.assertDeviceTrusted("cam-unapproved", {
      fingerprint: untrustedFingerprint,
      selfSigned: true,
    })).toThrow(DeviceCertificateUntrustedError);
  });

  it("strictly REJECTS expired device certificates (state: EXPIRED)", () => {
    const manager = new DeviceCertificateTrustManager();
    const result = manager.verifyCertificate("cam-expired", {
      validTo: new Date(Date.now() - 86400000), // Expired yesterday
      fingerprint: "abc123",
    });

    expect(result.state).toBe("EXPIRED");
    expect(() => manager.assertDeviceTrusted("cam-expired", {
      validTo: new Date(Date.now() - 86400000),
    })).toThrow(DeviceCertificateUntrustedError);
  });
});
