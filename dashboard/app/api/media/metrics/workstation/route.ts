import { NextResponse } from "next/server";
import type { WorkstationCapacityMetrics } from "@/lib/media-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics: WorkstationCapacityMetrics = {
    gridPositions: 16,
    activeDecoders: 12,
    liveCameras: 12,
    snapshotCameras: 0,
    decoderLoadPercent: 35,
    estimatedCapacityClass: "HIGH",
  };
  return NextResponse.json(metrics);
}
