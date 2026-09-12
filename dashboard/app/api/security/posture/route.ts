import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL =
  process.env.CONTROL_PLANE_INTERNAL_URL ||
  process.env.CONTROL_PLANE_PUBLIC_URL ||
  "http://localhost:8080";

const EDGE_BRIDGE_SHARED_KEY = process.env.EDGE_BRIDGE_SHARED_KEY || "";

export async function GET(request: NextRequest) {
  try {
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const sessionToken = request.cookies.get("sentinel_access")?.value ??
      request.headers.get("x-sentinel-session") ?? bearerToken;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }

    const response = await fetch(`${CONTROL_PLANE_URL}/v1/security/posture`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionToken}`,
        ...(EDGE_BRIDGE_SHARED_KEY
          ? { "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
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
