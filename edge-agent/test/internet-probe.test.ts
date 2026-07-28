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
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await probeInternetLink({ id: "backup", role: "backup", ispName: "ISP B", targets: ["https://probe.invalid"] },
      { timeoutMs: 500, attempts: 2, counterSampler: new NetworkCounterSampler(), fetcher });
    expect(result).toMatchObject({ connectivity: false, status: "offline", packetLossPercent: 100 });
  });
});
