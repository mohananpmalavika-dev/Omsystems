import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 
                           process.env.CONTROL_PLANE_PUBLIC_URL ||
                           'http://localhost:8080';
    
    const headers = buildControlPlaneHeaders(request, { 'content-type': 'application/json' });
    if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    
    const response = await fetch(`${controlPlaneUrl}/v1/edge-agents`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to fetch gateways: ${response.status} ${response.statusText}`);
      const status = response.status === 401 || response.status === 403 ? response.status : 502;
      return NextResponse.json({ error: 'gateways_unavailable' }, { status });
    }

    const body = await response.json() as { data?: Array<Record<string, unknown>> };
    return NextResponse.json((body.data ?? []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status ?? 'unknown',
      last_seen_at: agent.lastSeenAt ?? null,
      branch_name: agent.branchName,
      branch_id: agent.branchId,
    })));
    
  } catch (error) {
    console.error('Error fetching gateways:', error);
    return NextResponse.json({ error: 'control_plane_unavailable' }, { status: 503 });
  }
}

