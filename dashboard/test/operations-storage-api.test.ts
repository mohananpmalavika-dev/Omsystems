import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/operations/storage/route";

const oldDatabaseUrl = process.env.DATABASE_URL;
const now = new Date().toISOString();
const request = () => new NextRequest("http://localhost:3000/api/operations/storage", {
  headers: { cookie: "sentinel_access=signed-in-session" },
});

function mockInventory(cameras: unknown[], disks: unknown[], nodes: unknown[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    expect((options?.headers as Record<string, string>)?.authorization).toBe("Bearer signed-in-session");
    const url = String(input);
    if (url.includes("/v1/cameras")) return Response.json({ data: cameras });
    if (url.endsWith("/health/disks")) return Response.json({ data: disks });
    return Response.json({ data: nodes });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = oldDatabaseUrl;
});

describe("Storage operations inventory", () => {
  it("prefers a verified SD card and counts each disk once", async () => {
    const fetchMock = mockInventory(
      [{ id: "camera-1", name: "Entrance", recorderId: "recorder-1" }],
      [
        { id: "camera-1:sdcard", model: "MicroSD", operationalStatus: "healthy", capacityBytes: 128e9, usedBytes: 16e9, lastCheck: now },
        { id: "camera-1:sdcard", model: "MicroSD", operationalStatus: "healthy", capacityBytes: 128e9, usedBytes: 16e9, lastCheck: now },
        { id: "recorder-1:disk:1", operationalStatus: "healthy", capacityBytes: 4e12, usedBytes: 1e12, lastCheck: now },
      ],
    );
    const data = await (await GET(request())).json();
    expect(data.cameras).toHaveLength(1);
    expect(data.cameras[0].activeStorageTier).toBe("sd_card");
    expect(data.cameras[0].recordingVerified).toBe(false);
    expect(data.summary.sdCardNode.capacity).toBe("128.0 GB");
    expect(data.summary.dvrHddNode.capacity).toBe("4.0 TB");
    expect(data.storageDevices).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the recorder disk only when the card is absent or unhealthy", async () => {
    mockInventory(
      [{ id: "camera-1", recorderId: "recorder-1" }],
      [
        { id: "camera-1:sdcard", operationalStatus: "critical", capacityBytes: 128e9, lastCheck: now },
        { id: "recorder-1:disk:1", operationalStatus: "healthy", capacityBytes: 2e12, lastCheck: now },
      ],
    );
    const data = await (await GET(request())).json();
    expect(data.cameras[0].activeStorageTier).toBe("dvr_hdd");
    expect(data.summary.tier2DvrHddCount).toBe(1);
  });

  it("ignores stale telemetry and matches an ONVIF discovered memory card", async () => {
    mockInventory(
      [{ id: "camera-1", storageDiscoveryId: "discovery-1" }],
      [
        { id: "camera:discovery-1:sdcard:disk:1", operationalStatus: "healthy", capacityBytes: 128e9, lastCheck: now },
        { id: "camera-1:sdcard", operationalStatus: "healthy", capacityBytes: 256e9, lastCheck: "2020-01-01T00:00:00.000Z" },
      ],
    );
    const data = await (await GET(request())).json();
    expect(data.cameras[0].activeStorageTier).toBe("sd_card");
    expect(data.cameras[0].capacity).toBe("128.0 GB");
    expect(data.storageDevices).toHaveLength(1);
  });

  it("reports unavailable when there is no verified local or cloud target", async () => {
    mockInventory([{ id: "camera-1" }], []);
    const data = await (await GET(request())).json();
    expect(data.cameras[0].activeStorageTier).toBe("unavailable");
    expect(data.summary.sdCardNode.capacity).toBe("Unavailable");
    expect(data.summary.dvrHddNode.capacity).toBe("Unavailable");
    expect(data.summary.cloudNode.status).toBe("unavailable");
    expect(data.storageDevices).toEqual([]);
  });

  it("shows a real healthy cloud node only as an available candidate", async () => {
    mockInventory([{ id: "camera-1" }], [], [{
      nodeId: "s3-primary", storageType: "s3", healthState: "HEALTHY", capacityBytes: 10e12,
    }]);
    const data = await (await GET(request())).json();
    expect(data.cameras[0].activeStorageTier).toBe("online_cloud");
    expect(data.cameras[0].recordingVerified).toBe(false);
    expect(data.summary.cloudNode.capacity).toBe("10.0 TB");
  });

  it("does not pretend that a POST switched recording storage", async () => {
    const response = await POST();
    expect(response.status).toBe(409);
    expect((await response.json()).success).toBe(false);
  });

  it("loads later camera pages without duplicate camera rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/v1/cameras")) {
        return Response.json(url.includes("offset=2")
          ? { data: [{ id: "camera-2" }], total: 3 }
          : { data: [{ id: "camera-1" }, { id: "camera-1" }], total: 3 });
      }
      return Response.json({ data: [] });
    });
    const data = await (await GET(request())).json();
    expect(data.cameras.map((camera: { cameraId: string }) => camera.cameraId)).toEqual(["camera-1", "camera-2"]);
  });
});
