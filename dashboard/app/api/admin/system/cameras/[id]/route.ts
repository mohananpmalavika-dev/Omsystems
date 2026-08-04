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
    
    // Delete camera via POST with body to avoid empty-body parsing issues on control-plane
    const bodyPayload = JSON.stringify({ id });
    // Ensure Content-Type set when sending a JSON body
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/delete`, {
      method: 'POST',
      headers,
      body: bodyPayload,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to delete camera ${id}: ${response.status}`);
      const text = await response.text().catch(() => undefined);
      return NextResponse.json(
        { error: 'Failed to delete camera', details: text },
        { status: response.status }
      );
    }

    // Successful deletion returns 204
    if (response.status === 204) return NextResponse.json({ success: true });
    const json = await response.json().catch(() => undefined);
    return NextResponse.json({ success: true, details: json });
    
  } catch (error) {
    console.error('Error deleting camera:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
