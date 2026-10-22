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

  it("allows direct IP probe targets within a branch's own assigned networks and rejects other branch networks", () => {
    const branchId = "525198ad-504d-48af-ac6c-dca057d38ed5";
    const branchBootstrap = {
      vpnScanNetworks: ["192.168.1.45/32", "192.168.1.0/24"],
      branchAssignments: [
        { branchId: "525198ad-504d-48af-ac6c-dca057d38ed5", vpnNetworks: ["192.168.1.45/32", "192.168.1.0/24"] },
        { branchId: "other-branch-id", vpnNetworks: ["10.20.0.0/24"] },
      ],
    };
    const isRemoteBranch = false;
    const branchNetworks = branchBootstrap?.vpnScanNetworks ?? [];
    const excludedBranchNetworks = (branchBootstrap?.branchAssignments ?? [])
      .filter(a => a.branchId !== branchId)
      .flatMap(a => a.vpnNetworks);
    const belongsToThisBranch = (host: string, target?: boolean) => {
      if (branchNetworks.length > 0 && hostInNetworks(host, branchNetworks)) return true;
      if (target && !hostInNetworks(host, excludedBranchNetworks)) return true;
      if (isRemoteBranch) return false;
      return !hostInNetworks(host, excludedBranchNetworks);
    };

    // The probe target is the branch's own IP
    expect(belongsToThisBranch("192.168.1.45", true)).toBe(true);
    // Subnet host in the branch's network
    expect(belongsToThisBranch("192.168.1.50", true)).toBe(true);
    // An IP belonging to a DIFFERENT branch's assigned networks must be rejected
    expect(belongsToThisBranch("10.20.0.15", true)).toBe(false);
  });
});
