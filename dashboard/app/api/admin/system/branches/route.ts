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
    
    const [branchesResponse, agentsResponse] = await Promise.all([
      fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
        method: 'GET', headers, cache: 'no-store',
      }),
      fetch(`${controlPlaneUrl}/v1/edge-agents`, {
        method: 'GET', headers, cache: 'no-store',
      }),
    ]);

    if (!branchesResponse.ok || !agentsResponse.ok) {
      const failed = !branchesResponse.ok ? branchesResponse : agentsResponse;
      return upstreamFailure(failed, 'branches');
    }

    const [branchesData, agentsData] = await Promise.all([
      branchesResponse.json() as Promise<{ data?: unknown[] }>,
      agentsResponse.json() as Promise<{ data?: Array<{ branchId?: string }> }>,
    ]);
    const agentsByBranch = new Map<string, number>();
    for (const agent of agentsData.data ?? []) {
      if (!agent.branchId) continue;
      agentsByBranch.set(agent.branchId, (agentsByBranch.get(agent.branchId) ?? 0) + 1);
    }
    const branches = (branchesData.data ?? []).map((value) => {
      const branch = value as { id?: string; name?: string; address?: string | null };
      return {
        id: branch.id,
        name: branch.name,
        address: branch.address ?? null,
        gateway_count: branch.id ? agentsByBranch.get(branch.id) ?? 0 : 0,
      };
    });
    
    return NextResponse.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json({ error: 'control_plane_unavailable' }, { status: 503 });
  }
}

function upstreamFailure(response: Response, resource: string) {
  console.error(`Failed to fetch ${resource}: ${response.status} ${response.statusText}`);
  const status = response.status === 401 || response.status === 403 ? response.status : 502;
  return NextResponse.json({ error: `${resource}_unavailable` }, { status });
}

