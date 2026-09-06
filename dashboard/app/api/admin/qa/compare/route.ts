import { NextRequest, NextResponse } from "next/server";
import { QARepository } from "@/lib/qa/qa-repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/qa/compare?base=[id]&target=[id]
 * Compare two QA runs to identify new issues, resolved issues, and performance shifts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const baseId = searchParams.get("base");
    const targetId = searchParams.get("target");

    if (!baseId || !targetId) {
      return NextResponse.json({ success: false, error: "base and target run IDs required" }, { status: 400 });
    }

    const repo = QARepository.getInstance();
    const baseRun = await repo.getRunDetails(baseId);
    const targetRun = await repo.getRunDetails(targetId);

    if (!baseRun || !targetRun) {
      return NextResponse.json({ success: false, error: "One or both runs not found" }, { status: 404 });
    }

    // Compare issues
    const baseIssueTitles = new Set(baseRun.issues.map((i: any) => i.title));
    const targetIssueTitles = new Set(targetRun.issues.map((i: any) => i.title));

    const newIssues = targetRun.issues.filter((i: any) => !baseIssueTitles.has(i.title));
    const resolvedIssues = baseRun.issues.filter((i: any) => !targetIssueTitles.has(i.title));

    // Compare pages
    const basePagePaths = new Set(baseRun.pages.map((p: any) => p.path));
    const targetPagePaths = new Set(targetRun.pages.map((p: any) => p.path));

    const newPages = targetRun.pages.filter((p: any) => !basePagePaths.has(p.path));
    const removedPages = baseRun.pages.filter((p: any) => !targetPagePaths.has(p.path));

    // Compare scores
    const scoreDiff = (targetRun.run.overall_score || 0) - (baseRun.run.overall_score || 0);

    return NextResponse.json({
      success: true,
      comparison: {
        baseRun: {
          id: baseRun.run.id,
          score: baseRun.run.overall_score,
          createdAt: baseRun.run.created_at,
        },
        targetRun: {
          id: targetRun.run.id,
          score: targetRun.run.overall_score,
          createdAt: targetRun.run.created_at,
        },
        scoreDiff,
        newIssues,
        resolvedIssues,
        newPages,
        removedPages,
      },
    });
  } catch (error: any) {
    console.error("[QA Compare API] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
