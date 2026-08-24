import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const relayUrl = new URL("/api/media/snapshot-relay", request.url);
  relayUrl.searchParams.set("cameraId", id);
  return NextResponse.rewrite(relayUrl);
}
