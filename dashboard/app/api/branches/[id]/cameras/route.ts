import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCameras } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json({
      data: await listCameras(
        id,
        request.cookies.get("sentinel_access")?.value,
      ),
    });
  } catch {
    return NextResponse.json(
      { error: "cameras_unavailable" },
      { status: 502 },
    );
  }
}
