import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";
import { buildApp } from "../src/app.js";

describe("Camera discovery delete functionality", () => {
  it("deletes a single discovery and clears unapproved discoveries for a branch", async () => {
    const store = new MemoryStore();
    const branchId = "branch-blr-001";
    store.nodes.set(branchId, {
      id: branchId,
      tenantId: "tenant-1",
      type: "branch",
      name: "Test branch",
      path: [branchId],
    } as any);

    const agent = await store.registerEdgeAgent(branchId, "test-agent", "0.1.0");

    const disc1 = await store.createDiscovery(branchId, {
      edgeAgentId: agent.id,
      manufacturer: "Hikvision",
      vendor: "hikvision",
      model: "DS-2CD2143G2-I",
      ipAddress: "192.168.1.100",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [],
      capabilities: { ptz: false, audio: false, events: false },
    });

    const disc2 = await store.createDiscovery(branchId, {
      edgeAgentId: agent.id,
      manufacturer: "Dahua",
      vendor: "dahua",
      model: "IPC-HFW1230S",
      ipAddress: "192.168.1.101",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [],
      capabilities: { ptz: false, audio: false, events: false },
    });

    expect(await store.listDiscoveredCameras(branchId)).toHaveLength(2);

    // Test API endpoint for single delete
    const app = await buildApp({ logger: false, store });
    const headers = { "x-user-id": "user-global-admin" };

    const deleteResp = await app.inject({
      method: "DELETE",
      url: `/v1/branches/${branchId}/cameras/discovered/${disc1.id}`,
      headers,
    });
    expect(deleteResp.statusCode).toBe(200);

    const remaining = await store.listDiscoveredCameras(branchId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(disc2.id);

    // Test API endpoint for clearing all discoveries
    const clearResp = await app.inject({
      method: "DELETE",
      url: `/v1/branches/${branchId}/cameras/discovered`,
      headers,
    });
    expect(clearResp.statusCode).toBe(200);
    const clearPayload = JSON.parse(clearResp.payload);
    expect(clearPayload.deleted).toBe(1);

    expect(await store.listDiscoveredCameras(branchId)).toHaveLength(0);
  });
});
