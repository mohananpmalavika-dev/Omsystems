import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyApiV1Request(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathString = path.join("/");

  // 1. Direct handling for telemetry analytics ingestion
  if (pathString === "analytics") {
    try {
      if (request.method === "POST") {
        await request.text().catch(() => "");
      }
    } catch {}
    return NextResponse.json(
      { success: true, receivedAt: new Date().toISOString() },
      { status: 200, headers: { "cache-control": "no-store, private" } }
    );
  }

  const upstreamBase =
    process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://localhost:8080";

  // Try /api/v1/... first, then fallback to /v1/...
  const upstreamUrl = new URL(`/api/v1/${pathString}`, upstreamBase);
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
  } else if (pathString.startsWith("auth/")) {
    headers.delete("authorization");
    headers.delete("x-user-id");
  } else if (headers.get("authorization")?.toLowerCase().startsWith("basic ")) {
    headers.delete("authorization");
  }
  if (!employeeSession && !pathString.startsWith("auth/") && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "unauthenticated", message: "Sign in to continue" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (!employeeSession && !pathString.startsWith("auth/") && process.env.NODE_ENV !== "production") {
    headers.set("x-user-id", process.env.DASHBOARD_DEV_USER_ID || "user-global-admin");
  }

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  const requestBody = methodHasPotentialBody ? await request.text() : undefined;
  const willSendBody = typeof requestBody === "string" && requestBody.length > 0;

  if (willSendBody) {
    headers.set("content-type", "application/json");
  }

  try {
    let upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: willSendBody ? requestBody : undefined,
      cache: "no-store",
    });

    // If /api/v1/... returned 404, try /v1/...
    if (upstreamRes.status === 404) {
      const fallbackUrl = new URL(`/v1/${pathString}`, upstreamBase);
      fallbackUrl.search = request.nextUrl.search;
      const secondTry = await fetch(fallbackUrl.toString(), {
        method: request.method,
        headers,
        body: willSendBody ? requestBody : undefined,
        cache: "no-store",
      });
      if (secondTry.ok || secondTry.status !== 404) {
        upstreamRes = secondTry;
      }
    }

    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    const bodyBuffer = await upstreamRes.arrayBuffer();
    const outgoing = new NextResponse(bodyBuffer, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });

    if (upstreamRes.ok && (pathString === "auth/login" || pathString === "auth/refresh")) {
      try {
        const text = new TextDecoder().decode(bodyBuffer);
        const payload = JSON.parse(text) as { accessToken?: string; refreshToken?: string; expiresIn?: number };
        const isHttps =
          process.env.NODE_ENV === "production" ||
          request.nextUrl.protocol === "https:" ||
          request.headers.get("x-forwarded-proto") === "https" ||
          request.headers.get("origin")?.startsWith("https:") ||
          request.headers.get("referer")?.startsWith("https:");
        if (payload.accessToken) {
          outgoing.cookies.set("sentinel_access", payload.accessToken, {
            httpOnly: true,
            sameSite: isHttps ? "none" : "lax",
            secure: isHttps,
            partitioned: isHttps,
            path: "/",
            maxAge: payload.expiresIn || 86400,
          });
        }
        if (payload.refreshToken) {
          outgoing.cookies.set("sentinel_refresh", payload.refreshToken, {
            httpOnly: true,
            sameSite: isHttps ? "none" : "lax",
            secure: isHttps,
            partitioned: isHttps,
            path: "/",
            maxAge: 30 * 24 * 60 * 60,
          });
        }
      } catch {}
    }

    return outgoing;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "upstream_unavailable",
        message: error instanceof Error ? error.message : "Failed to connect to backend",
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyApiV1Request(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyApiV1Request(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyApiV1Request(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyApiV1Request(request, context);
}
