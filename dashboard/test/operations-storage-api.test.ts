import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../app/api/operations/storage/route";
import { NextRequest } from "next/server";

describe("Storage Operations Live API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns storage overview and maps cameras to tiers", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/storage");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.cameras)).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.summary.sdCardNode).toBeDefined();
    expect(data.summary.dvrHddNode).toBeDefined();
    expect(data.summary.cloudNode).toBeDefined();
    expect(typeof data.summary.tier1SdCardCount).toBe("number");
    expect(typeof data.summary.tier2DvrHddCount).toBe("number");
    expect(typeof data.summary.tier3OnlineCloudCount).toBe("number");
  });

  it("forwards the browser session and shows measured recorder storage", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      expect((init?.headers as Record<string, string>)?.authorization).toBe("Bearer signed-in-session");
      if (url.endsWith("/v1/operations/health/disks")) {
        return Response.json({ success: true, data: [{
          id: "recorder-1:disk:1", devicePath: "HDD 1", model: "Recorder HDD",
          operationalStatus: "healthy", capacityBytes: 4_000_000_000_000,
          usedBytes: 1_000_000_000_000, availableBytes: 3_000_000_000_000,
        }] });
      }
      if (url.includes("/v1/cameras")) {
        return Response.json({ data: [{ id: "camera-1", name: "Camera 1", recorder_id: "recorder-1" }] });
      }
      return Response.json({ data: [] });
    });

    try {
      const req = new NextRequest("http://localhost:3000/api/operations/storage", {
        headers: { cookie: "sentinel_access=signed-in-session" },
      });
      const res = await GET(req);
      const data = await res.json();
      expect(data.summary.tier2DvrHddCount).toBe(1);
      expect(data.summary.dvrHddNode.capacity).toBe("4.0 TB");
      expect(data.cameras[0].activeStorageTier).toBe("dvr_hdd");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("shows discovered HDD and memory-card capacity before camera approval", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/operations/health/disks")) {
        return Response.json({ success: true, data: [
          { id: "recorder-2:disk:1", devicePath: "HDD 1", operationalStatus: "healthy", capacityBytes: 2_000_000_000_000, usedBytes: 500_000_000_000 },
          { id: "camera:pending:sdcard", devicePath: "MicroSD", operationalStatus: "healthy", capacityBytes: 128_000_000_000, usedBytes: 16_000_000_000 },
        ] });
      }
      return Response.json({ data: [] });
    });

    try {
      const res = await GET(new NextRequest("http://localhost:3000/api/operations/storage"));
      const data = await res.json();
      expect(data.cameras).toEqual([]);
      expect(data.summary.tier1SdCardCount).toBe(1);
      expect(data.summary.tier2DvrHddCount).toBe(1);
      expect(data.summary.sdCardNode.capacity).toBe("128.0 GB");
      expect(data.summary.dvrHddNode.capacity).toBe("2.0 TB");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("links a discovered memory card to its approved camera", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/operations/health/disks")) {
        return Response.json({ success: true, data: [{
          id: "camera:discovery-1:sdcard:disk:1", devicePath: "MicroSD",
          operationalStatus: "healthy", capacityBytes: 128_000_000_000,
          usedBytes: 16_000_000_000,
        }] });
      }
      if (url.includes("/v1/cameras")) {
        return Response.json({ data: [{
          id: "camera-1", name: "Camera 1", connectionSecretRef: "edge://agent-1/discovery-1",
        }] });
      }
      return Response.json({ data: [] });
    });

    try {
      const data = await (await GET(new NextRequest("http://localhost:3000/api/operations/storage"))).json();
      expect(data.cameras[0].activeStorageTier).toBe("sd_card");
      expect(data.cameras[0].capacity).toBe("128.0 GB");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("handles storage tier failover switch via POST", async () => {
    const postReq = new NextRequest("http://localhost:3000/api/operations/storage", {
      method: "POST",
      body: JSON.stringify({
        cameraId: "cam-test-1",
        targetTier: "online_cloud",
        reason: "Test failover",
      }),
    });

    const res = await POST(postReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.activeStorageTier).toBe("online_cloud");
    expect(data.cameraId).toBe("cam-test-1");
  });

  it("validates missing parameters in POST failover", async () => {
    const badReq = new NextRequest("http://localhost:3000/api/operations/storage", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(badReq);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
