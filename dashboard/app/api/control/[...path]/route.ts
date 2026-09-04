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
    ["CONTROL_PLANE_INTERNAL_URL"],
    "http://127.0.0.1:8080",
  );
  const upstream = new URL(`/${path.join("/")}`, normalizeHttpOrigin(upstreamBase));
  upstream.search = request.nextUrl.search;

  const routePath = `/${path.join("/")}`;
  const incomingAuthorization = request.headers.get("authorization");
  const bearerSession = incomingAuthorization?.toLowerCase().startsWith("bearer ")
    ? incomingAuthorization.slice(7).trim()
    : undefined;
  // The BFF-owned HttpOnly cookie is the authoritative browser session. A
  // legacy JavaScript-readable header is used only by non-browser clients;
  // allowing it to win would let a stale localStorage value override a newly
  // refreshed cookie and produce repeated 401 responses after sign-in.
  const employeeSession = request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session") ??
    bearerSession;
  const edgeAgentToken = request.headers.get("x-edge-agent-token");
  const isEdgeEnrollment = routePath === "/v1/edge-enrollment/activate";
  const isEdgeAgentRequest = Boolean(edgeAgentToken) || isEdgeEnrollment;
  const isPublicControlRoute = isPublicControlPath(routePath) ||
    routePath.startsWith("/v1/edge-updates/artifacts/");
  const bridgeKey = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  // Preserve incoming headers so upstream can honor Accept and other request metadata.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("te");
  headers.set("x-sentinel-public-api-base", publicControlApiBase(request));

  if (bridgeKey) headers.set("x-edge-bridge-key", bridgeKey);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  if (isEdgeAgentRequest) {
    headers.delete("authorization");
    headers.delete("x-user-id");
  } else if (isPublicControlRoute) {
    // Login and refresh must not inherit an expired access cookie/header.
    // The refresh token is copied into the request body below instead.
    headers.delete("authorization");
    headers.delete("x-user-id");
  } else if (employeeSession) {
    headers.set("authorization", `Bearer ${employeeSession}`);
    headers.delete("x-user-id");
  } else {
    // Render's optional dashboard Basic Auth also arrives in this header. It
    // authenticates the browser to Next.js, not the employee to the control
    // plane, and forwarding it makes the upstream reject an otherwise valid
    // development-identity request with 401.
    if (headers.get("authorization")?.toLowerCase().startsWith("basic ")) {
      headers.delete("authorization");
    }
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "unauthenticated", message: "Sign in to continue" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const developmentUserId = runtimeEnv("DASHBOARD_DEV_USER_ID", "user-global-admin");
    if (developmentUserId) headers.set("x-user-id", developmentUserId);
  }

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  const requestContentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let requestBody = methodHasPotentialBody ? await request.text() : undefined;
  if (
    typeof requestBody === "string" &&
    requestContentType.startsWith("application/x-www-form-urlencoded")
  ) {
    requestBody = JSON.stringify(Object.fromEntries(new URLSearchParams(requestBody)));
  }
  if (routePath === "/v1/auth/refresh") {
    const refreshToken = request.cookies.get("sentinel_refresh")?.value;
    if (refreshToken) requestBody = JSON.stringify({ refreshToken });
  }

  // Only include Content-Type and send a body when the body is non-empty
  const willSendBody = typeof requestBody === "string" && requestBody.length > 0;
  if (willSendBody) {
    headers.set("content-type", "application/json");
  } else {
    headers.delete("content-type");
  }

  try {
    const upstreamUrl = upstream.toString();
    const fetchOptions: any = {
      method: request.method,
      headers,
      cache: "no-store",
    };
    if (willSendBody) fetchOptions.body = requestBody;
    const response = await fetch(upstreamUrl, fetchOptions);

    if (routePath === "/v1/digital-twin/branches" && response.status === 404) {
      return Response.json([], { status: 200, headers: { "cache-control": "no-store" } });
    }

    if (routePath === "/v1/operations/branches" && !response.ok) {
      return Response.json({ success: true, count: 0, data: [] }, { status: 200, headers: { "cache-control": "no-store" } });
    }

    if (routePath.endsWith("/install.ps1")) {
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "text/plain; charset=utf-8",
          "cache-control": "no-store, private",
        },
      });
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
      const isHttps = requestIsHttps(request);
      // Do NOT set maxAge: browsers treat cookies without maxAge/expires as RFC 6265 Session Cookies
      // which are automatically destroyed by the browser when the user closes the browser.
      outgoing.cookies.set("sentinel_access", payload.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps,
        path: "/",
      });
      if (payload.refreshToken) {
        outgoing.cookies.set("sentinel_refresh", payload.refreshToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: isHttps,
          path: "/",
        });
      }
      return outgoing;

    }

    const isLogout = routePath === "/v1/auth/logout" || routePath === "/v1/auth/logout-all";
    const isCurrentRevoked = response.headers.get("x-sentinel-current-session-revoked") === "true";
    if ((isLogout || isCurrentRevoked) && response.ok) {
      const outgoing = new NextResponse(response.body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
          ...(isCurrentRevoked ? { "x-sentinel-current-session-revoked": "true" } : {}),
        },
      });
      outgoing.cookies.set("sentinel_access", "", { path: "/", maxAge: 0 });
      outgoing.cookies.set("sentinel_refresh", "", { path: "/", maxAge: 0 });
      return outgoing;
    }

    if (response.status === 204 || response.status === 205 || response.status === 304) {
      return new Response(null, {
        status: response.status,
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const responseType = response.headers.get("content-type") ?? "application/json";
    const contentDisposition = response.headers.get("content-disposition");
    const contentLength = response.headers.get("content-length");
    const contentEncoding = response.headers.get("content-encoding");

    const outgoingHeaders = {
      "content-type": responseType,
      "cache-control": responseType.startsWith("text/event-stream") ? "no-cache, no-transform" : "no-store",
      ...(contentDisposition ? { "content-disposition": contentDisposition } : {}),
      ...(contentLength && !contentEncoding ? { "content-length": contentLength } : {}),
      ...(responseType.startsWith("text/event-stream") ? { "x-accel-buffering": "no" } : {}),
    };

    return new Response(response.body, {
      status: response.status,
      headers: outgoingHeaders,
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
    if (routePath === "/v1/operations/branches") {
      return Response.json({ success: true, count: 0, data: [] }, { status: 200, headers: { "cache-control": "no-store" } });
    }
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

function isPublicControlPath(routePath: string) {
  return new Set([
    "/v1/auth/login",
    "/v1/auth/refresh",
    "/v1/auth/forgot-password",
    "/v1/auth/request-password-reset",
    "/v1/auth/verify-otp",
    "/v1/auth/reset-password",
    "/v1/auth/reset-password-otp",
  ]).has(routePath);
}

function publicControlApiBase(request: NextRequest) {
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const candidates = [
    forwardedHost ? `${forwardedProtocol || "https"}://${forwardedHost}` : undefined,
    request.headers.get("origin") ?? undefined,
    request.headers.get("host")
      ? `${forwardedProtocol || request.nextUrl.protocol.replace(":", "") || "https"}://${request.headers.get("host")}`
      : undefined,
    runtimeEnv("RENDER_EXTERNAL_URL", "") || undefined,
    request.nextUrl.origin,
  ];

  for (const candidate of candidates) {
    const publicOrigin = validPublicOrigin(candidate);
    if (publicOrigin) return new URL("/api/control", publicOrigin).toString();
  }
  throw new Error("Unable to determine the public KryptonVision URL");
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

/**
 * Mark session cookies Secure only when this request actually arrived over
 * HTTPS. A production Next build can also run on an on-premise HTTP address;
 * forcing Secure there causes browsers to discard the login cookies and every
 * subsequent protected request to return 401.
 */
function requestIsHttps(request: NextRequest) {
  return request.nextUrl.protocol === "https:" ||
    firstForwardedValue(request.headers.get("x-forwarded-proto")) === "https" ||
    request.headers.get("origin")?.startsWith("https:") ||
    request.headers.get("referer")?.startsWith("https:");
}

function validPublicOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.hostname === "0.0.0.0" || url.hostname === "::" || url.hostname === "[::]") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
