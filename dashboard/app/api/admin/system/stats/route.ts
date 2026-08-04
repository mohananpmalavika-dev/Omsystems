import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 'http://localhost:8080';
    
    // Fetch camera count
    const cameraResponse = await fetch(`${controlPlaneUrl}/v1/admin/cameras/count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let stats = {
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    };

    if (cameraResponse.ok) {
      const cameraData = await cameraResponse.json();
      stats.cameras = parseInt(cameraData.total_cameras) || 0;
    }

    // TODO: Add queries for other stats (gateways, branches, etc.)
    // For now, returning cameras count only

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    });
  }
}
