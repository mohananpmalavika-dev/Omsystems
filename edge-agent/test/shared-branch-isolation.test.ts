import { describe, expect, it, vi } from "vitest";
import { assertNonOverlappingBranches, hostInNetworks, normalizeVpnNetwork } from "../src/discovery/branch-network-scope.js";
import { DatabaseCredentialProvider } from "../src/security/database-credential-provider.js";
import { CameraHeartbeatService } from "../src/monitoring/camera-heartbeat.js";

describe("shared agent branch isolation", () => {
  it("canonicalizes private networks and checks their boundaries", () => {
    expect(normalizeVpnNetwork("10.21.4.42/24")).toBe("10.21.4.0/24");
    expect(normalizeVpnNetwork("172.20.5.10")).toBe("172.20.5.10/32");
    expect(hostInNetworks("10.21.4.255", ["10.21.4.0/24"])).toBe(true);
    expect(hostInNetworks("10.21.5.0", ["10.21.4.0/24"])).toBe(false);
    expect(hostInNetworks("camera.example", ["10.21.4.0/24"])).toBe(false);
    expect(() => normalizeVpnNetwork("192.168.0.1/15")).toThrow();
    expect(() => assertNonOverlappingBranches([{ branchId: "a", vpnNetworks: ["10.21.4.0/24"] }, { branchId: "b", vpnNetworks: ["10.21.4.100/32"] }])).toThrow("overlapping_branch_networks");
    expect(() => assertNonOverlappingBranches([{ branchId: "a", vpnNetworks: ["10.21.4.0/24", "10.21.4.1/32"] }, { branchId: "b", vpnNetworks: ["10.21.4.100/32"] }])).toThrow("overlapping_branch_networks");
    expect(() => assertNonOverlappingBranches([{ branchId: "a", vpnNetworks: ["10.21.4.0/24", "10.21.4.1/32"] }, { branchId: "b", vpnNetworks: ["10.21.5.0/24"] }])).not.toThrow();
  });

  it("keeps branch credential caches and VPN targets independent", async () => {
    const getDiscoveryBootstrap = vi.fn(async (_agentId: string, branchId?: string) => ({
      credentials: [{ host: "10.21.4.10", username: branchId!, password: `${branchId}-secret`, updatedAt: new Date().toISOString() }],
      vpnScanNetworks: branchId === "a" ? ["10.21.4.0/24"] : ["10.21.5.0/24"],
    }));
    const a = new DatabaseCredentialProvider({ getDiscoveryBootstrap }, "shared", "a");
    const b = new DatabaseCredentialProvider({ getDiscoveryBootstrap }, "shared", "b");
    expect((await a.get("10.21.4.10"))?.username).toBe("a");
    expect((await b.get("10.21.4.10"))?.username).toBe("b");
    expect(await b.getVpnScanNetworks()).toEqual(["10.21.5.0/24"]);
    a.invalidate();
    expect((await b.get("10.21.4.10"))?.username).toBe("b");
    expect(getDiscoveryBootstrap).toHaveBeenCalledTimes(2);
    expect(getDiscoveryBootstrap).toHaveBeenCalledWith("shared", "a");
    expect(getDiscoveryBootstrap).toHaveBeenCalledWith("shared", "b");
  });

  it("attributes camera telemetry to its remote branch while legacy cameras keep the home branch", async () => {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const service = new CameraHeartbeatService("https://control.example", "home", "shared", undefined, "ffprobe", "ffmpeg", undefined, send);
    service.replaceCameras([{ id: "remote", name: "remote", branchId: "b", enabled: true }, { id: "legacy", name: "legacy", enabled: true }]);
    for (const cameraId of ["remote", "legacy"]) await (service as any).sendToPlatform(cameraId, { cameraId, status: "offline", streamActive: false, quality: "verified", reasonCodes: ["rtsp_unreachable"] });
    expect(send.mock.calls[0]?.[0]).toMatchObject({ branchId: "b", deviceId: "remote" });
    expect(send.mock.calls[1]?.[0]).toMatchObject({ branchId: "home", deviceId: "legacy" });
  });
});
