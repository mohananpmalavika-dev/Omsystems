import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceConfigurationApi } from "../lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deviceConfigurationApi client layer", () => {
  it("queries camera video configuration with profileToken", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/control/v1/devices/cam-101/configuration/video?profileToken=Profile_1");
      return Response.json({ success: true, data: { codec: "H264", fps: 25 } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await deviceConfigurationApi.getVideoConfiguration("cam-101", "Profile_1");
    expect(res.data.codec).toBe("H264");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits video configuration payload correctly", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/control/v1/devices/cam-101/configuration/video");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.codec).toBe("H265");
      expect(body.fps).toBe(30);
      return Response.json({ success: true, data: { success: true, state: "VERIFIED" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await deviceConfigurationApi.setVideoConfiguration("cam-101", {
      codec: "H265",
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      bitrateKbps: 4096,
    });
    expect(res.data.success).toBe(true);
    expect(res.data.state).toBe("VERIFIED");
  });

  it("queries imaging options and configuration", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/options")) {
        return Response.json({
          success: true,
          data: { brightnessRange: { min: 0, max: 100 }, irCutFilterModes: ["AUTO", "ON", "OFF"] },
        });
      }
      return Response.json({
        success: true,
        data: { brightness: 55, contrast: 50, irCutFilter: "AUTO" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [cfg, opt] = await Promise.all([
      deviceConfigurationApi.getImagingConfiguration("cam-101"),
      deviceConfigurationApi.getImagingOptions("cam-101"),
    ]);

    expect(cfg.data.brightness).toBe(55);
    expect(opt.data.irCutFilterModes).toContain("AUTO");
  });

  it("queries and synchronizes clock settings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.dateTimeType).toBe("NTP");
        expect(body.ntpServer).toBe("time.google.com");
        return Response.json({ success: true, data: { success: true, state: "VERIFIED" } });
      }
      return Response.json({
        success: true,
        data: { deviceTime: "2026-09-04T02:00:00Z", offsetSeconds: 2, status: "SYNCHRONIZED" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await deviceConfigurationApi.getTimeConfiguration("cam-101");
    expect(status.data.status).toBe("SYNCHRONIZED");

    const applied = await deviceConfigurationApi.setTimeConfiguration("cam-101", {
      dateTimeType: "NTP",
      ntpServer: "time.google.com",
    });
    expect(applied.data.success).toBe(true);
  });

  it("manages rollback snapshots and restores safely", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/rollback")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.snapshotId).toBe("snap-12345");
        return Response.json({ success: true, data: { success: true, state: "ROLLED_BACK" } });
      }
      if (init?.method === "POST") {
        return Response.json({ success: true, data: { snapshotId: "snap-new" } });
      }
      return Response.json({
        success: true,
        data: [{ snapshotId: "snap-12345", createdAt: "2026-09-04T01:00:00Z" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const list = await deviceConfigurationApi.listSnapshots("cam-101");
    expect(list.data.length).toBe(1);

    const rollback = await deviceConfigurationApi.rollbackSnapshot("cam-101", "snap-12345");
    expect(rollback.data.state).toBe("ROLLED_BACK");
  });

  it("handles recorder schedule and channel encoding", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/channels/1/schedule")) {
        if (init?.method === "PUT") {
          return Response.json({ success: true, data: { success: true, state: "VERIFIED" } });
        }
        return Response.json({
          success: true,
          data: { enabled: true, schedule: [{ day: "MONDAY", periods: [] }] },
        });
      }
      if (String(input).includes("/channels/1/encoding")) {
        if (init?.method === "PUT") {
          return Response.json({ success: true, data: { success: true, state: "VERIFIED" } });
        }
        return Response.json({
          success: true,
          data: { codec: "H264", fps: 25, resolution: { width: 1920, height: 1080 } },
        });
      }
      return Response.json({ success: true, data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const sched = await deviceConfigurationApi.getRecorderSchedule("rec-1", "1");
    expect(sched.data.enabled).toBe(true);

    const enc = await deviceConfigurationApi.getRecorderChannelEncoding("rec-1", "1");
    expect(enc.data.codec).toBe("H264");

    const putRes = await deviceConfigurationApi.setRecorderSchedule("rec-1", "1", {
      enabled: true,
      schedule: [],
    });
    expect(putRes.data.success).toBe(true);
  });

  // =========================================================================
  // Phase 9: Golden Configuration Templates & Fleet Compliance Client Tests
  // =========================================================================

  it("lists golden templates and retrieves template by ID", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/templates/tmpl-1")) {
        return Response.json({
          success: true,
          data: { id: "tmpl-1", name: "Entrance HD", classification: "branch_entrance" },
        });
      }
      return Response.json({
        success: true,
        data: [
          { id: "tmpl-1", name: "Entrance HD", classification: "branch_entrance" },
          { id: "tmpl-2", name: "Teller Cash", classification: "cash_counter" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const list = await deviceConfigurationApi.listGoldenTemplates();
    expect(list.data.length).toBe(2);
    expect(list.data[0].id).toBe("tmpl-1");

    const single = await deviceConfigurationApi.getGoldenTemplate("tmpl-1");
    expect(single.data.name).toBe("Entrance HD");
  });

  it("creates and updates golden template via API client", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/templates")) {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          success: true,
          data: { id: "tmpl-new-1", name: body.name, classification: body.classification },
        });
      }
      if (init?.method === "PUT" && url.includes("/templates/tmpl-new-1")) {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          success: true,
          data: { id: "tmpl-new-1", name: body.name },
        });
      }
      return Response.json({ success: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await deviceConfigurationApi.createGoldenTemplate({
      name: "Strongroom Ultra",
      classification: "strongroom_vault",
      targetType: "camera",
      settings: {},
    });
    expect(created.data.id).toBe("tmpl-new-1");

    const updated = await deviceConfigurationApi.updateGoldenTemplate("tmpl-new-1", {
      name: "Strongroom Ultra Modified",
    });
    expect(updated.data.name).toBe("Strongroom Ultra Modified");
  });

  it("applies golden template across scope", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/control/v1/device-configuration/templates/tmpl-1/apply");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.scope).toBe("branch");
      expect(body.branchId).toBe("branch-blr-01");

      return Response.json({
        success: true,
        data: { templateId: "tmpl-1", totalTargeted: 5, appliedCount: 5, failedCount: 0 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await deviceConfigurationApi.applyGoldenTemplate("tmpl-1", {
      scope: "branch",
      branchId: "branch-blr-01",
    });
    expect(res.data.appliedCount).toBe(5);
    expect(res.data.failedCount).toBe(0);
  });

  it("fetches fleet compliance report and triggers remediation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/compliance/remediate")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.templateId).toBe("tmpl-1");
        return Response.json({
          success: true,
          data: { remediatedCount: 2, failedCount: 0 },
        });
      }
      return Response.json({
        success: true,
        data: {
          overallPercentage: 92,
          totalDevicesEvaluated: 25,
          compliantCount: 23,
          driftedCount: 2,
          drifts: [],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await deviceConfigurationApi.getFleetCompliance();
    expect(report.data.overallPercentage).toBe(92);
    expect(report.data.driftedCount).toBe(2);

    const rem = await deviceConfigurationApi.remediateCompliance({ templateId: "tmpl-1" });
    expect(rem.data.remediatedCount).toBe(2);
  });
});
