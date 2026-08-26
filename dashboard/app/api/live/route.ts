import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";
import { getLiveSessionToken, isDashboardBasicAuth } from "@/lib/live-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Render's dashboard Basic Auth protects the Next.js app, but it is not
    // an employee session for the control plane. Only an explicit bearer
    // token should be forwarded; otherwise startLive() uses the configured
    // dashboard user.
    const authorization = request.headers.get("authorization");
    const sessionToken = isDashboardBasicAuth(authorization)
      ? undefined
      : getLiveSessionToken({
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
    return NextResponse.json(
      { error: publicLiveError(error) },
      { status: 502 },
    );
  }
}

function publicLiveError(error: unknown) {
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
    "invalid_bridge_identity",
    "internal_error",
  ]);

  if (knownCodes.has(code)) return code;
  const status = code.match(/^Control plane returned (\d{3})$/)?.[1];
  if (status === "401" || status === "403") return "forbidden";
  if (status && status.startsWith("5")) return "control_plane_unavailable";
  return "live_session_unavailable";
}
