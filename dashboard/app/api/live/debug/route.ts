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
  const sessionToken = isDashboardAuth
    ? undefined
    : getLiveSessionToken({
        cookieToken,
        sentinelSession,
        authorization,
      });

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
      controlPlaneUrl: process.env.CONTROL_PLANE_URL || process.env.CONTROL_PLANE_INTERNAL_URL || "NOT_SET",
      mediaGatewayUrl: process.env.MEDIA_GATEWAY_INTERNAL_URL || "NOT_SET",
      dashboardUserId: process.env.DASHBOARD_DEV_USER_ID || "NOT_SET",
      hasControlPlane: Boolean(process.env.CONTROL_PLANE_URL || process.env.CONTROL_PLANE_INTERNAL_URL),
      hasMediaGateway: Boolean(process.env.MEDIA_GATEWAY_INTERNAL_URL),
    },
    timestamp: new Date().toISOString(),
  });
}
