import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

type ControlPlaneCamera = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
  vendor?: unknown;
  ipAddress?: unknown;
  status?: unknown;
  edgeAgentId?: unknown;
  branchId?: unknown;
  branchName?: unknown;
};

type ControlPlaneGateway = {
  id?: unknown;
  name?: unknown;
};

export async function GET(request: NextRequest) {
  const headers = buildControlPlaneHeaders(request, { 'content-type': 'application/json' });
  if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const limit = boundedInteger(request.nextUrl.searchParams.get('limit'), 100, 1, 250);
  const offset = boundedInteger(request.nextUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 120);
  const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    'http://localhost:8080';
  const cameraQuery = new URLSearchParams({
    action: 'device:configure',
    limit: String(limit),
    offset: String(offset),
  });
  if (search) cameraQuery.set('search', search);

  try {
    const [camerasResponse, gatewaysResponse] = await Promise.all([
      fetch(`${controlPlaneUrl}/v1/cameras?${cameraQuery}`, { headers, cache: 'no-store' }),
      fetch(`${controlPlaneUrl}/v1/edge-agents`, { headers, cache: 'no-store' }),
    ]);
    const failed = [camerasResponse, gatewaysResponse].find((response) => !response.ok);
    if (failed) {
      const status = failed.status === 401 || failed.status === 403 ? failed.status : 502;
      return NextResponse.json({ error: 'cameras_unavailable' }, { status });
    }

    const [cameraPayload, gatewayPayload] = await Promise.all([
      camerasResponse.json() as Promise<{ data?: ControlPlaneCamera[]; total?: unknown }>,
      gatewaysResponse.json() as Promise<{ data?: ControlPlaneGateway[] }>,
    ]);
    if (!Array.isArray(cameraPayload.data) || !Array.isArray(gatewayPayload.data)) {
      return NextResponse.json({ error: 'invalid_camera_response' }, { status: 502 });
    }
    const total = Number(cameraPayload.total);
    if (!Number.isSafeInteger(total) || total < 0) {
      return NextResponse.json({ error: 'invalid_camera_total' }, { status: 502 });
    }

    const gatewayNames = new Map(
      gatewayPayload.data
        .filter((gateway): gateway is ControlPlaneGateway & { id: string } => typeof gateway.id === 'string')
        .map((gateway) => [gateway.id, typeof gateway.name === 'string' ? gateway.name : gateway.id]),
    );
    const data = cameraPayload.data
      .filter((camera): camera is ControlPlaneCamera & { id: string } => typeof camera.id === 'string')
      .map((camera) => ({
        id: camera.id,
        name: stringValue(camera.name) || 'Unnamed camera',
        model: stringValue(camera.model) || 'Model not reported',
        vendor: stringValue(camera.vendor),
        ip_address: stringValue(camera.ipAddress),
        status: stringValue(camera.status) || 'unknown',
        edge_agent_id: stringValue(camera.edgeAgentId),
        gateway_name: typeof camera.edgeAgentId === 'string' ? gatewayNames.get(camera.edgeAgentId) ?? null : null,
        branch_id: stringValue(camera.branchId),
        branch_name: stringValue(camera.branchName),
      }));

    return NextResponse.json({ data, total, limit, offset });
  } catch (error) {
    console.error('Error fetching cameras:', error);
    return NextResponse.json({ error: 'control_plane_unavailable' }, { status: 503 });
  }
}

function boundedInteger(raw: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = raw === null ? fallback : Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
