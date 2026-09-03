import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { checkCameraAccess } from "../../../../lib/backend";
import { getLiveSessionToken } from "../../../../lib/live-auth";

export const dynamic = "force-dynamic";

// Read-only compatibility cache. A frame is returned only after the current
// employee passes the control plane's normal camera access check.
const globalFrames = globalThis as unknown as { __realCctvFrames?: Map<string, { buffer: Buffer; updatedAt: number }> };
if (!globalFrames.__realCctvFrames) {
  globalFrames.__realCctvFrames = new Map();
}
const frameStore = globalFrames.__realCctvFrames;
const FRAME_DIR = join(tmpdir(), "sentinel_cctv_frames");

function frameFileName(cameraId: string): string {
  return `${createHash("sha256").update(cameraId).digest("hex")}.jpg`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetKey = (url.searchParams.get("cameraId") || url.searchParams.get("id") || "").trim();
  if (!targetKey || targetKey.length > 200) {
    return NextResponse.json({ error: "camera_id_required" }, { status: 400 });
  }

  const sessionToken = getLiveSessionToken({
    cookieToken: request.cookies.get("sentinel_access")?.value,
    sentinelSession: request.headers.get("x-sentinel-session"),
    authorization: request.headers.get("authorization"),
  });
  if (!sessionToken && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const access = await checkCameraAccess(targetKey, sessionToken);
    if (!access.allowed) {
      return NextResponse.json({ error: "camera_access_denied" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "camera_authorization_unavailable" }, { status: 503 });
  }

  const now = Date.now();

  // Try memory first
  const cached = frameStore.get(targetKey);

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
    const diskPath = join(FRAME_DIR, frameFileName(targetKey));
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

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  return NextResponse.json(
    { error: "snapshot_upload_not_supported" },
    { status: 405, headers: { Allow: "GET" } },
  );
}
