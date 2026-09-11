import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

const userHeaders = { "x-user-id": "user-global-admin" };

describe("recording metadata authorization", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("rejects range, segment, and keyframe reads for a foreign-tenant camera", async () => {
    const store = new MemoryStore();
    store.nodes.set("foreign-branch", {
      id: "foreign-branch",
      parentId: null,
      tenantId: "foreign-tenant",
      type: "branch",
      name: "Foreign branch",
      path: ["foreign-branch"],
    });
    store.nodes.set("foreign-camera-node", {
      id: "foreign-camera-node",
      parentId: "foreign-branch",
      tenantId: "foreign-tenant",
      type: "camera",
      name: "Foreign camera",
      path: ["foreign-branch", "foreign-camera-node"],
    });
    store.cameras.set("foreign-camera", {
      ...structuredClone(store.cameras.get("cam-001")!),
      id: "foreign-camera",
      tenantId: "foreign-tenant",
      branchId: "foreign-branch",
      nodeId: "foreign-camera-node",
    });
    app = await buildApp({ store });

    const urls = [
      "/api/v1/recordings/foreign-camera/range",
      "/api/v1/recordings/foreign-camera/segment-at?timestamp=2026-09-10T10:00:00.000Z",
      "/api/v1/recordings/foreign-camera/nearest-keyframe?timestamp=2026-09-10T10:00:00.000Z",
    ];

    for (const url of urls) {
      const response = await app.inject({ method: "GET", url, headers: userHeaders });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        success: false,
        error: "recording_resource_not_found",
      });
    }
  });
});
