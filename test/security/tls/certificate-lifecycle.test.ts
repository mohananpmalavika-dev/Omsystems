import { describe, it, expect } from "vitest";
import { CertificateManager } from "../../../src/security/tls/certificate-manager.js";
import type { CertificateStatus } from "../../../packages/contracts/src/security/tls/tls-types.js";

describe("Certificate Lifecycle & Expiry Monitoring Tests", () => {
  it("evaluates expiry alerts appropriately based on days remaining", () => {
    const expiredCert: CertificateStatus = {
      subject: "CN=postgres.service.internal",
      issuer: "CN=Sentinel-Root-CA",
      validFrom: new Date(Date.now() - 86400000 * 365).toISOString(),
      validTo: new Date(Date.now() - 86400000 * 2).toISOString(),
      daysRemaining: -2,
      fingerprintSha256: "deadbeef1234",
      state: "EXPIRED",
    };

    const alert1 = CertificateManager.evaluateExpiryAlert(expiredCert);
    expect(alert1.shouldAlert).toBe(true);
    expect(alert1.level).toBe("CRITICAL");
    expect(alert1.message).toContain("EXPIRED");

    const criticalExpiringCert: CertificateStatus = {
      ...expiredCert,
      daysRemaining: 4,
      state: "EXPIRING",
    };
    const alert2 = CertificateManager.evaluateExpiryAlert(criticalExpiringCert);
    expect(alert2.shouldAlert).toBe(true);
    expect(alert2.level).toBe("CRITICAL");
    expect(alert2.message).toContain("expires in 4 days");

    const warningCert: CertificateStatus = {
      ...expiredCert,
      daysRemaining: 20,
      state: "EXPIRING",
    };
    const alert3 = CertificateManager.evaluateExpiryAlert(warningCert);
    expect(alert3.shouldAlert).toBe(true);
    expect(alert3.level).toBe("WARNING");

    const healthyCert: CertificateStatus = {
      ...expiredCert,
      daysRemaining: 180,
      state: "VALID",
    };
    const alert4 = CertificateManager.evaluateExpiryAlert(healthyCert);
    expect(alert4.shouldAlert).toBe(false);
  });
});
