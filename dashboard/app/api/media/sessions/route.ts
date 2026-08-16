import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sessionRequestSchema = z.object({
  cameraId: z.string(),
  branchId: z.string().default("default-branch"),
  purpose: z.enum(["MONITORING", "INVESTIGATION", "INCIDENT", "PLAYBACK"]).default("MONITORING"),
  preferredQuality: z.enum(["AUTO", "SUBSTREAM", "MAINSTREAM"]).default("AUTO"),
  priority: z.number().default(0),
  clientCapabilities: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = sessionRequestSchema.parse(await request.json());
    const sessionId = `media-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + 300_000).toISOString();

    const mediaSession = {
      id: sessionId,
      sessionId,
      cameraId: body.cameraId,
      branchId: body.branchId,
      purpose: body.purpose,
      quality: body.preferredQuality === "MAINSTREAM" ? "MAINSTREAM" : "SUBSTREAM",
      state: "ACTIVE",
      transport: "HLS",
      hls: {
        url: `/api/media/streams/${encodeURIComponent(body.cameraId)}/index.m3u8`,
        bearerToken: `token-${sessionId}`,
      },
      webRtc: {
        whepUrl: `/api/media/webrtc/${encodeURIComponent(body.cameraId)}`,
        bearerToken: `token-${sessionId}`,
      },
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(
      {
        success: true,
        session: mediaSession,
        degraded: false,
        message: "Live media session established",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Media session creation error:", error);
    return NextResponse.json(
      {
        error: "session_creation_failed",
        message: error instanceof Error ? error.message : "Failed to create media session",
      },
      { status: 400 },
    );
  }
}
