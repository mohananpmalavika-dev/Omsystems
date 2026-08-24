import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get detailed status for a specific camera to diagnose streaming issues
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  
  try {
    const token = request.cookies.get("sentinel_access")?.value ??
      request.headers.get("x-sentinel-session");
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const upstreamBase = process.env.CONTROL_PLANE_INTERNAL_URL || 
      process.env.CONTROL_PLANE_URL || 
      "http://127.0.0.1:8080";
    
    // Fetch camera details
    const cameraResponse = await fetch(
      `${upstreamBase}/v1/cameras/${encodeURIComponent(id)}`,
      {
        headers,
        cache: "no-store",
      }
    );
    
    if (!cameraResponse.ok) {
      return NextResponse.json(
        { 
          error: "camera_not_found",
          message: `Camera ${id} not found or not accessible`,
          statusCode: cameraResponse.status,
        },
        { status: cameraResponse.status }
      );
    }
    
    const camera = await cameraResponse.json();
    
    // Check camera stream profiles
    const hasMainStream = Boolean(camera.streams?.main || camera.mainStreamUrl);
    const hasSubStream = Boolean(camera.streams?.sub || camera.subStreamUrl);
    
    // Check online status
    const isOnline = camera.onlineStatus === "online" || camera.status === "online";
    const isRecording = camera.recordingStatus === "recording" || camera.isRecording;
    
    // Diagnose issues
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!isOnline) {
      issues.push("Camera is offline - check camera power and network connectivity");
    }
    
    if (!hasMainStream && !hasSubStream) {
      issues.push("No stream profiles configured - camera needs RTSP/stream URL configuration");
    }
    
    if (!hasMainStream) {
      warnings.push("Main stream not configured - only sub-stream available");
    }
    
    if (!hasSubStream) {
      warnings.push("Sub-stream not configured - only main stream available");
    }
    
    if (camera.requiresAuth && !camera.credentials) {
      warnings.push("Camera requires authentication but credentials may not be configured");
    }
    
    // Check if camera has recent health data
    const lastSeen = camera.lastSeen || camera.lastSeenAt;
    if (lastSeen) {
      const lastSeenTime = new Date(lastSeen).getTime();
      const now = Date.now();
      const minutesSinceLastSeen = Math.floor((now - lastSeenTime) / 60000);
      
      if (minutesSinceLastSeen > 5) {
        warnings.push(`Camera hasn't reported health in ${minutesSinceLastSeen} minutes`);
      }
    }
    
    return NextResponse.json({
      cameraId: id,
      name: camera.name,
      status: {
        online: isOnline,
        recording: isRecording,
        health: camera.health || "unknown",
      },
      streams: {
        main: hasMainStream,
        sub: hasSubStream,
        mainUrl: camera.streams?.main || camera.mainStreamUrl || null,
        subUrl: camera.streams?.sub || camera.subStreamUrl || null,
      },
      device: {
        type: camera.sourceType || camera.deviceType,
        model: camera.model,
        manufacturer: camera.manufacturer,
        recorderId: camera.recorderId,
      },
      diagnostics: {
        canStream: isOnline && (hasMainStream || hasSubStream),
        issues,
        warnings,
        lastSeen: lastSeen || null,
      },
      raw: camera, // Include full camera object for debugging
    });
  } catch (error) {
    console.error("Camera status check failed:", error);
    return NextResponse.json(
      {
        error: "status_check_failed",
        message: error instanceof Error ? error.message : "Unknown error",
        cameraId: id,
      },
      { status: 500 }
    );
  }
}
