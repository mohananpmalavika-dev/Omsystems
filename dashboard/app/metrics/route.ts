import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
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

  for (const base of uniqueBases) {
    try {
      const upstreamUrl = new URL("/metrics", base);
      const res = await fetch(upstreamUrl.toString(), {
        method: "GET",
        cache: "no-store",
      });

      if (res.ok) {
        const text = await res.text();
        return new NextResponse(text, {
          status: res.status,
          headers: {
            "content-type": res.headers.get("content-type") ?? "text/plain; version=0.0.4; charset=utf-8",
            "cache-control": "no-store, no-cache",
          },
        });
      }
    } catch {
      // Try next base
    }
  }

  return new NextResponse("# Metrics temporarily unavailable from upstream\n", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
