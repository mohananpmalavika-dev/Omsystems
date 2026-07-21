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
    "CONTROL_PLANE_INTERNAL_URL",
    "http://localhost:8080",
  );
  const upstream = new URL(`/${path.join("/")}`, upstreamBase);
  upstream.search = request.nextUrl.search;

  const routePath = `/${path.join("/")}`;
  const employeeSession = request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session");
  const bridgeKey = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  const headers = new Headers({ "content-type": "application/json" });
  if (bridgeKey) headers.set("x-edge-bridge-key", bridgeKey);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  if (employeeSession) {
    headers.set("authorization", `Bearer ${employeeSession}`);
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
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: requestBody,
      cache: "no-store",
    });
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
    if (routePath === "/v1/auth/logout" && response.ok) {
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
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause
      : undefined;
    console.error("Control-plane proxy request failed", {
      message: error instanceof Error ? error.message : "unknown error",
      cause: cause?.message,
      code: cause && "code" in cause ? cause.code : undefined,
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

function runtimeEnv(name: string, fallback: string) {
  return (Reflect.get(process.env, name) as string | undefined) ?? fallback;
}
