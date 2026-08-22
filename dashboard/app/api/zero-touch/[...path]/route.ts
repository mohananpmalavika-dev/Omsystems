import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyZeroTouchRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamBase = process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://localhost:8080";

  const upstream = new URL(`/api/zero-touch/${path.join("/")}`, upstreamBase);
  upstream.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  const requestBody = methodHasPotentialBody ? await request.text() : undefined;
  const willSendBody = typeof requestBody === "string" && requestBody.length > 0;

  if (willSendBody) {
    headers.set("content-type", "application/json");
  }

  try {
    const upstreamRes = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body: willSendBody ? requestBody : undefined,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    const bodyBuffer = await upstreamRes.arrayBuffer();
    return new NextResponse(bodyBuffer, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "zero_touch_upstream_unavailable",
      message: error instanceof Error ? error.message : "Failed to connect to zero-touch control plane",
    }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyZeroTouchRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyZeroTouchRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyZeroTouchRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyZeroTouchRequest(request, context);
}
