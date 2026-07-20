import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = z.object({ cameraId: z.string().min(1) }).parse(
      await request.json(),
    );
    return NextResponse.json(await startLive(body.cameraId), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "live_session_unavailable" },
      { status: 502 },
    );
  }
}
