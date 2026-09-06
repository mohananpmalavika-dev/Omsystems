import { NextRequest, NextResponse } from "next/server";
import { QARepository } from "@/lib/qa/qa-repository";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * GET /api/admin/qa/runs/[runId]
 * Retrieve full run details, pages, graph edges, and categorized issues
 */
export async function GET(request: NextRequest, props: RouteParams) {
  try {
    const { runId } = await props.params;
    const repo = QARepository.getInstance();
    const details = await repo.getRunDetails(runId);

    if (!details) {
      return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...details });
  } catch (error: any) {
    console.error("[QA API] Failed to fetch run details:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
