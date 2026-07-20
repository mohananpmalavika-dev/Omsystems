import { NextResponse } from "next/server";
import { listBranches } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await listBranches() });
  } catch {
    return NextResponse.json(
      { error: "branches_unavailable" },
      { status: 502 },
    );
  }
}
