import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 
                           process.env.CONTROL_PLANE_PUBLIC_URL ||
                           'http://localhost:8080';
    
    // Get authentication
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
    
    // Try to get the edge agent first to see if it's activated
    const agentResponse = await fetch(
      `${controlPlaneUrl}/v1/edge-agents/${id}`,
      { method: 'GET', headers }
    );
    
    if (agentResponse.ok) {
      // It's an activated gateway - revoke it
      const agent = await agentResponse.json();
      
      const revokeResponse = await fetch(
        `${controlPlaneUrl}/v1/branches/${agent.branchId}/edge-agents/${id}/revoke`,
        {
          method: 'POST',
          headers,
        }
      );
      
      if (!revokeResponse.ok) {
        const error = await revokeResponse.json().catch(() => ({ error: 'revoke_failed' }));
        return NextResponse.json(error, { status: revokeResponse.status });
      }
      
      return new NextResponse(null, { status: 204 });
    }
    
    // Not an activated gateway - try as a pending activation
    // First, get branches to find which branch this activation belongs to
    const branchesResponse = await fetch(
      `${controlPlaneUrl}/v1/branches`,
      { method: 'GET', headers }
    );
    
    if (!branchesResponse.ok) {
      return NextResponse.json(
        { error: 'failed_to_get_branches', message: 'Could not retrieve branches' },
        { status: branchesResponse.status }
      );
    }
    
    const branchesData = await branchesResponse.json();
    const branches = branchesData.data || [];
    
    // Try to delete activation from each branch until we find it
    for (const branch of branches) {
      const deleteResponse = await fetch(
        `${controlPlaneUrl}/v1/branches/${branch.id}/edge-activations/${id}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      
      if (deleteResponse.status === 204) {
        // Successfully deleted
        return new NextResponse(null, { status: 204 });
      }
    }
    
    // Not found as either agent or activation
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
