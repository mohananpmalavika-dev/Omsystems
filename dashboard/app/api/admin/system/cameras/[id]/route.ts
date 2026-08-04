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
    
    const headers: HeadersInit = {};
    
    if (employeeSession) {
      headers['authorization'] = 'Bearer ' + employeeSession;
    } else {
      headers['x-user-id'] = devUserId;
    }
    
    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) {
      headers['x-edge-bridge-key'] = bridgeKey;
    }
    
    // Delete camera - there's no direct DELETE endpoint, but we can use the admin routes
    // The admin-camera-management routes should handle this
    const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/${id}`, {
      method: 'DELETE',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to delete camera ${id}: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to delete camera' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting camera:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
