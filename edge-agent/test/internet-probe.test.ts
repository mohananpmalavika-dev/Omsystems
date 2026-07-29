import { describe, expect, it, vi } from "vitest";
import { NetworkCounterSampler, probeInternetLink } from "../src/monitoring/internet-probe.js";

describe("branch internet probe", () => {
  it("calculates packet loss and marks a partially reachable ISP link degraded", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("unreachable"))
      .mockResolvedValueOnce(new Response("ok"));
    const result = await probeInternetLink({
      id: "primary", role: "primary", ispName: "ISP A",
      targets: ["https://probe-one.invalid", "https://probe-two.invalid"],
    }, { timeoutMs: 500, attempts: 2, counterSampler: new NetworkCounterSampler(), fetcher });
    expect(result.connectivity).toBe(true);
    expect(result.packetLossPercent).toBe(50);
    expect(result.status).toBe("degraded");
    expect(result.reasonCodes).toContain("internet_packet_loss_high");
  });

  it("detects a complete internet outage", async () => {
    const boundProber = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await probeInternetLink({
      id: "backup", role: "backup", ispName: "ISP B", sourceAddress: "192.0.2.10", targets: ["https://probe.invalid"],
    }, { timeoutMs: 500, attempts: 2, counterSampler: new NetworkCounterSampler(), boundProber });
    expect(result).toMatchObject({ connectivity: false, status: "offline", packetLossPercent: 100 });
  });

  it("does not claim an unbound backup probe is a verified backup link", async () => {
    const result = await probeInternetLink({ id: "backup", role: "backup", ispName: "ISP B", targets: ["https://probe.invalid"] }, {
      timeoutMs: 500, attempts: 1, counterSampler: new NetworkCounterSampler(),
      fetcher: vi.fn().mockResolvedValue(new Response("ok")),
    });
    expect(result).toMatchObject({ connectivity: true, status: "unknown", routeVerified: false, probeBinding: "unbound" });
    expect(result.reasonCodes).toContain("backup_route_binding_not_configured");
  });

  it("uses the configured source address for a link-bound reachability probe", async () => {
    const boundProber = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn();
    const result = await probeInternetLink({
      id: "backup", role: "backup", ispName: "ISP B", sourceAddress: "192.0.2.10", targets: ["https://probe.invalid"],
    }, { timeoutMs: 500, attempts: 1, counterSampler: new NetworkCounterSampler(), fetcher, boundProber });
    expect(result).toMatchObject({ connectivity: true, status: "online", routeVerified: true, probeBinding: "source-address" });
    expect(boundProber).toHaveBeenCalledWith("https://probe.invalid", "192.0.2.10", 500);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a bound link unknown when the binding helper is unavailable", async () => {
    const unavailable = Object.assign(new Error("curl unavailable"), { code: "ENOENT" });
    const result = await probeInternetLink({
      id: "backup", role: "backup", ispName: "ISP B", sourceAddress: "192.0.2.10", targets: ["https://probe.invalid"],
    }, { timeoutMs: 500, attempts: 1, counterSampler: new NetworkCounterSampler(), boundProber: vi.fn().mockRejectedValue(unavailable) });
    expect(result).toMatchObject({ connectivity: false, status: "unknown", routeVerified: false });
    expect(result.reasonCodes).toContain("link_binding_probe_unavailable");
  });
});
