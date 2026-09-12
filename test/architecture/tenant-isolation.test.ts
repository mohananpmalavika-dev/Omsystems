import { describe, it, expect } from "vitest";
import {
  TenantIsolationGuard,
  CrossTenantAccessForbiddenError,
} from "../../src/security/tenant-isolation.guard.js";

describe("Multi-Tenant Isolation & Cross-Tenant Boundary Security", () => {
  const guard = new TenantIsolationGuard();

  it("permits access when actorTenantId matches targetTenantId", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-alpha",
        resourceType: "CAMERA",
        resourceId: "cam-vault-1",
        actorId: "user-operator-1",
        correlationId: "corr-101",
      })
    ).resolves.not.toThrow();
  });

  it("strictly rejects cross-tenant camera read with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "CAMERA",
        resourceId: "cam-vault-beta-9",
        actorId: "user-alpha-operator",
        correlationId: "corr-102",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant recording access with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "RECORDING",
        resourceId: "rec-seg-beta-99",
        actorId: "user-alpha-operator",
        correlationId: "corr-103",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant incident access with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "INCIDENT",
        resourceId: "inc-vault-breach-beta",
        actorId: "user-alpha-operator",
        correlationId: "corr-104",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant evidence export with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "EVIDENCE",
        resourceId: "ev-package-beta-12",
        actorId: "user-alpha-operator",
        correlationId: "corr-105",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant configuration edit with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "CONFIG",
        resourceId: "edge-beta-config",
        actorId: "user-alpha-admin",
        correlationId: "corr-106",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant user access with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "USER",
        resourceId: "user-beta-soc",
        actorId: "user-alpha-admin",
        correlationId: "corr-107",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });

  it("strictly rejects cross-tenant AI configuration with 403", async () => {
    await expect(
      guard.assertTenantAccess({
        actorTenantId: "bank-alpha",
        targetTenantId: "bank-beta",
        resourceType: "AI",
        resourceId: "ai-model-weights-beta",
        actorId: "user-alpha-admin",
        correlationId: "corr-108",
      })
    ).rejects.toThrow(CrossTenantAccessForbiddenError);
  });
});
