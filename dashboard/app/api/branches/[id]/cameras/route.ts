import { NextResponse } from "next/server";
import { listCameras } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ data: await listCameras(id) });
  } catch {
    return NextResponse.json(
      { error: "cameras_unavailable" },
      { status: 502 },
    );
  }
}
