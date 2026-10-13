import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyMobileRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  if (path[0] !== "v1" || path.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
    return NextResponse.json({ success: false, error: "invalid_mobile_path" }, { status: 400 });
  }
  const pathString = path.join("/");

  const upstreamBase =
    process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://control-plane:8080";

  const upstreamUrl = new URL(`/api/mobile/${pathString}`, upstreamBase);
  upstreamUrl.search = request.nextUrl.search;

  // Forward only public request metadata; browser-supplied identities and service keys are untrusted.
  const headers = new Headers();
  for (const name of ["accept", "content-type", "last-event-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const incomingAuthorization = request.headers.get("authorization");
  const bearerSession = incomingAuthorization?.toLowerCase().startsWith("bearer ")
    ? incomingAuthorization.slice(7).trim()
    : undefined;
  const employeeSession =
    request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session") ??
    bearerSession;

  if (!employeeSession) {
    return NextResponse.json({ success: false, error: "unauthenticated", message: "Sign in to continue." },
      { status: 401, headers: { "cache-control": "no-store" } });
  }
  headers.set("authorization", `Bearer ${employeeSession}`);

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  // A cookie translated into bearer credentials remains an ambient browser credential.
  if (methodHasPotentialBody && request.cookies.get("sentinel_access")?.value) {
    const origin = request.headers.get("origin");
    if (origin ? origin !== request.nextUrl.origin : request.headers.get("sec-fetch-site") !== "same-origin") {
      return NextResponse.json({ success: false, error: "cross_origin_mobile_request" }, { status: 403 });
    }
  }
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
      signal: request.signal,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    responseHeaders.set("cache-control", "no-store");
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
    return NextResponse.json(
      { success: false, error: "mobile_upstream_unavailable", message: "Mobile operations service currently unreachable" },
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
