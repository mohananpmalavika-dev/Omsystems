import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const globalFrames = globalThis as unknown as { __realCctvFrames?: Map<number, { buffer: Buffer; updatedAt: number }> };
if (!globalFrames.__realCctvFrames) {
  globalFrames.__realCctvFrames = new Map();
}
const frameStore = globalFrames.__realCctvFrames;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const chParam = url.searchParams.get("channel") || url.searchParams.get("ch") || "1";
  const ch = Number(chParam) || 1;

  const cached = frameStore.get(ch);
  if (cached && cached.buffer.length > 0) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-CCTV-Channel": String(ch),
        "X-CCTV-Updated": String(cached.updatedAt),
      },
    });
  }

  return NextResponse.json({ error: "no_frame_available", channel: ch }, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const chParam = url.searchParams.get("channel") || url.searchParams.get("ch") || "1";
    const ch = Number(chParam) || 1;

    const contentType = request.headers.get("content-type") || "";
    let imageBuffer: Buffer;

    if (contentType.includes("application/json")) {
      const body = await request.json() as { channel?: number; imageBase64?: string; base64?: string };
      const base64Data = body.imageBase64 || body.base64 || "";
      imageBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
    } else {
      const arrayBuffer = await request.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    if (imageBuffer.length > 500) {
      frameStore.set(ch, {
        buffer: imageBuffer,
        updatedAt: Date.now(),
      });
      return NextResponse.json({ success: true, channel: ch, size: imageBuffer.length });
    }

    return NextResponse.json({ error: "invalid_frame_data" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "upload_failed" },
      { status: 500 },
    );
  }
}