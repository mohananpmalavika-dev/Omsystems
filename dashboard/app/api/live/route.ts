import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";
import { getLiveSessionToken } from "@/lib/live-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const sessionToken = getLiveSessionToken({
      cookieToken: request.cookies.get("sentinel_access")?.value,
      sentinelSession: request.headers.get("x-sentinel-session"),
      authorization,
    });

    const body = z.object({
      cameraId: z.string().min(1),
      profile: z.enum(["main", "sub"]).default("sub"),
      routePreference: z.enum(["auto", "public"]).default("auto"),
    }).parse(
      await request.json(),
    );

    const result = await startLive(
      body.cameraId,
      sessionToken ?? undefined,
      body.routePreference,
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
    const code = publicLiveError(error);
    return NextResponse.json({ error: code }, { status: publicLiveStatus(code) });
  }
}

function publicLiveError(error: unknown) {
  if (error instanceof z.ZodError) return "invalid_request";
  const code = error instanceof Error ? error.message : "";
  const knownCodes = new Set([
    "invalid_live_session",
    "media_gateway_failure",
    "media_gateway_unavailable",
    "stream_secret_unavailable",
    "forbidden",
    "approval_required",
    "camera_not_found",
    "resource_not_found",
    "control_plane_unavailable",
    "edge_agent_not_found",
    "edge_agent_offline",
    "invalid_bridge_identity",
    "unauthenticated",
    "internal_error",
  ]);

  if (knownCodes.has(code)) return code;
  const status = code.match(/^Control plane returned (\d{3})$/)?.[1];
  if (status === "401" || status === "403") return "forbidden";
  if (status && status.startsWith("5")) return "control_plane_unavailable";
  return "live_session_unavailable";
}

function publicLiveStatus(code: string) {
  if (code === "invalid_request") return 400;
  if (code === "unauthenticated") return 401;
  if (code === "forbidden" || code === "approval_required") return 403;
  if (code === "camera_not_found" || code === "resource_not_found") return 404;
  if (code === "control_plane_unavailable" || code === "media_gateway_unavailable" || code === "edge_agent_not_found" || code === "edge_agent_offline") return 503;
  return 502;
}
