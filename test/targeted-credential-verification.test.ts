import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const headers = { "x-user-id": "user-global-admin" };
const testTenantId = "00000000-0000-4000-8000-000000000001";

function addTestBranch(store: MemoryStore) {
  store.nodes.set("branch-blr-001", {
    id: "branch-blr-001",
    tenantId: testTenantId,
    type: "branch",
    name: "Credential verification test branch",
    path: ["branch-blr-001"],
  } as any);
}

function credentialPool() {
  const client = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => client),
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    client,
  };
}

async function addDiscovery(store: MemoryStore, edgeAgentId: string, ipAddress: string) {
  return store.createDiscovery("branch-blr-001", {
    edgeAgentId,
    discoveryMethod: "onvif-ws-discovery",
    vendor: "other",
    manufacturer: "Camera vendor",
    model: `Camera ${ipAddress}`,
    ipAddress,
    onvifPort: 80,
    rtspPort: 554,
    credentialsRequired: true,
    streamVerified: false,
    rtspValidated: false,
    compatibilityStatus: "review-required",
    duplicateStatus: "unique",
    profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
    capabilities: { ptz: false, audio: false, events: false },
  });
}

describe("targeted credential verification", () => {
  it("queues and returns only a single-device scan job", async () => {
    const store = new MemoryStore() as MemoryStore & { pool: ReturnType<typeof credentialPool> };
    store.pool = credentialPool();
    addTestBranch(store);
    const app = await buildApp({ logger: false, store });
    const agent = await store.registerEdgeAgent("branch-blr-001", "Targeted scanner", "0.1.7");
    await store.heartbeatEdgeAgent(agent.id, "0.1.7");
    const selected = await addDiscovery(store, agent.id, "192.168.29.171");
    await addDiscovery(store, agent.id, "192.168.29.46");
    const activated = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${selected.id}/activate`,
      headers,
      payload: { username: "admin", password: "correct horse battery staple" },
    });

    expect(activated.statusCode).toBe(202);
    expect(activated.json()).toMatchObject({
      scope: "device",
      targetDiscoveryId: selected.id,
    });
    expect(store.pool.client.query).toHaveBeenCalledWith(
      expect.stringContaining("credentials_status = 'pending_verification'"),
      [selected.id, "branch-blr-001"],
    );
    expect(store.pool.client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("stream_verified = true"),
      expect.anything(),
    );
    const claimed = await store.claimEdgeScanJob(agent.id);
    expect(claimed).toMatchObject({
      scope: "device",
      targetDiscoveryId: selected.id,
      targetIpAddress: "192.168.29.171",
      targetOnvifPort: 80,
    });
    expect(await store.getLatestEdgeScanJob("branch-blr-001")).toBeUndefined();

    const results = await app.inject({
      method: "GET",
      url: `/v1/device-scans/${claimed!.id}/results?branchId=branch-blr-001`,
      headers,
    });
    expect(results.statusCode).toBe(200);
    expect(results.json().data).toHaveLength(1);
    expect(results.json().data[0].ipAddress).toBe("192.168.29.171");

    await app.close();
  }, 20_000);

  it("fails safely instead of letting an older scanner run a branch scan", async () => {
    const store = new MemoryStore() as MemoryStore & { pool: ReturnType<typeof credentialPool> };
    store.pool = credentialPool();
    addTestBranch(store);
    const app = await buildApp({ logger: false, store });
    const agent = await store.registerEdgeAgent("branch-blr-001", "Older scanner", "0.1.6");
    await store.heartbeatEdgeAgent(agent.id, "0.1.6");
    const selected = await addDiscovery(store, agent.id, "192.168.29.171");
    const activated = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${selected.id}/activate`,
      headers,
      payload: { username: "admin", password: "password" },
    });

    expect(activated.statusCode).toBe(409);
    expect(activated.json()).toMatchObject({
      error: "edge_agent_update_required",
      minimumVersion: "0.1.7",
    });
    expect(store.pool.connect).not.toHaveBeenCalled();
    expect(await store.claimEdgeScanJob(agent.id)).toBeUndefined();

    await app.close();
  }, 20_000);
});
