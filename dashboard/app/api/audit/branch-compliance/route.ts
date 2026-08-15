import { NextRequest, NextResponse } from "next/server";

const CONTROL_BFF_BASE = "/api/control";

/**
 * GET /api/audit/branch-compliance
 * Proxy branch-compliance data through the dashboard BFF so employee-session
 * authentication and the configured control-plane origin are preserved.
 */
export async function GET(request: NextRequest) {
  const params = new URLSearchParams();
  const branchNodeId = request.nextUrl.searchParams.get("branchNodeId");
  if (branchNodeId) params.set("branchNodeId", branchNodeId);

  const query = params.toString();
  const bffUrl = new URL(
    `${CONTROL_BFF_BASE}/v1/audit/branch-compliance${query ? `?${query}` : ""}`,
    request.nextUrl.origin,
  );

  try {
    const response = await fetch(bffUrl, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        "x-tenant-id": request.headers.get("x-tenant-id") ?? "",
        "x-user-id": request.headers.get("x-user-id") ?? "system",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return NextResponse.json(await response.json(), { status: response.status });
    }

    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": contentType || "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Branch compliance API error:", error);
    return NextResponse.json(
      { error: "control_plane_unavailable", message: "Unable to load branch compliance data" },
      { status: 502 },
    );
  }
}
