import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listBranches } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("sentinel_access")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Session token required" },
        { status: 401 },
      );
    }
    return NextResponse.json({
      data: await listBranches(sessionToken),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (message.includes("unauthenticated")) {
      return NextResponse.json(
        { error: "unauthenticated", message },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "branches_unavailable" },
      { status: 502 },
    );
  }
}
