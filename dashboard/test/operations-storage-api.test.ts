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
