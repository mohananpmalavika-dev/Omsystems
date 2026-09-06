import { NextRequest, NextResponse } from "next/server";
import { QAWorkerPool } from "../../../../../../../../qa-engine/src/workers/qa-worker-pool";
import { QARepository } from "@/lib/qa/qa-repository";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * POST /api/admin/qa/runs/[runId]/actions
 * Trigger lifecycle actions: pause, resume, cancel, retry
 */
export async function POST(request: NextRequest, props: RouteParams) {
  try {
    const { runId } = await props.params;
    const { action } = await request.json();

    const pool = QAWorkerPool.getInstance();
    const repo = QARepository.getInstance();

    if (action === "pause") {
      const paused = pool.pauseWorker(runId);
      if (paused) {
        await repo.updateRun(runId, { status: "PAUSED" });
      }
      return NextResponse.json({ success: paused });
    }

    if (action === "resume") {
      const resumed = pool.resumeWorker(runId);
      if (resumed) {
        await repo.updateRun(runId, { status: "CRAWLING" });
      }
      return NextResponse.json({ success: resumed });
    }

    if (action === "cancel") {
      const cancelled = await pool.cancelWorker(runId);
      await repo.updateRun(runId, { status: "CANCELLED", completedAt: new Date().toISOString() });
      return NextResponse.json({ success: cancelled });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[QA Actions API] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
