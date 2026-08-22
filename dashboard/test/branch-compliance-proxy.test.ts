import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/audit/branch-compliance/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("branch compliance dashboard proxy", () => {
  it("uses the authenticated dashboard BFF and preserves the API envelope", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({
      data: [{ branchId: "branch-1", overallComplianceScore: 98 }],
    }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(new NextRequest(
      "https://dashboard.example/api/audit/branch-compliance?branchNodeId=branch-1",
      { headers: { cookie: "sentinel_access=employee-token", "x-tenant-id": "tenant-1" } },
    ));

    expect(String(upstream.mock.calls[0]?.[0])).toBe(
      "https://dashboard.example/api/control/v1/audit/branch-compliance?branchNodeId=branch-1",
    );
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get("cookie")).toBe("sentinel_access=employee-token");
    expect(headers.get("x-tenant-id")).toBe("tenant-1");
    expect(await response.json()).toEqual({
      data: [{ branchId: "branch-1", overallComplianceScore: 98 }],
    });
  });

  it("forwards structured upstream failures instead of converting them to a generic 500", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json(
      { error: "forbidden", message: "Audit access is required" },
      { status: 403 },
    )));

    const response = await GET(new NextRequest(
      "https://dashboard.example/api/audit/branch-compliance",
    ));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "Audit access is required",
    });
  });
});
