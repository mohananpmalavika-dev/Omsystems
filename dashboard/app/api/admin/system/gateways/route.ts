import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
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
    
    // Note: There's no dedicated "list all edge agents" endpoint in the control plane
    // Edge agents are fetched per-branch via /v1/branches/:branchId/edge-agents
    // For now, return empty array - would need to query all branches and aggregate
    
    console.warn('Gateway listing not implemented - requires aggregation across all branches');
    return NextResponse.json([]);
    
  } catch (error) {
    console.error('Error fetching gateways:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
