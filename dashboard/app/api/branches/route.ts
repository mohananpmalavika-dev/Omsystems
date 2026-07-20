import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listBranches } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      data: await listBranches(request.cookies.get("sentinel_access")?.value),
    });
  } catch {
    return NextResponse.json(
      { error: "branches_unavailable" },
      { status: 502 },
    );
  }
}
