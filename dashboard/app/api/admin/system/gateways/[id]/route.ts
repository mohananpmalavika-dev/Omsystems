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
    
    // First, get the edge agent to find its branchId
    // We need the branchId to call the revoke endpoint
    const agentResponse = await fetch(
      `${controlPlaneUrl}/v1/edge-agents/${id}`,
      { method: 'GET', headers }
    );
    
    if (!agentResponse.ok) {
      if (agentResponse.status === 404) {
        return NextResponse.json(
          { error: 'gateway_not_found', message: 'Gateway not found' },
          { status: 404 }
        );
      }
      const error = await agentResponse.json().catch(() => ({ error: 'unknown_error' }));
      return NextResponse.json(error, { status: agentResponse.status });
    }
    
    const agent = await agentResponse.json();
    
    // Now revoke the edge agent using the existing endpoint
    const response = await fetch(
      `${controlPlaneUrl}/v1/branches/${agent.branchId}/edge-agents/${id}/revoke`,
      {
        method: 'POST',
        headers,
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown_error' }));
      return NextResponse.json(
        error,
        { status: response.status }
      );
    }
    
    // Success - return 204 No Content
    return new NextResponse(null, { status: 204 });
    
  } catch (error) {
    console.error('Error deleting gateway:', error);
    return NextResponse.json(
      { error: 'internal_error', message: String(error) },
      { status: 500 }
    );
  }
}
