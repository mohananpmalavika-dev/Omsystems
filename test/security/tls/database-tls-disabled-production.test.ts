import { describe, it, expect } from "vitest";
import {
  createDatabaseTlsConfig,
  validateDatabaseSecurityConfiguration,
} from "../../../src/security/tls/database-tls-config.js";
import {
  validateGlobalTlsConfiguration,
} from "../../../src/security/tls/startup-security-guard.js";
import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

describe("Production PostgreSQL TLS & Startup Security Guard Tests", () => {
  it("strictly throws SecurityConfigurationError when DATABASE_TLS_MODE is DISABLED in production", () => {
    expect(() => {
      createDatabaseTlsConfig({
        isProduction: true,
        mode: "DISABLED",
      });
    }).toThrow(SecurityConfigurationError);
  });

  it("strictly throws SecurityConfigurationError when rejectUnauthorized: false is attempted in production", () => {
    expect(() => {
      createDatabaseTlsConfig({
        isProduction: true,
        rejectUnauthorized: false,
      });
    }).toThrow(SecurityConfigurationError);
  });

  it("throws SecurityConfigurationError when global bypass NODE_TLS_REJECT_UNAUTHORIZED=0 is set in production", () => {
    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      expect(() => {
        validateGlobalTlsConfiguration(true);
      }).toThrow(SecurityConfigurationError);
    } finally {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = original;
    }
  });

  it("validates database security config successfully in production when verified TLS is active", () => {
    const ssl = createDatabaseTlsConfig({
      isProduction: true,
      mode: "VERIFY_CA",
      ca: "-----BEGIN CERTIFICATE-----\nMIIB...test...\n-----END CERTIFICATE-----",
    });

    expect(typeof ssl).toBe("object");
    expect((ssl as any).rejectUnauthorized).toBe(true);

    expect(() => {
      validateDatabaseSecurityConfiguration({
        isProduction: true,
        ssl,
        databaseUrl: "postgresql://user:pass@postgres.service.internal:5432/sentinel",
      });
    }).not.toThrow();
  });
});
