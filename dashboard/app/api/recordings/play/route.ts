import type { NextRequest } from "next/server";
import { getRecordingSegment } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const segmentId = request.nextUrl.searchParams.get("segmentId");
  if (!segmentId) return Response.json({ error: "segment_id_required" }, { status: 400 });
  try {
    const segment = await getRecordingSegment(
      segmentId,
      request.cookies.get("sentinel_access")?.value,
    );
    if (segment.status !== "ready") {
      return Response.json({ error: "recording_segment_unavailable" }, { status: 409 });
    }
    const engineBase = runtimeEnv("RECORDING_ENGINE_INTERNAL_URL");
    const engineKey = runtimeEnv("RECORDING_ENGINE_SHARED_KEY");
    if (!engineBase || !engineKey) {
      return Response.json({ error: "recording_playback_not_configured" }, { status: 503 });
    }
    const upstreamUrl = new URL("/internal/segments", engineBase);
    upstreamUrl.searchParams.set("path", segment.storagePath);
    const range = request.headers.get("range");
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "x-recording-engine-key": engineKey,
        ...(range ? { range } : {}),
      },
      cache: "no-store",
    });
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      "accept-ranges": upstream.headers.get("accept-ranges") ?? "bytes",
    });
    for (const name of ["content-length", "content-range"] as const) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "recording_playback_unavailable" }, { status: 502 });
  }
}

function runtimeEnv(name: string) {
  return Reflect.get(process.env, name) as string | undefined;
}
