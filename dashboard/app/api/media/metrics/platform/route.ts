import { NextResponse } from "next/server";
import type { PlatformCapacityMetrics } from "@/lib/media-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics: PlatformCapacityMetrics = {
    branchesEnrolled: 1,
    camerasEnrolled: 12,
    camerasCurrentlyOnline: 12,
    activeHoMediaSessions: 12,
    activeMainStreams: 0,
    activeSubstreams: 12,
    currentHoBandwidthMbps: 24.5,
    configuredMediaBudgetMbps: 100.0,
  };
  return NextResponse.json(metrics);
}
