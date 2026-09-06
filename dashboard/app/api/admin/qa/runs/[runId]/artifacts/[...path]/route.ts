import { NextRequest, NextResponse } from "next/server";
import { join, resolve } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ runId: string; path: string[] }>;
};

/**
 * GET /api/admin/qa/runs/[runId]/artifacts/[...path]
 * Serve or download generated reports, traces, screenshots, and videos
 */
export async function GET(request: NextRequest, props: RouteParams) {
  try {
    const { runId, path } = await props.params;
    const subPath = path.join("/");

    const baseDir = resolve(process.cwd(), "qa-artifacts", `run-${runId}`);
    const filePath = join(baseDir, subPath);

    // Prevent directory traversal
    if (!filePath.startsWith(baseDir) || !existsSync(filePath)) {
      return new NextResponse("Artifact not found", { status: 404 });
    }

    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      return new NextResponse("Invalid file path", { status: 400 });
    }

    const buffer = readFileSync(filePath);

    let contentType = "application/octet-stream";
    if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".json")) contentType = "application/json";
    else if (filePath.endsWith(".webm")) contentType = "video/webm";
    else if (filePath.endsWith(".png")) contentType = "image/png";
    else if (filePath.endsWith(".zip")) contentType = "application/zip";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    return new NextResponse("Failed to read artifact", { status: 500 });
  }
}
