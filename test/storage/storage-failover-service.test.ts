import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { StorageFailoverRouter } from "../../src/storage/storage-failover-router.js";
import { StorageFailoverService } from "../../src/storage/storage-failover.service.js";
import { registerStorageFailoverRoutes } from "../../src/routes/storage-failover.routes.js";

describe("Storage Failover Service & REST API Suite", () => {
  it("configures targets, triggers synthetic failover, and queries audit events", async () => {
    const mockEvents: any[] = [];
    const mockTargets: any[] = [];

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("INSERT INTO media_node_storage_targets")) {
          mockTargets.push(params);
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO storage_failover_events")) {
          const ev = {
            id: params?.[0] || "ev-1",
            tenant_id: params?.[1],
            media_node_id: params?.[2],
            camera_id: params?.[3],
            from_storage_node_id: params?.[4],
            from_target_path: params?.[5],
            to_storage_node_id: params?.[6],
            to_target_path: params?.[7],
            reason: params?.[8],
            error_detail: params?.[9],
            occurred_at: params?.[10] || new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          mockEvents.push(ev);
          return { rows: [ev] };
        }
        if (sql.includes("SELECT * FROM storage_failover_events")) {
          return { rows: mockEvents };
        }
        return { rows: [] };
      }),
    } as any;

    const router = new StorageFailoverRouter();
    const service = new StorageFailoverService(mockPool, router);

    const app = Fastify();
    await registerStorageFailoverRoutes(app, {
      failoverService: service,
      failoverRouter: router,
    });
    await app.ready();

    // 1. Configure Primary Target (POST /api/v1/storage/failover/targets)
    const target1Resp = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/targets",
      payload: {
        mediaNodeId: "media-node-vault-01",
        storageNodeId: "node-video1",
        targetName: "Primary NVMe",
        targetPath: "/mnt/video1",
        priority: 1,
      },
    });

    expect(target1Resp.statusCode).toBe(201);
    const target1Data = JSON.parse(target1Resp.body).data;
    expect(target1Data.priority).toBe(1);

    // 2. Configure Secondary Target
    const target2Resp = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/targets",
      payload: {
        mediaNodeId: "media-node-vault-01",
        storageNodeId: "node-video2",
        targetName: "Secondary NVMe",
        targetPath: "/mnt/video2",
        priority: 2,
      },
    });

    expect(target2Resp.statusCode).toBe(201);

    // 3. Query Targets (GET /api/v1/storage/failover/targets)
    const listResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/targets?mediaNodeId=media-node-vault-01",
    });

    expect(listResp.statusCode).toBe(200);
    const listData = JSON.parse(listResp.body).data;
    expect(listData.permittedTargets.length).toBe(2);
    expect(listData.activeTarget.storageNodeId).toBe("node-video1");

    // 4. Trigger Synthetic Failover (POST /api/v1/storage/failover/trigger)
    const triggerResp = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/trigger",
      payload: {
        mediaNodeId: "media-node-vault-01",
        targetId: target1Data.id,
        reason: "STORAGE_OFFLINE",
        errorDetail: "Mount /mnt/video1 dropped abruptly",
      },
    });

    expect(triggerResp.statusCode).toBe(200);
    const triggerData = JSON.parse(triggerResp.body).data;
    expect(triggerData.failoverOccurred).toBe(true);
    expect(triggerData.newTarget.storageNodeId).toBe("node-video2");

    // 5. Query Audit Events (GET /api/v1/storage/failover/events)
    const eventsResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/events?mediaNodeId=media-node-vault-01",
    });

    expect(eventsResp.statusCode).toBe(200);
    const eventsData = JSON.parse(eventsResp.body).data;
    expect(eventsData.length).toBe(1);
    expect(eventsData[0].fromStorageNodeId).toBe("node-video1");
    expect(eventsData[0].toStorageNodeId).toBe("node-video2");
    expect(eventsData[0].reason).toBe("STORAGE_OFFLINE");
    // 6. PATCH Target (PATCH /api/v1/storage/failover/targets/:targetId)
    const patchResp = await app.inject({
      method: "PATCH",
      url: `/api/v1/storage/failover/targets/${target2Resp.json().data.id}`,
      payload: {
        mediaNodeId: "media-node-vault-01",
        priority: 1,
        spilloverThresholdPercent: 90,
      },
    });
    expect(patchResp.statusCode).toBe(200);
    expect(patchResp.json().data.priority).toBe(1);

    // 7. GET Metrics (GET /api/v1/storage/failover/metrics)
    const metricsResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/metrics?mediaNodeId=media-node-vault-01",
    });
    expect(metricsResp.statusCode).toBe(200);
    expect(metricsResp.json().data.totalEvents).toBe(1);

    // 8. Recover Target (POST /api/v1/storage/failover/recover)
    const recoverResp = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/recover",
      payload: {
        mediaNodeId: "media-node-vault-01",
        targetId: target1Data.id,
      },
    });
    expect(recoverResp.statusCode).toBe(200);
    expect(recoverResp.json().data.recovered).toBe(true);

    // 9. Health & Probe Endpoint (GET & POST)
    const healthResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/health?mediaNodeId=media-node-vault-01",
    });
    expect(healthResp.statusCode).toBe(200);
    expect(healthResp.json().data.targets.length).toBe(2);

    const probeResp = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/probe",
      payload: { mediaNodeId: "media-node-vault-01" },
    });
    expect(probeResp.statusCode).toBe(200);

    // 10. Delete Target (DELETE /api/v1/storage/failover/targets/:targetId)
    const deleteResp = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/failover/targets/${target2Resp.json().data.id}?mediaNodeId=media-node-vault-01`,
    });
    expect(deleteResp.statusCode).toBe(200);
    expect(deleteResp.json().success).toBe(true);
    await app.close();
  });

  it("rejects invalid audit-event page sizes at the API boundary", async () => {
    const app = Fastify();
    await registerStorageFailoverRoutes(app, {
      failoverService: new StorageFailoverService(undefined as any, new StorageFailoverRouter()),
      failoverRouter: new StorageFailoverRouter(),
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/events?limit=201",
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

