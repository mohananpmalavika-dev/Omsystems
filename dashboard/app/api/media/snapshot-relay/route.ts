import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const dynamic = "force-dynamic";

// Global dynamic frame cache for real camera feeds across all client branches
const globalFrames = globalThis as unknown as { __realCctvFrames?: Map<string, { buffer: Buffer; updatedAt: number }> };
if (!globalFrames.__realCctvFrames) {
  globalFrames.__realCctvFrames = new Map();
}
const frameStore = globalFrames.__realCctvFrames;
const FRAME_DIR = join(tmpdir(), "sentinel_cctv_frames");

async function ensureFrameDir() {
  try {
    await fs.mkdir(FRAME_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}
void ensureFrameDir();

function sanitizeKey(k: string): string {
  return k.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetKey = url.searchParams.get("cameraId") || url.searchParams.get("id") || url.searchParams.get("channel") || url.searchParams.get("ch") || "default";

  const now = Date.now();
  
  // Try memory first
  let cached = frameStore.get(targetKey) || frameStore.get(targetKey.toLowerCase());
  
  if (!cached) {
    const chMatch = targetKey.match(/ch(?:annel)?\s*([1-8])/i) || targetKey.match(/ch-?([1-8])/i);
    if (chMatch) {
      const chNum = chMatch[1];
      cached = frameStore.get(`ch${chNum}`) || frameStore.get(`CP PLUS DVR Ch ${chNum}`) || frameStore.get(`192.168.29.171:${chNum}`);
    }
  }

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

  // Fallback to disk cache
  try {
    const diskPath = join(FRAME_DIR, `${sanitizeKey(targetKey)}.jpg`);
    const fileBuf = await fs.readFile(diskPath);
    if (fileBuf && fileBuf.length > 0) {
      return new NextResponse(new Uint8Array(fileBuf), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Camera-Id": targetKey,
          "X-Frame-Updated": String(now),
        },
      });
    }
  } catch {
    // Disk file not found
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
      const entry = {
        buffer: imageBuffer,
        updatedAt: Date.now(),
      };
      frameStore.set(targetKey, entry);
      frameStore.set(targetKey.toLowerCase(), entry);

      // Save to disk asynchronously
      void ensureFrameDir().then(() => {
        const diskPath = join(FRAME_DIR, `${sanitizeKey(targetKey)}.jpg`);
        return fs.writeFile(diskPath, imageBuffer);
      }).catch(() => undefined);

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