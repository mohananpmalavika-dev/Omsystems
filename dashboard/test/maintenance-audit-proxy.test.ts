import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getMaintenanceList, POST as postMaintenance } from "../app/api/audit/maintenance/route";
import { GET as getMaintenanceItem, PUT as putMaintenanceItem, PATCH as patchMaintenanceItem } from "../app/api/audit/maintenance/[id]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("maintenance and SLA audit dashboard proxy", () => {
  const mockWorkOrders = [
    {
      id: "wo-1",
      workOrderNumber: "WO-2026-001",
      problem: "Camera feed offline on entrance",
      severity: "critical",
      status: "closed",
      slaDueAt: "2026-09-01T12:00:00.000Z",
      resolvedAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "wo-2",
      workOrderNumber: "WO-2026-002",
      problem: "Storage degraded on recorder",
      severity: "high",
      status: "closed",
      slaDueAt: "2026-09-01T12:00:00.000Z",
      resolvedAt: "2026-09-01T14:00:00.000Z", // Resolved late
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T14:00:00.000Z",
    },
    {
      id: "wo-3",
      workOrderNumber: "WO-2026-003",
      problem: "Network switch reboot required",
      severity: "medium",
      status: "in_progress",
      slaDueAt: "2026-01-01T12:00:00.000Z", // Past due (open breach)
      createdAt: "2026-01-01T08:00:00.000Z",
      updatedAt: "2026-01-01T09:00:00.000Z",
    },
    {
      id: "wo-4",
      workOrderNumber: "WO-2026-004",
      problem: "Routine lens calibration",
      severity: "low",
      status: "open",
      slaDueAt: "2099-01-01T12:00:00.000Z", // In SLA (future)
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    },
  ];

  it("proxies work order list preserving authentication and filtering params", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ data: mockWorkOrders }));
    vi.stubGlobal("fetch", upstream);

    const response = await getMaintenanceList(new NextRequest(
      "https://dashboard.example/api/audit/maintenance?branchNodeId=branch-1&status=open&severity=high",
      { headers: { cookie: "sentinel_access=token-123" } }
    ));

    expect(String(upstream.mock.calls[0]?.[0])).toContain("/api/control/v1/maintenance/workorders");
    expect(String(upstream.mock.calls[0]?.[0])).toContain("branchNodeId=branch-1");
    expect(String(upstream.mock.calls[0]?.[0])).toContain("status=open");
    expect(String(upstream.mock.calls[0]?.[0])).toContain("severity=high");

    const json = await response.json();
    expect(json.data).toHaveLength(4);
  });

  it("calculates accurate SLA audit summary with on-time rate and breach metrics", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ data: mockWorkOrders }));
    vi.stubGlobal("fetch", upstream);

    const response = await getMaintenanceList(new NextRequest(
      "https://dashboard.example/api/audit/maintenance?summary=true"
    ));

    const json = await response.json();
    expect(json.data).toMatchObject({
      totalWorkOrders: 4,
      open: 2, // in_progress + open
      closed: 2,
      critical: 1,
      high: 1,
      slaAssessed: 3, // wo-1 (on-time), wo-2 (late), wo-3 (open breach)
      slaOnTime: 1,   // wo-1
      overdue: 1,     // wo-3
      breachedTotal: 2, // wo-2 (closed late) + wo-3 (open overdue)
      slaComplianceRate: 33, // 1/3 ~ 33%
    });
  });

  it("filters orders by SLA status (met, breached, in_sla)", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ data: mockWorkOrders }));
    vi.stubGlobal("fetch", upstream);

    const metResponse = await getMaintenanceList(new NextRequest(
      "https://dashboard.example/api/audit/maintenance?slaStatus=met"
    ));
    const metJson = await metResponse.json();
    expect(metJson.data).toHaveLength(1);
    expect(metJson.data[0].id).toBe("wo-1");

    const breachedResponse = await getMaintenanceList(new NextRequest(
      "https://dashboard.example/api/audit/maintenance?slaStatus=breached"
    ));
    const breachedJson = await breachedResponse.json();
    expect(breachedJson.data).toHaveLength(2); // wo-2 (late), wo-3 (overdue)
    expect(breachedJson.data.map((o: any) => o.id)).toEqual(["wo-2", "wo-3"]);
  });

  it("forwards both PUT and PATCH requests as PATCH to backend control plane", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ id: "wo-1", status: "resolved" }));
    vi.stubGlobal("fetch", upstream);

    // PUT
    const putResponse = await putMaintenanceItem(
      new NextRequest("https://dashboard.example/api/audit/maintenance/wo-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: "sentinel_access=token-123" },
        body: JSON.stringify({ status: "resolved", actionTaken: "Replaced PSU", verification: "Verified" }),
      }),
      { params: Promise.resolve({ id: "wo-1" }) }
    );

    expect(upstream.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(putResponse.status).toBe(200);

    // PATCH
    const patchResponse = await patchMaintenanceItem(
      new NextRequest("https://dashboard.example/api/audit/maintenance/wo-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: "sentinel_access=token-123" },
        body: JSON.stringify({ status: "closed", actionTaken: "Replaced PSU", verification: "Verified" }),
      }),
      { params: Promise.resolve({ id: "wo-1" }) }
    );

    expect(upstream.mock.calls[1]?.[1]?.method).toBe("PATCH");
    expect(patchResponse.status).toBe(200);
  });
});
