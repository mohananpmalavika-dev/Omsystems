import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyControlRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  if (
    path[0] !== "v1" ||
    path.some((segment) => segment === "." || segment === "..")
  ) {
    return Response.json({ error: "invalid_control_path" }, { status: 400 });
  }

  const upstreamBase = runtimeEnv(
    ["CONTROL_PLANE_INTERNAL_URL", "CONTROL_PLANE_PUBLIC_URL"],
    "http://localhost:8080",
  );
  const upstream = new URL(`/${path.join("/")}`, normalizeHttpOrigin(upstreamBase));
  upstream.search = request.nextUrl.search;

  const routePath = `/${path.join("/")}`;
  const employeeSession = request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session");
  const bridgeKey = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  const headers = new Headers();
  if (bridgeKey) headers.set("x-edge-bridge-key", bridgeKey);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  if (employeeSession) {
    // Forward the sentinel access token as a Bearer authorization header to upstream control plane
    headers.set("authorization", 'Bearer ' + employeeSession)
  } else {
    headers.set(
      "x-user-id",
      runtimeEnv("DASHBOARD_DEV_USER_ID", "user-global-admin"),
    );
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let requestBody = hasBody ? await request.text() : undefined;
  if (routePath === "/v1/auth/refresh") {
    const refreshToken = request.cookies.get("sentinel_refresh")?.value;
    if (refreshToken) requestBody = JSON.stringify({ refreshToken });
  }
  // Only set content-type header when there is a body to send
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  try {
    const upstreamUrl = upstream.toString();
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: requestBody,
      cache: "no-store",
    });

    if (routePath === "/v1/digital-twin/branches" && response.status === 404) {
      return Response.json([], { status: 200, headers: { "cache-control": "no-store" } });
    }

    if (
      response.ok &&
      (routePath === "/v1/auth/login" || routePath === "/v1/auth/refresh")
    ) {
      const payload = await response.json() as {
        accessToken: string;
        refreshToken?: string;
        expiresIn: number;
        tokenType: string;
        user?: unknown;
      };
      const publicPayload = {
        expiresIn: payload.expiresIn,
        tokenType: payload.tokenType,
        ...(payload.user ? { user: payload.user } : {}),
      };
      const outgoing = NextResponse.json(publicPayload, {
        status: response.status,
        headers: { "cache-control": "no-store" },
      });
      const secure = request.nextUrl.protocol === "https:";
      outgoing.cookies.set("sentinel_access", payload.accessToken, {
        httpOnly: true,
        sameSite: "strict",
        secure,
        path: "/",
        maxAge: payload.expiresIn,
      });
      if (payload.refreshToken) {
        outgoing.cookies.set("sentinel_refresh", payload.refreshToken, {
          httpOnly: true,
          sameSite: "strict",
          secure,
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
        });
      }
      return outgoing;
    }
    if ((routePath === "/v1/auth/logout" || routePath === "/v1/auth/logout-all") && response.ok) {
      const outgoing = new NextResponse(response.body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
      outgoing.cookies.delete("sentinel_access");
      outgoing.cookies.delete("sentinel_refresh");
      return outgoing;
    }
    const responseType = response.headers.get("content-type") ?? "application/json";
    const contentDisposition = response.headers.get("content-disposition");
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": responseType,
        "cache-control": responseType.startsWith("text/event-stream") ? "no-cache, no-transform" : "no-store",
        ...(contentDisposition ? { "content-disposition": contentDisposition } : {}),
        ...(responseType.startsWith("text/event-stream") ? { "x-accel-buffering": "no" } : {}),
      },
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause
      : undefined;
    console.error("Control-plane proxy request failed", {
      method: request.method,
      routePath,
      upstream: upstream.toString(),
      message: error instanceof Error ? error.message : "unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      cause: cause?.message,
      causeCode: cause && "code" in cause ? cause.code : undefined,
    });
    return Response.json(
      { error: "control_plane_unavailable" },
      { status: 502 },
    );
  }
}

export const GET = proxyControlRequest;
export const POST = proxyControlRequest;
export const PUT = proxyControlRequest;
export const PATCH = proxyControlRequest;
export const DELETE = proxyControlRequest;

function runtimeEnv(name: string | string[], fallback: string) {
  if (Array.isArray(name)) {
    for (const key of name) {
      const value = Reflect.get(process.env, key) as string | undefined;
      if (value) return value;
    }
    return fallback;
  }
  return (Reflect.get(process.env, name) as string | undefined) ?? fallback;
}

function normalizeHttpOrigin(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}
