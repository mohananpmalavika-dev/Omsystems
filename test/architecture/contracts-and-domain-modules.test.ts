import { describe, it, expect } from "vitest";
import { validateEventEnvelope } from "../../packages/contracts/src/domains/index.js";
import { ApplicationBootstrap } from "../../src/bootstrap/index.js";

describe("Shared Contracts & Domain Bootstrap Modules", () => {
  it("validates event envelope contracts and catches missing mandatory fields", () => {
    const validEnvelope = {
      schemaVersion: "1.0.0",
      eventId: "ev-12345",
      timestamp: new Date().toISOString(),
      tenantId: "bank-alpha",
      correlationId: "corr-99",
      payload: { camera: "cam-1" },
    };

    expect(() => validateEventEnvelope(validEnvelope)).not.toThrow();

    // Missing schemaVersion
    expect(() =>
      validateEventEnvelope({
        ...validEnvelope,
        schemaVersion: "",
      })
    ).toThrow("missing or invalid schemaVersion");

    // Missing tenantId
    expect(() =>
      validateEventEnvelope({
        ...validEnvelope,
        tenantId: "",
      })
    ).toThrow("missing or invalid tenantId");
  });

  it("coordinates application bootstrap across domain modules", async () => {
    const bootstrap = new ApplicationBootstrap();
    await bootstrap.bootstrap();

    const readiness = bootstrap.getReadiness();
    expect(readiness).toBeDefined();
    expect(readiness.modules).toBeDefined();

    await bootstrap.shutdown();
  });
});
