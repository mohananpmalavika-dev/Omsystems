import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get camera snapshot - proxy to control plane snapshot endpoint
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  
  try {
    const token = request.cookies.get("sentinel_access")?.value ??
      request.headers.get("x-sentinel-session");
    
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      // Use dev user ID as fallback
      const devUserId = process.env.DASHBOARD_DEV_USER_ID;
      if (devUserId) {
        headers["x-user-id"] = devUserId;
      }
    }
    
    const upstreamBase = process.env.CONTROL_PLANE_INTERNAL_URL || 
      process.env.CONTROL_PLANE_URL || 
      "http://127.0.0.1:8080";
    
    // Forward to control plane snapshot endpoint
    const response = await fetch(
      `${upstreamBase}/v1/cameras/${encodeURIComponent(id)}/snapshot`,
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );
    
    if (!response.ok) {
      // Return a default placeholder image or error
      if (response.status === 404) {
        return NextResponse.json(
          { 
            error: "snapshot_not_available",
            message: "Camera snapshot is not available",
            cameraId: id,
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: "snapshot_fetch_failed",
          message: `Failed to fetch snapshot (HTTP ${response.status})`,
          cameraId: id,
        },
        { status: response.status }
      );
    }
    
    // Forward the image response
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Snapshot fetch error:", error);
    
    // Return error response instead of throwing
    return NextResponse.json(
      {
        error: "snapshot_unavailable",
        message: error instanceof Error ? error.message : "Unknown error",
        cameraId: id,
      },
      { status: 502 }
    );
  }
}
