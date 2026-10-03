import { describe, expect, it, vi } from "vitest";

const attemptedHosts = vi.hoisted(() => [] as string[]);
vi.mock("node:net", async importOriginal => {
  const actual = await importOriginal<typeof import("node:net")>();
  class OfflineSocket {
    private handlers = new Map<string, () => void>();
    setTimeout() { return this; }
    once(event: string, handler: () => void) { this.handlers.set(event, handler); return this; }
    destroy() {}
    connect(_port: number, host: string) {
      attemptedHosts.push(host);
      queueMicrotask(() => this.handlers.get("error")?.());
      return this;
    }
  }
  return { ...actual, default: { ...actual, Socket: OfflineSocket } };
});
vi.mock("node:os", async importOriginal => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, default: { ...actual, networkInterfaces: () => ({ Ethernet: [{ family: "IPv4", internal: false, address: "192.168.50.2", cidr: "192.168.50.2/24" }] }) } };
});
vi.mock("../src/discovery/network-neighbor.js", () => ({ detectDefaultGatewayIps: async () => [], resolveNeighborMac: async () => undefined }));

import { discoverRtspDevices } from "../src/discovery/rtsp-network-scan.js";

describe("VPN branch discovery", () => {
  it("probes only assigned VPN hosts even when the HO agent has another local LAN", async () => {
    const submitDiscovery = vi.fn();
    const result = await discoverRtspDevices("remote-branch", "ho-agent", {
      cidrs: ["10.50.1.10/32"], configuredNetworksOnly: true,
      ports: [554], recorderHttpPorts: [80], paths: [], ffprobePath: "unused",
      timeoutMs: 100, concurrency: 1, username: "", password: "",
    }, { submitDiscovery }, undefined);
    expect(result).toBe(0);
    expect(new Set(attemptedHosts)).toEqual(new Set(["10.50.1.10"]));
    expect(submitDiscovery).not.toHaveBeenCalled();
  });

  it("excludes remote branch addresses from an automatically inferred HO subnet", async () => {
    attemptedHosts.length = 0;
    await discoverRtspDevices("home", "ho-agent", {
      excludeNetworks: ["192.168.50.0/24"], ports: [554], recorderHttpPorts: [],
      paths: [], ffprobePath: "unused", timeoutMs: 100, concurrency: 1, username: "", password: "",
    }, { submitDiscovery: vi.fn() }, undefined);
    expect(attemptedHosts).toEqual([]);
  });
});
