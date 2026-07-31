import { NextRequest, NextResponse } from "next/server";

const CONTROL_PLANE_URL =
  process.env.CONTROL_PLANE_INTERNAL_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id") || "user-global-admin";
    
    const response = await fetch(`${CONTROL_PLANE_URL}/api/security/posture`, {
      headers: {
        "x-user-id": userId,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch security posture" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Security posture API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
