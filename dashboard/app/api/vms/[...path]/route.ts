import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyVmsRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathString = path.join("/");

  const baseCandidates = [
    process.env.CONTROL_PLANE_INTERNAL_URL,
    process.env.CONTROL_PLANE_PUBLIC_URL,
    process.env.CONTROL_PLANE_URL,
    process.env.NEXT_PUBLIC_API_URL,
    (process.env.NODE_ENV === "production" ? "http://control-plane:8080" : "http://localhost:8080"),
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ].filter(Boolean) as string[];
  const uniqueBases = Array.from(new Set(baseCandidates));

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
  }

  const methodHasPotentialBody = request.method !== "GET" && request.method !== "HEAD";
  const requestBody = methodHasPotentialBody ? await request.text() : undefined;

  let lastError: Error | null = null;

  for (const upstreamBase of uniqueBases) {
    try {
      const upstreamUrl = new URL(`/api/vms/${pathString}`, upstreamBase);
      upstreamUrl.search = request.nextUrl.search;

      let response = await fetch(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: requestBody || undefined,
        cache: "no-store",
      });

      // Fallback: If 404, try /v1/vms/... or /v1/observability/...
      if (response.status === 404) {
        const fallbackUrl = new URL(`/v1/vms/${pathString}`, upstreamBase);
        fallbackUrl.search = request.nextUrl.search;
        const secondTry = await fetch(fallbackUrl.toString(), {
          method: request.method,
          headers,
          body: requestBody || undefined,
          cache: "no-store",
        });
        if (secondTry.ok || secondTry.status !== 404) {
          response = secondTry;
        } else if (pathString === "observability/summary") {
          const thirdUrl = new URL("/v1/observability/summary", upstreamBase);
          thirdUrl.search = request.nextUrl.search;
          const thirdTry = await fetch(thirdUrl.toString(), {
            method: request.method,
            headers,
            cache: "no-store",
          });
          if (thirdTry.ok || thirdTry.status !== 404) {
            response = thirdTry;
          }
        }
      }

      const responseHeaders = new Headers();
      const contentType = response.headers.get("content-type");
      if (contentType) responseHeaders.set("content-type", contentType);
      responseHeaders.set("cache-control", "no-store");
      return new NextResponse(await response.arrayBuffer(), {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Try next base
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: "upstream_unavailable",
      message: lastError ? lastError.message : "Failed to connect to backend",
    },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyVmsRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyVmsRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyVmsRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyVmsRequest(request, context);
}
