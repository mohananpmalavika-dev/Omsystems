import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL =
  process.env.CONTROL_PLANE_INTERNAL_URL ||
  process.env.CONTROL_PLANE_URL ||
  process.env.CONTROL_PLANE_PUBLIC_URL ||
  "http://localhost:8080";

const EDGE_BRIDGE_SHARED_KEY = process.env.EDGE_BRIDGE_SHARED_KEY || "";

export async function GET(request: NextRequest) {
  try {
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const sessionToken = request.cookies.get("sentinel_access")?.value ??
      request.headers.get("x-sentinel-session") ?? bearerToken;
    const devUserId = request.headers.get("x-user-id") || request.headers.get("x-development-user-id");

    if (!sessionToken && !devUserId) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (sessionToken) {
      headers["authorization"] = `Bearer ${sessionToken}`;
    }
    if (devUserId) {
      headers["x-user-id"] = devUserId;
    }
    if (EDGE_BRIDGE_SHARED_KEY) {
      headers["x-edge-bridge-key"] = EDGE_BRIDGE_SHARED_KEY;
    }

    const response = await fetch(`${CONTROL_PLANE_URL}/api/security/posture`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const message = `Control plane returned ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: response.status === 401 ? "unauthenticated" : "forbidden", message },
          { status: response.status },
        );
      }
      return NextResponse.json(
        { error: "security_posture_unavailable", message },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("Security posture API error:", message);
    return NextResponse.json(
      { error: "security_posture_unavailable", message },
      { status: 502 },
    );
  }
}
