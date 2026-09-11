import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedPaths = new Set([
  "performance/health",
  "performance/endpoints",
  "performance/queries",
  "performance/top-slow-endpoints",
  "performance/top-slow-queries",
  "performance/snapshot",
  "web-vitals",
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyObservabilityRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathString = path.join("/");
  if (!allowedPaths.has(pathString)) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }

  const upstreamBase =
    process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://localhost:8080";
  const upstreamUrl = new URL(`/api/observability/${pathString}`, upstreamBase);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");

  const incomingAuthorization = request.headers.get("authorization");
  const bearerSession = incomingAuthorization?.toLowerCase().startsWith("bearer ")
    ? incomingAuthorization.slice(7).trim()
    : undefined;
  const employeeSession = request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session") ?? bearerSession;

  if (employeeSession) {
    headers.set("authorization", `Bearer ${employeeSession}`);
    headers.delete("x-user-id");
  } else if (process.env.DASHBOARD_DEV_USER_ID) {
    headers.set("x-user-id", process.env.DASHBOARD_DEV_USER_ID);
  } else {
    return NextResponse.json(
      { success: false, error: "unauthenticated", message: "Sign in to continue" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const requestBody = request.method !== "GET" && request.method !== "HEAD"
    ? await request.text()
    : undefined;

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: requestBody || undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", "no-store");
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "upstream_unavailable",
        message: error instanceof Error ? error.message : "Failed to connect to backend",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyObservabilityRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyObservabilityRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyObservabilityRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyObservabilityRequest(request, context);
}
