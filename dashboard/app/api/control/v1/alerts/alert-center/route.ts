import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/control/v1/alerts/alert-center
 * 
 * Returns alerts for the alert command center dashboard.
 * Currently returns an empty array as a placeholder.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "200");
    
    // TODO: Implement actual alert fetching from the control plane
    // For now, return empty array to prevent 404 errors
    
    return NextResponse.json({
      data: [],
      total: 0,
      limit,
    });
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}
