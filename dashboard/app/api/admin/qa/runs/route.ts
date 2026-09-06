import { NextRequest, NextResponse } from "next/server";
import { QARepository } from "@/lib/qa/qa-repository";
import { QAWorkerPool } from "../../../../../../qa-engine/src/workers/qa-worker-pool";
import type { QARunConfig } from "../../../../../../qa-engine/src/types/qa.types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/qa/runs
 * List all automated QA runs
 */
export async function GET() {
  try {
    const repo = QARepository.getInstance();
    const runs = await repo.listRuns();
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    console.error("[QA API] Failed to list runs:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/qa/runs
 * Launch a new automated QA audit run
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.targetUrl) {
      return NextResponse.json({ success: false, error: "Target URL is required" }, { status: 400 });
    }

    const runId = `QA-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const config: QARunConfig = {
      id: runId,
      targetUrl: body.targetUrl,
      startingPath: body.startingPath || "/",
      username: body.username,
      password: body.password,
      userRole: body.userRole || "Admin",
      browser: body.browser || "chromium",
      deviceProfile: body.deviceProfile || "Desktop 1920x1080",
      maxPages: Number(body.maxPages) || 250,
      maxDepth: Number(body.maxDepth) || 10,
      pageTimeoutSec: Number(body.pageTimeoutSec) || 30,
      options: body.options || {},
    };

    const repo = QARepository.getInstance();
    const created = await repo.createRun(config);

    // Launch worker via pool
    const pool = QAWorkerPool.getInstance();
    pool.startWorker(config, async (result) => {
      await repo.updateRun(runId, {
        status: result.status,
        overallScore: result.score,
        summaryStats: result.summary,
        completedAt: new Date().toISOString(),
      });

      if (result.entities) {
        await repo.saveRunEntities(runId, result.entities);
      }
    });

    return NextResponse.json({ success: true, runId, run: created });
  } catch (error: any) {
    console.error("[QA API] Failed to create run:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
