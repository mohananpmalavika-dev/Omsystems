import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/backend";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ cameraId: string }> }) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }
    return NextResponse.json(await getRecording(
      (await context.params).cameraId,
      sessionToken,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unauthenticated")) {
      return NextResponse.json(
        { error: "unauthenticated", message },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "recording_unavailable" }, { status: 502 });
  }
}
export async function PUT(request: NextRequest, context: { params: Promise<{ cameraId: string }> }) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }
    const body = await request.json();
    return NextResponse.json(await updateRecording(
      (await context.params).cameraId,
      body,
      sessionToken,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unauthenticated")) {
      return NextResponse.json(
        { error: "unauthenticated", message },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "recording_update_failed" }, { status: 502 });
  }
}
