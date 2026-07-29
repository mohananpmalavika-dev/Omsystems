import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCameras } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }
    const { id } = await context.params;
    return NextResponse.json({
      data: await listCameras(id, sessionToken),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (message.includes("unauthenticated")) {
      return NextResponse.json(
        { error: "unauthenticated", message },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "cameras_unavailable" },
      { status: 502 },
    );
  }
}
