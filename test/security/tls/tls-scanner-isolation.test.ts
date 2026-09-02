import { describe, it, expect } from "vitest";
import { TlsScannerPolicy, defaultTlsScannerPolicy } from "../../../src/security/tls/tls-scanner-policy.js";
import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

describe("TLS Scanner Isolation & SSRF Policy Tests", () => {
  it("strictly blocks cloud metadata endpoint (169.254.169.254) from being scanned", () => {
    const check = defaultTlsScannerPolicy.isTargetAllowed("169.254.169.254", 443);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("restricted loopback or cloud metadata destination");

    expect(() => {
      defaultTlsScannerPolicy.assertTargetAllowed("169.254.169.254", 443);
    }).toThrow(SecurityConfigurationError);
  });

  it("strictly blocks loopback destinations (127.0.0.1, localhost) from public scanner", () => {
    expect(defaultTlsScannerPolicy.isTargetAllowed("127.0.0.1", 443).allowed).toBe(false);
    expect(defaultTlsScannerPolicy.isTargetAllowed("localhost", 443).allowed).toBe(false);
  });

  it("blocks non-standard / unauthorized scan ports", () => {
    // Port 22 (SSH), Port 25 (SMTP), Port 3389 (RDP)
    expect(defaultTlsScannerPolicy.isTargetAllowed("10.0.0.50", 22).allowed).toBe(false);
    expect(defaultTlsScannerPolicy.isTargetAllowed("10.0.0.50", 25).allowed).toBe(false);
  });

  it("permits authorized camera / NVR ports on internal subnets", () => {
    // Standard HTTPS / RTSP / ONVIF ports (443, 8443, 554, 8000)
    expect(defaultTlsScannerPolicy.isTargetAllowed("10.1.20.15", 443).allowed).toBe(true);
    expect(defaultTlsScannerPolicy.isTargetAllowed("192.168.1.100", 8443).allowed).toBe(true);
    expect(defaultTlsScannerPolicy.isTargetAllowed("10.1.20.15", 554).allowed).toBe(true);
  });
});
