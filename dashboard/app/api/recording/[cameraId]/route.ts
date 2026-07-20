import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/backend";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ cameraId: string }> }) {
  try { return NextResponse.json(await getRecording(
    (await context.params).cameraId,
    request.cookies.get("sentinel_access")?.value,
  )); }
  catch { return NextResponse.json({ error: "recording_unavailable" }, { status: 502 }); }
}
export async function PUT(request: NextRequest, context: { params: Promise<{ cameraId: string }> }) {
  try {
    const body = await request.json();
    return NextResponse.json(await updateRecording(
      (await context.params).cameraId,
      body,
      request.cookies.get("sentinel_access")?.value,
    ));
  } catch { return NextResponse.json({ error: "recording_update_failed" }, { status: 502 }); }
}
