import { describe, expect, it, vi } from "vitest";
import { CloudflareTunnelManager } from "../src/platform/cloudflare-tunnel-manager.js";

describe("Cloudflare managed tunnel lifecycle", () => {
  it("creates remote ingress and DNS, retrieves status, and revokes cleanly", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init: init ?? {} });
      if (url.includes("/dns_records?")) return api([{ id: "dns-record-1" }]);
      if (url.endsWith("/token")) return api("eyJ-cloudflare-connector-token-long-enough");
      if (url.endsWith("/cfd_tunnel") && init?.method === "POST") {
        return api({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "inactive" });
      }
      if (url.endsWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") && init?.method === "GET") {
        return api({ status: "healthy" });
      }
      return api({ id: "ok" });
    });
    const manager = new CloudflareTunnelManager({
      accountId: "a".repeat(32),
      zoneId: "b".repeat(32),
      apiToken: "cloudflare-api-token-secret",
      mediaBaseDomain: "media.example.com",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const tunnel = await manager.provision({ branchId: "branch-blr-001", branchName: "Bengaluru Main" });
    expect(tunnel).toEqual({
      provider: "cloudflare",
      providerTunnelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      hostname: "bengaluru-main-branchblr0.media.example.com",
      status: "inactive",
    });
    expect(await manager.getToken(tunnel.providerTunnelId)).toContain("connector-token");
    expect(await manager.getStatus(tunnel.providerTunnelId)).toBe("healthy");
    await manager.revoke(tunnel.providerTunnelId, tunnel.hostname);

    expect(requests.some((item) => item.url.endsWith("/configurations") && item.init.method === "PUT")).toBe(true);
    expect(requests.some((item) => item.url.includes("/dns_records") && item.init.method === "POST")).toBe(true);
    expect(requests.every((item) => (item.init.headers as Record<string, string>).authorization === "Bearer cloudflare-api-token-secret")).toBe(true);
  });
});

function api(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
