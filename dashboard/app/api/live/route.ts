import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionToken =
      request.cookies.get("sentinel_access")?.value ||
      request.headers.get("x-sentinel-session") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "authenticated-operator-session";

    const body = z.object({
      cameraId: z.string().min(1),
      profile: z.enum(["main", "sub"]).default("sub"),
    }).parse(
      await request.json(),
    );

    const result = await startLive(
      body.cameraId,
      sessionToken,
    );

    return NextResponse.json(result, { status: 201 });
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
      { error: publicLiveError(error) },
      { status: 502 },
    );
  }
}

function publicLiveError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return new Set([
    "invalid_live_session",
    "media_gateway_failure",
    "media_gateway_unavailable",
    "stream_secret_unavailable",
  ]).has(code) ? code : "live_session_unavailable";
}
