import { describe, expect, it, vi } from "vitest";
import { RecorderAuthenticationError } from "../../packages/recorder-sdk/src/core/recorder-driver.types.js";
import { ProductionRecorderCredentialResolver } from "../../src/recorders/production-recorder-credential-resolver.js";

describe("ProductionRecorderCredentialResolver", () => {
  it("resolves and decrypts an active tenant-scoped credential", async () => {
    const store = {
      getCurrentDeviceCredential: vi.fn().mockResolvedValue({
        tenantId: "tenant-a",
        username: "operator",
        encryptedSecret: "ciphertext",
        status: "active",
      }),
      getDeviceCredential: vi.fn(),
    };
    const decrypt = vi.fn().mockResolvedValue("secret");
    const resolver = new ProductionRecorderCredentialResolver(store, decrypt);

    await expect(resolver.resolve("device://nvr-1/credential/current", "tenant-a"))
      .resolves.toEqual({ username: "operator", password: "secret" });
    expect(store.getCurrentDeviceCredential).toHaveBeenCalledWith("nvr-1");
    expect(decrypt).toHaveBeenCalledWith("ciphertext");
  });

  it("fails closed for a cross-tenant credential", async () => {
    const resolver = new ProductionRecorderCredentialResolver({
      getCurrentDeviceCredential: vi.fn(),
      getDeviceCredential: vi.fn().mockResolvedValue({
        tenant_id: "tenant-b",
        username: "admin",
        encrypted_secret: "ciphertext",
        status: "active",
      }),
    }, vi.fn().mockResolvedValue("secret"));

    await expect(resolver.resolve("device-credential://cred-1", "tenant-a"))
      .rejects.toBeInstanceOf(RecorderAuthenticationError);
  });

  it("rejects inline and unknown reference formats", async () => {
    const resolver = new ProductionRecorderCredentialResolver({
      getCurrentDeviceCredential: vi.fn(),
      getDeviceCredential: vi.fn(),
    }, vi.fn());

    await expect(resolver.resolve("onvif://admin:password@camera", "tenant-a"))
      .rejects.toThrow("Unsupported opaque recorder credential reference");
  });
});
