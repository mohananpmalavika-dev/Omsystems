import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const controlPlaneUrl =
    process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    'http://localhost:8080';

  const employeeSession = request.cookies.get('sentinel_access')?.value ??
    request.headers.get('x-sentinel-session');
  const devUserId = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (employeeSession) {
    headers['authorization'] = `Bearer ${employeeSession}`;
  } else {
    headers['x-user-id'] = devUserId;
  }

  const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
  if (bridgeKey) {
    headers['x-edge-bridge-key'] = bridgeKey;
  }

  try {
    const branchesResponse = await fetch(`${controlPlaneUrl}/v1/branches`, {
      method: 'GET',
      headers,
    });

    if (!branchesResponse.ok) {
      const body = await branchesResponse.text();
      console.error('Failed to fetch branches:', branchesResponse.status, body);
      return NextResponse.json(
        { error: 'failed_to_get_branches', message: 'Could not retrieve branches' },
        { status: branchesResponse.status }
      );
    }

    const branchesData = await branchesResponse.json();
    const branches = branchesData.data || [];

    for (const branch of branches) {
      const agentsResponse = await fetch(
        `${controlPlaneUrl}/v1/branches/${branch.id}/edge-agents`,
        { method: 'GET', headers }
      );

      if (!agentsResponse.ok) {
        console.warn(`Failed to fetch agents for branch ${branch.id}: ${agentsResponse.status}`);
        continue;
      }

      const agentsData = await agentsResponse.json();
      const agents = agentsData.data || [];
      const agent = agents.find((item: any) => item.id === id);
      if (!agent) continue;

      const revokeResponse = await fetch(
        `${controlPlaneUrl}/v1/branches/${branch.id}/edge-agents/${id}/revoke`,
        { method: 'POST', headers }
      );

      if (!revokeResponse.ok) {
        const error = await revokeResponse.json().catch(() => ({ error: 'revoke_failed' }));
        return NextResponse.json(error, { status: revokeResponse.status });
      }

      return new NextResponse(null, { status: 204 });
    }

    for (const branch of branches) {
      const deleteResponse = await fetch(
        `${controlPlaneUrl}/v1/branches/${branch.id}/edge-activations/${id}`,
        { method: 'DELETE', headers }
      );

      if (deleteResponse.status === 204) {
        return new NextResponse(null, { status: 204 });
      }
    }

    return NextResponse.json(
      { error: 'gateway_not_found', message: 'Gateway or activation not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error deleting gateway:', error);
    return NextResponse.json(
      { error: 'internal_error', message: String(error) },
      { status: 500 }
    );
  }
}
