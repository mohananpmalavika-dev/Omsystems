import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL =
  process.env.CONTROL_PLANE_INTERNAL_URL ||
  process.env.CONTROL_PLANE_PUBLIC_URL ||
  "http://localhost:8080";

const EDGE_BRIDGE_SHARED_KEY = process.env.EDGE_BRIDGE_SHARED_KEY || "";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }

    const response = await fetch(`${CONTROL_PLANE_URL}/api/security/posture`, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionToken}`,
        ...(EDGE_BRIDGE_SHARED_KEY
          ? { "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY }
          : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = `Control plane returned ${response.status}`;
      if (response.status === 401) {
        return NextResponse.json(
          { error: "unauthenticated", message },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: "security_posture_unavailable", message },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("Security posture API error:", message);
    return NextResponse.json(
      { error: "security_posture_unavailable", message },
      { status: 502 },
    );
  }
}
