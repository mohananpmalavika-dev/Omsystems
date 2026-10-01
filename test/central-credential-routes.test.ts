import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("central credential transport", () => {
  it("accepts only the enrolled edge identity and resolves only for the media gateway", async () => {
    const store = new MemoryStore() as MemoryStore & {
      upsertStreamSecrets: ReturnType<typeof vi.fn>;
      resolveStreamSecret: ReturnType<typeof vi.fn>;
    };
    const agentId = "6bc25741-faa1-4249-9c21-20825172cc99";
    const edgeToken = "edge-secret-token-for-test";
    (store as any).edgeAgents.set(agentId, {
      id: agentId, branchId: "branch-test", status: "online", credentialStatus: "active",
      name: "Branch gateway", version: "1.0.0", lastSeenAt: new Date().toISOString(),
    });
    (store as any).edgeCredentialHashes.set(agentId, createHash("sha256").update(edgeToken).digest("hex"));
    store.upsertStreamSecrets = vi.fn(async () => 1);
    store.resolveStreamSecret = vi.fn(async () => "rtsp://operator:password@192.168.1.20/live");
    const app = await buildApp({ logger: false, store, mediaGatewaySharedKey: "media-test-secret" });
    const url = `/v1/edge-agents/${agentId}/stream-secrets`;
    const payload = { secrets: [{ reference: `edge://${agentId}/camera-1`,
      sourceUri: "rtsp://operator:password@192.168.1.20/live" }] };
    try {
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url,
        headers: { "x-edge-agent-token": "wrong-token" }, payload })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url,
        headers: { "x-edge-agent-token": edgeToken }, payload })).statusCode).toBe(200);
      expect(store.upsertStreamSecrets).toHaveBeenCalledWith(agentId, payload.secrets, true);
      expect((await app.inject({ method: "POST", url,
        headers: { "x-edge-agent-token": edgeToken },
        payload: { ...payload, overwrite: false } })).statusCode).toBe(200);
      expect(store.upsertStreamSecrets).toHaveBeenLastCalledWith(agentId, payload.secrets, false);
      const resolveUrl = `/v1/secrets/resolve?ref=${encodeURIComponent(payload.secrets[0]!.reference)}`;
      expect((await app.inject({ method: "GET", url: resolveUrl })).statusCode).toBe(401);
      const resolved = await app.inject({ method: "GET", url: resolveUrl,
        headers: { "x-media-gateway-key": "media-test-secret" } });
      expect(resolved.statusCode).toBe(200);
      expect(resolved.json()).toEqual({ sourceUri: payload.secrets[0]!.sourceUri });
      expect(resolved.headers["cache-control"]).toBe("no-store");
      const edgeResolveUrl = `${url}/resolve?ref=${encodeURIComponent(payload.secrets[0]!.reference)}`;
      expect((await app.inject({ method: "GET", url: edgeResolveUrl })).statusCode).toBe(401);
      const edgeResolved = await app.inject({ method: "GET", url: edgeResolveUrl,
        headers: { "x-edge-agent-token": edgeToken } });
      expect(edgeResolved.statusCode).toBe(200);
      expect(edgeResolved.json()).toEqual({ sourceUri: payload.secrets[0]!.sourceUri });
      expect(store.resolveStreamSecret).toHaveBeenCalledWith(payload.secrets[0]!.reference, agentId);
      const outsideRef = `edge://different-agent/camera-1`;
      expect((await app.inject({ method: "GET", url: `${url}/resolve?ref=${encodeURIComponent(outsideRef)}`,
        headers: { "x-edge-agent-token": edgeToken } })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  }, 20_000);
});
