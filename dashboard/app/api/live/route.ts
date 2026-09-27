import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startLive } from "@/lib/backend";
import { getLiveSessionToken } from "@/lib/live-auth";

export const dynamic = "force-dynamic";

const upstreamBase =
  (Reflect.get(process.env, "CONTROL_PLANE_INTERNAL_URL") as string | undefined) ||
  (Reflect.get(process.env, "CONTROL_PLANE_URL") as string | undefined) ||
  (Reflect.get(process.env, "CONTROL_PLANE_PUBLIC_URL") as string | undefined) ||
  (process.env.NODE_ENV === "production" ? "http://control-plane:8080" : "http://localhost:8080");

// Attempt a silent token refresh using the HttpOnly sentinel_refresh cookie.
async function attemptSilentRefresh(
  refreshToken: string,
): Promise<string | null> {
  try {
    let res = await fetch(new URL("/api/v1/auth/refresh", upstreamBase).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status === 404) {
      res = await fetch(new URL("/v1/auth/refresh", upstreamBase).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    }
    if (!res.ok) return null;
    const data = await res.json() as { accessToken?: string; refreshToken?: string };
    return data?.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    let sessionToken = getLiveSessionToken({
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

    const tryStartLive = async (token: string | null | undefined) => {
      return startLive(
        body.cameraId,
        token ?? undefined,
        body.routePreference,
      );
    };

    let result;
    try {
      result = await tryStartLive(sessionToken);
    } catch (firstError) {
      // If the first attempt failed with unauthenticated and we have a refresh
      // cookie, silently exchange it for a fresh access token and retry once.
      const isAuthError = firstError instanceof Error &&
        (firstError.message === "unauthenticated" ||
          firstError.message.includes("401") ||
          firstError.message.includes("token_expired") ||
          firstError.message.includes("invalid_token"));

      const refreshToken = request.cookies.get("sentinel_refresh")?.value;

      if (isAuthError && refreshToken) {
        const freshAccessToken = await attemptSilentRefresh(refreshToken);
        if (freshAccessToken) {
          sessionToken = freshAccessToken;
          // Retry with the fresh token — let this throw if it fails.
          result = await tryStartLive(freshAccessToken);
        } else {
          // Refresh failed, re-throw the original auth error.
          throw firstError;
        }
      } else {
        throw firstError;
      }
    }

    const response = NextResponse.json(result, { status: 201 });

    // If we issued a new access token via silent refresh, set it on the
    // outgoing response so the browser's HttpOnly cookie stays current.
    if (sessionToken && sessionToken !== getLiveSessionToken({
      cookieToken: request.cookies.get("sentinel_access")?.value,
      sentinelSession: request.headers.get("x-sentinel-session"),
      authorization,
    })) {
      response.cookies.set("sentinel_access", sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour
      });
    }

    return response;
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
  if (code.includes("bridge_offline")) return "bridge_offline";
  if (code.includes("stream_secret_unavailable")) return "stream_secret_unavailable";
  if (code.includes("media_gateway_unavailable")) return "media_gateway_unavailable";
  const knownCodes = new Set([
    "invalid_live_session",
    "media_gateway_failure",
    "media_gateway_unavailable",
    "stream_secret_unavailable",
    "bridge_offline",
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
  const status = code.match(/^(?:Control plane|Media gateway) returned (\d{3})/i)?.[1];
  if (status === "401" || status === "403") return "forbidden";
  if (status && status.startsWith("5")) return "control_plane_unavailable";
  return "live_session_unavailable";
}

function publicLiveStatus(code: string) {
  if (code === "invalid_request") return 400;
  if (code === "unauthenticated") return 401;
  if (code === "forbidden" || code === "approval_required") return 403;
  if (code === "camera_not_found" || code === "resource_not_found") return 404;
  if (
    code === "control_plane_unavailable" ||
    code === "media_gateway_unavailable" ||
    code === "stream_secret_unavailable" ||
    code === "edge_agent_not_found" ||
    code === "edge_agent_offline" ||
    code === "bridge_offline"
  ) return 503;
  return 502;
}
