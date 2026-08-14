import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startTalk } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(await request.json());
    return NextResponse.json(await startTalk(cameraId, sessionToken), { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? publicTalkError(error.message) : "talkback_unavailable";
    return NextResponse.json({ error: code }, { status: talkStatus(code) });
  }
}

function publicTalkError(message: string) {
  for (const code of [
    "talkback_not_supported", "talkback_busy", "device_credentials_rejected",
    "invalid_talk_session", "stream_secret_unavailable", "talkback_unavailable_in_demo",
  ]) if (message.includes(code)) return code;
  if (message.includes("403")) return "forbidden";
  return "talkback_unavailable";
}

function talkStatus(code: string) {
  if (code === "forbidden") return 403;
  if (code === "talkback_busy") return 409;
  if (code === "talkback_not_supported") return 422;
  if (code === "device_credentials_rejected") return 401;
  return 502;
}
