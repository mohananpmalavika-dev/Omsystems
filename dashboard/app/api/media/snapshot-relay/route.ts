import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Global dynamic frame cache for real camera feeds across all client branches
const globalFrames = globalThis as unknown as { __realCctvFrames?: Map<string, { buffer: Buffer; updatedAt: number }> };
if (!globalFrames.__realCctvFrames) {
  globalFrames.__realCctvFrames = new Map();
}
const frameStore = globalFrames.__realCctvFrames;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetKey = url.searchParams.get("cameraId") || url.searchParams.get("id") || url.searchParams.get("channel") || url.searchParams.get("ch") || "default";

  const cached = frameStore.get(targetKey) || frameStore.get(targetKey.toLowerCase());
  if (cached && cached.buffer.length > 0) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Camera-Id": targetKey,
        "X-Frame-Updated": String(cached.updatedAt),
      },
    });
  }

  return NextResponse.json({ error: "no_frame_available", target: targetKey }, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const targetKey = url.searchParams.get("cameraId") || url.searchParams.get("id") || url.searchParams.get("channel") || url.searchParams.get("ch") || "default";

    const contentType = request.headers.get("content-type") || "";
    let imageBuffer: Buffer;

    if (contentType.includes("application/json")) {
      const body = await request.json() as { cameraId?: string; channel?: number | string; imageBase64?: string; base64?: string };
      const base64Data = body.imageBase64 || body.base64 || "";
      imageBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
    } else {
      const arrayBuffer = await request.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    if (imageBuffer.length > 500) {
      frameStore.set(targetKey, {
        buffer: imageBuffer,
        updatedAt: Date.now(),
      });
      frameStore.set(targetKey.toLowerCase(), {
        buffer: imageBuffer,
        updatedAt: Date.now(),
      });
      return NextResponse.json({ success: true, target: targetKey, size: imageBuffer.length });
    }

    return NextResponse.json({ error: "invalid_frame_data" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "upload_failed" },
      { status: 500 },
    );
  }
}