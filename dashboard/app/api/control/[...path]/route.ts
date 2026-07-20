import type { NextRequest } from "next/server";

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

  const employeeSession = request.headers.get("x-sentinel-session");
  const bridgeKey = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  const headers = new Headers({ "content-type": "application/json" });
  if (bridgeKey) headers.set("x-edge-bridge-key", bridgeKey);
  if (employeeSession) {
    headers.set("authorization", `Bearer ${employeeSession}`);
  } else {
    headers.set(
      "x-user-id",
      runtimeEnv("DASHBOARD_DEV_USER_ID", "user-global-admin"),
    );
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
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
