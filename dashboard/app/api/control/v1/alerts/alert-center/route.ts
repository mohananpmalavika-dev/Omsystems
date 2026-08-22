import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function normalizeHttpOrigin(base: string) {
  const url = new URL(base);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url;
}

export async function GET(request: NextRequest) {
  try {
    const upstreamBase = runtimeEnv(
      ["CONTROL_PLANE_INTERNAL_URL", "CONTROL_PLANE_PUBLIC_URL", "CONTROL_PLANE_URL"],
      "http://localhost:8080",
    );
    const upstream = new URL("/v1/alerts/command-center", normalizeHttpOrigin(upstreamBase));
    upstream.search = request.nextUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    const response = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      cache: "no-store",
    });

    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 502 },
    );
  }
}
