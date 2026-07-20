import { NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/backend";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ cameraId: string }> }) {
  try { return NextResponse.json(await getRecording((await context.params).cameraId)); }
  catch { return NextResponse.json({ error: "recording_unavailable" }, { status: 502 }); }
}
export async function PUT(request: Request, context: { params: Promise<{ cameraId: string }> }) {
  try {
    const body = await request.json();
    return NextResponse.json(await updateRecording((await context.params).cameraId, body));
  } catch { return NextResponse.json({ error: "recording_update_failed" }, { status: 502 }); }
}
