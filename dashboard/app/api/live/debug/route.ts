import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLiveSessionToken, isDashboardBasicAuth } from "@/lib/live-auth";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to check live session authentication and configuration
 */
export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const cookieToken = request.cookies.get("sentinel_access")?.value;
  const sentinelSession = request.headers.get("x-sentinel-session");

  const isDashboardAuth = isDashboardBasicAuth(authorization);
  const sessionToken = getLiveSessionToken({
    cookieToken,
    sentinelSession,
    authorization,
  });

  if (!sessionToken && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    status: "diagnostic",
    authentication: {
      hasCookieToken: Boolean(cookieToken),
      hasSentinelSession: Boolean(sentinelSession),
      hasAuthHeader: Boolean(authorization),
      isDashboardBasicAuth: isDashboardAuth,
      hasSessionToken: Boolean(sessionToken),
      tokenSource: sessionToken
        ? cookieToken === sessionToken
          ? "cookie"
          : sentinelSession === sessionToken
            ? "header"
            : "bearer"
        : "none",
    },
    environment: {
      controlPlaneConfigured: Boolean(process.env.CONTROL_PLANE_URL || process.env.CONTROL_PLANE_INTERNAL_URL),
      mediaGatewayConfigured: Boolean(process.env.MEDIA_GATEWAY_INTERNAL_URL || process.env.MEDIA_GATEWAY_PUBLIC_URL),
      localMediaGatewayConfigured: Boolean(process.env.MEDIA_GATEWAY_LOCAL_URL),
    },
    timestamp: new Date().toISOString(),
  });
}
