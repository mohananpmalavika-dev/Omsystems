import { describe, expect, it, vi } from "vitest";
import { RecorderManager } from "../../packages/recorder-sdk/src/core/recorder-manager.js";
import type { RecorderContext } from "../../packages/recorder-sdk/src/core/recorder-driver.types.js";

const ctx: RecorderContext = {
  tenantId: "tenant-a",
  branchId: "branch-a",
  recorderId: "recorder-a",
  endpoint: { host: "127.0.0.1", port: 1, scheme: "http", baseUrl: "http://127.0.0.1:1" },
  credentialRef: { ref: "device://recorder-a/credential/current", type: "digest" },
  protocol: "hikvision-isapi",
  timeoutMs: 1,
};

describe("RecorderManager credential wiring", () => {
  it("invokes the configured resolver before recorder I/O", async () => {
    const resolver = { resolve: vi.fn().mockRejectedValue(new Error("resolver-called")) };
    const manager = new RecorderManager({ credentialResolver: resolver });
    const driver = (await manager.resolveDriver("hikvision")).driver;

    await expect(driver.getDeviceInfo(ctx)).rejects.toThrow("resolver-called");
    expect(resolver.resolve).toHaveBeenCalledWith(ctx.credentialRef.ref, ctx.tenantId);
  });

  it("fails closed when no credential resolver is configured", async () => {
    const manager = new RecorderManager();
    const driver = (await manager.resolveDriver("dahua")).driver;

    await expect(driver.getDeviceInfo({ ...ctx, protocol: "dahua-cgi" }))
      .rejects.toThrow("Credential resolver is not configured");
  });
});
