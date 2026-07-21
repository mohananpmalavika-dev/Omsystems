import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = z.object({ cameraId: z.string().min(1) }).parse(
      await request.json(),
    );
    return NextResponse.json(
      await startLive(
        body.cameraId,
        request.cookies.get("sentinel_access")?.value,
      ),
      { status: 201 },
    );
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause
      : undefined;
    console.error("Live-session startup failed", {
      message: error instanceof Error ? error.message : "unknown error",
      cause: cause?.message,
      code: cause && "code" in cause ? cause.code : undefined,
    });
    return NextResponse.json(
      { error: "live_session_unavailable" },
      { status: 502 },
    );
  }
}
