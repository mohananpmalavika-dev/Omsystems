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
    
    // Fetch branches list
    const response = await fetch(`${controlPlaneUrl}/v1/branches`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to fetch branches: ${response.status}`);
      return NextResponse.json([], { status: 200 }); // Return empty array on error
    }

    const data = await response.json();
    
    // Transform to match frontend expectations
    const branches = (data.data || []).map((branch: any) => ({
      id: branch.id,
      name: branch.name,
      address: null, // Address not in basic branch data
      gateway_count: 0, // Would need separate query
    }));
    
    return NextResponse.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
