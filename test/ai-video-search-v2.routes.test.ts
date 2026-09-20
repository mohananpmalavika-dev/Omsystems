import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAIVideoSearchV2Routes } from "../src/routes/ai-video-search-v2.routes.js";

describe("AI video search V2 camera isolation", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("scopes summary camera lookup to the authenticated tenant", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("currentUser", null);
    app.addHook("preHandler", async (request) => {
      request.currentUser = { id: "user-1", tenantId: "tenant-a" } as any;
    });
    await registerAIVideoSearchV2Routes(app, pool);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/video-search/summarize",
      payload: {
        tenantId: "tenant-b",
        cameraId: "camera-1",
        startTime: "2026-09-20T10:00:00.000Z",
        endTime: "2026-09-20T10:05:00.000Z",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT id, name FROM cameras WHERE id = $1 AND tenant_id = $2",
      ["camera-1", "tenant-a"],
    );
  });
});
