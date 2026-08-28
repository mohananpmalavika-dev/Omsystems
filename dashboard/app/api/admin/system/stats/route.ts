import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    'http://localhost:8080';
  const headers = buildControlPlaneHeaders(request, { 'content-type': 'application/json' });
  if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const [camerasResponse, branchesResponse, gatewaysResponse] = await Promise.all([
      fetch(`${controlPlaneUrl}/v1/admin/cameras/count`, { headers, cache: 'no-store' }),
      fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, { headers, cache: 'no-store' }),
      fetch(`${controlPlaneUrl}/v1/edge-agents`, { headers, cache: 'no-store' }),
    ]);
    const failed = [camerasResponse, branchesResponse, gatewaysResponse]
      .find((response) => !response.ok);
    if (failed) {
      const status = failed.status === 401 || failed.status === 403 ? failed.status : 502;
      return NextResponse.json({ error: 'system_stats_unavailable' }, { status });
    }

    const [camerasData, branchesData, gatewaysData] = await Promise.all([
      camerasResponse.json() as Promise<{ total_cameras?: string | number }>,
      branchesResponse.json() as Promise<{ data?: unknown[] }>,
      gatewaysResponse.json() as Promise<{ data?: unknown[] }>,
    ]);
    const cameraCount = Number(camerasData.total_cameras);
    if (!Number.isFinite(cameraCount) || cameraCount < 0) {
      return NextResponse.json({ error: 'invalid_camera_count' }, { status: 502 });
    }

    return NextResponse.json({
      gateways: Array.isArray(gatewaysData.data) ? gatewaysData.data.length : 0,
      cameras: cameraCount,
      branches: Array.isArray(branchesData.data) ? branchesData.data.length : 0,
      // The platform has no authoritative aggregate for these two metrics yet.
      // Null keeps the UI honest instead of presenting a false zero.
      live_sessions: null,
      telemetry_records: null,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'control_plane_unavailable' }, { status: 503 });
  }
}
