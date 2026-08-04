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
    const deleteAgentResponse = await fetch(
      `${controlPlaneUrl}/v1/edge-agents/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers }
    );

    if (deleteAgentResponse.ok) {
      return new NextResponse(null, { status: 204 });
    }

    if (deleteAgentResponse.status === 404) {
      const branchesResponse = await fetch(`${controlPlaneUrl}/v1/branches`, {
        method: 'GET',
        headers,
      });

      if (!branchesResponse.ok) {
        const body = await branchesResponse.text().catch(() => '');
        console.error('Failed to fetch branches:', branchesResponse.status, body);
        return NextResponse.json(
          { error: 'failed_to_get_branches', message: 'Could not retrieve branches' },
          { status: branchesResponse.status }
        );
      }

      const branchesData = await branchesResponse.json();
      const branches = branchesData.data || [];

      for (const branch of branches) {
        const deleteActivationResponse = await fetch(
          `${controlPlaneUrl}/v1/branches/${encodeURIComponent(branch.id)}/edge-activations/${encodeURIComponent(id)}`,
          { method: 'DELETE', headers }
        );

        if (deleteActivationResponse.status === 204) {
          return new NextResponse(null, { status: 204 });
        }
      }

      return NextResponse.json(
        { error: 'gateway_not_found', message: 'Gateway or activation not found' },
        { status: 404 }
      );
    }

    const errorBody = await deleteAgentResponse.text().catch(() => '');
    let parsedError: any = { error: 'gateway_delete_failed' };
    try {
      parsedError = JSON.parse(errorBody || '{}');
    } catch {
      parsedError = { error: 'gateway_delete_failed', message: errorBody || 'Failed to delete gateway' };
    }

    return NextResponse.json(parsedError, { status: deleteAgentResponse.status });
  } catch (error) {
    console.error('Error deleting gateway:', error);
    return NextResponse.json(
      { error: 'internal_error', message: String(error) },
      { status: 500 }
    );
  }
}
