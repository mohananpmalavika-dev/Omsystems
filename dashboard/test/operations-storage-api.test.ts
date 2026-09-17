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
