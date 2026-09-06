import { NextRequest } from "next/server";
import { QAWorkerPool } from "../../../../../../../../qa-engine/src/workers/qa-worker-pool";
import type { QARunProgressEvent } from "../../../../../../../../qa-engine/src/types/qa.types";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * GET /api/admin/qa/runs/[runId]/live
 * Server-Sent Events (SSE) stream for real-time crawler progress
 */
export async function GET(request: NextRequest, props: RouteParams) {
  const { runId } = await props.params;
  const pool = QAWorkerPool.getInstance();

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connected event
  const initialEvent = `data: ${JSON.stringify({
    type: "connected",
    runId,
    message: "Live telemetry stream established",
    timestamp: new Date().toISOString(),
  })}\n\n`;
  writer.write(encoder.encode(initialEvent)).catch(() => {});

  // Subscribe to worker events
  const unsubscribe = pool.subscribeProgress(runId, (event: QARunProgressEvent) => {
    const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(sseMessage)).catch(() => {});
  });

  // Handle client disconnect
  request.signal.addEventListener("abort", () => {
    unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
