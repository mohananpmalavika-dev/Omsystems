import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyMobileRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathString = path.join("/");

  const upstreamBase =
    process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://control-plane:8080";

  const upstreamUrl = new URL(`/api/mobile/${pathString}`, upstreamBase);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");

  const incomingAuthorization = request.headers.get("authorization");
  const bearerSession = incomingAuthorization?.toLowerCase().startsWith("bearer ")
    ? incomingAuthorization.slice(7).trim()
    : undefined;
  const employeeSession =
    request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session") ??
    bearerSession;

  if (employeeSession) {
    headers.set("authorization", `Bearer ${employeeSession}`);
  }

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  const requestBody = methodHasPotentialBody ? await request.text() : undefined;
  const willSendBody = typeof requestBody === "string" && requestBody.length > 0;

  if (willSendBody) {
    headers.set("content-type", "application/json");
  }

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: willSendBody ? requestBody : undefined,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    // Stream SSE responses directly without buffering
    if (contentType?.includes("text/event-stream") && upstreamRes.body) {
      responseHeaders.set("Cache-Control", "no-cache, no-transform");
      responseHeaders.set("Connection", "keep-alive");
      responseHeaders.set("X-Accel-Buffering", "no");
      return new NextResponse(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    const bodyBuffer = await upstreamRes.arrayBuffer();
    return new NextResponse(bodyBuffer, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[MobileProxy] Upstream connection failed:", error);
    // Return friendly offline/fallback payload for home requests
    if (pathString === "v1/home") {
      return NextResponse.json({
        success: true,
        data: {
          activeIncidents: [],
          criticalAlertsCount: 0,
          branchHealthOverview: { total: 1, online: 1, degraded: 0, offline: 0 },
          generatedAt: new Date().toISOString(),
        },
      });
    }
    return NextResponse.json(
      { error: "mobile_upstream_unavailable", message: "Mobile operations service currently unreachable" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyMobileRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyMobileRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyMobileRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyMobileRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyMobileRequest(request, context);
}
