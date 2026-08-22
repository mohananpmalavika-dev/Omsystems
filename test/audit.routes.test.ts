import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { createTestApp, type TestContext } from "./test-app.js";

describe("Audit Routes", () => {
  let app: FastifyInstance;
  let context: TestContext;

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    context = testApp.context;
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /v1/audit/health", () => {
    it("returns health summary when summary=true", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/health?summary=true",
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("summary");
      expect(payload.summary).toHaveProperty("total");
      expect(payload.summary).toHaveProperty("healthy");
      expect(payload.summary).toHaveProperty("degraded");
      expect(payload.summary).toHaveProperty("offline");
      expect(payload.summary).toHaveProperty("healthScore");
      
      expect(typeof payload.summary.total).toBe("number");
      expect(typeof payload.summary.healthScore).toBe("number");
    });

    it("returns detailed health records without summary parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/health",
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("data");
      expect(payload).toHaveProperty("total");
      expect(Array.isArray(payload.data)).toBe(true);
      expect(typeof payload.total).toBe("number");
    });

    it("filters cameras by branchNodeId", async () => {
      // First, create a test branch and camera
      const branch = await context.store.createNode(
        context.tenantId,
        "branch-test",
        "branch",
        null,
        { name: "Test Branch" },
      );

      const response = await app.inject({
        method: "GET",
        url: `/v1/audit/health?branchNodeId=${branch.id}`,
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("data");
      // All returned cameras should belong to the specified branch
      if (payload.data.length > 0) {
        payload.data.forEach((record: any) => {
          expect(record.branchNodeId).toBe(branch.id);
        });
      }
    });

    it("filters cameras by status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/health?status=healthy",
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("data");
      // All returned cameras should have 'healthy' status
      payload.data.forEach((record: any) => {
        expect(record.status).toBe("healthy");
      });
    });

    it("returns camera health metrics", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/health",
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      if (payload.data.length > 0) {
        const healthRecord = payload.data[0];
        
        expect(healthRecord).toHaveProperty("cameraId");
        expect(healthRecord).toHaveProperty("cameraName");
        expect(healthRecord).toHaveProperty("branchNodeId");
        expect(healthRecord).toHaveProperty("status");
        expect(healthRecord).toHaveProperty("lastCheckAt");
        expect(healthRecord).toHaveProperty("uptime");
        expect(healthRecord).toHaveProperty("metrics");
        
        expect(healthRecord.metrics).toHaveProperty("fps");
        expect(healthRecord.metrics).toHaveProperty("bitrate");
        expect(healthRecord.metrics).toHaveProperty("temperature");
      }
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/health",
      });

      // Should return 401 or 403 without proper authentication
      expect([401, 403]).toContain(response.statusCode);
    });
  });

  describe("POST /v1/audit/health/check", () => {
    it("triggers health check and returns 202", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/audit/health/check",
        headers: {
          "x-user-id": "user-global-admin",
          "content-type": "application/json",
        },
        payload: {
          branchNodeId: "00000000-0000-0000-0000-000000000001",
        },
      });

      expect(response.statusCode).toBe(202);
      const payload = response.json();
      
      expect(payload).toHaveProperty("message");
      expect(payload).toHaveProperty("status");
      expect(payload.status).toBe("in-progress");
    });

    it("accepts cameraId parameter", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/audit/health/check",
        headers: {
          "x-user-id": "user-global-admin",
          "content-type": "application/json",
        },
        payload: {
          cameraId: "00000000-0000-0000-0000-000000000002",
        },
      });

      expect(response.statusCode).toBe(202);
    });

    it("accepts empty body for global health check", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/audit/health/check",
        headers: {
          "x-user-id": "user-global-admin",
          "content-type": "application/json",
        },
        payload: {},
      });

      expect(response.statusCode).toBe(202);
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/audit/health/check",
        payload: {},
      });

      // Should return 401 or 403 without proper authentication
      expect([401, 403]).toContain(response.statusCode);
    });
  });

  describe("GET /v1/audit/branch-compliance", () => {
    it("returns branch compliance summary", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/audit/branch-compliance",
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("data");
    });

    it("filters by branchNodeId when provided", async () => {
      const branchId = "00000000-0000-0000-0000-000000000001";
      const response = await app.inject({
        method: "GET",
        url: `/v1/audit/branch-compliance?branchNodeId=${branchId}`,
        headers: {
          "x-user-id": "user-global-admin",
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      
      expect(payload).toHaveProperty("data");
    });
  });
});
