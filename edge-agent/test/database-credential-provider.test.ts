import { describe, expect, it, vi } from "vitest";
import { DatabaseCredentialProvider } from "../src/security/database-credential-provider.js";

describe("DatabaseCredentialProvider", () => {
  it("loads branch credentials and VPN ranges from the authenticated control plane", async () => {
    const getDiscoveryBootstrap = vi.fn(async () => ({
      credentials: [
        { host: "10.42.5.20", username: "host-user", password: "host-password", updatedAt: "2026-08-08T00:00:00.000Z" },
        { username: "default-user", password: "default-password", updatedAt: "2026-08-08T00:00:00.000Z" },
      ],
      vpnScanNetworks: ["10.42.5.0/24"],
    }));
    const provider = new DatabaseCredentialProvider({ getDiscoveryBootstrap }, "edge-001");

    await expect(provider.get("10.42.5.20")).resolves.toMatchObject({ username: "host-user" });
    await expect(provider.get("10.42.5.21")).resolves.toMatchObject({ username: "default-user" });
    await expect(provider.getKnownHosts()).resolves.toEqual(["10.42.5.20"]);
    await expect(provider.getVpnScanNetworks()).resolves.toEqual(["10.42.5.0/24"]);
    expect(getDiscoveryBootstrap).toHaveBeenCalledTimes(1);
    expect(getDiscoveryBootstrap).toHaveBeenCalledWith("edge-001");
  });

  it("refreshes credentials immediately after activation invalidates the cache", async () => {
    const getDiscoveryBootstrap = vi.fn()
      .mockResolvedValueOnce({
        credentials: [{ host: "10.42.5.20", username: "old-user", password: "old-password", updatedAt: "2026-08-08T00:00:00.000Z" }],
        vpnScanNetworks: [],
      })
      .mockResolvedValueOnce({
        credentials: [{ host: "10.42.5.20", username: "new-user", password: "new-password", updatedAt: "2026-08-08T00:01:00.000Z" }],
        vpnScanNetworks: [],
      });
    const provider = new DatabaseCredentialProvider({ getDiscoveryBootstrap }, "edge-001");

    await expect(provider.get("10.42.5.20")).resolves.toMatchObject({ username: "old-user" });
    provider.invalidate();
    await expect(provider.get("10.42.5.20")).resolves.toMatchObject({ username: "new-user" });
    expect(getDiscoveryBootstrap).toHaveBeenCalledTimes(2);
  });
});
