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
    
    // Note: There's no DELETE endpoint for edge agents in the control plane API
    // Edge agents are typically deactivated or removed through branch management
    // For now, return a helpful error message
    
    console.warn(`Delete edge agent ${id} not implemented - no backend endpoint available`);
    
    return NextResponse.json(
      { 
        error: 'not_implemented',
        message: 'Edge agent deletion is not currently supported through this API. Please deactivate the edge agent through branch management or contact support.'
      },
      { status: 501 }
    );
    
  } catch (error) {
    console.error('Error deleting gateway:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
