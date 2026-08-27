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
    
    // Fetch branches list using organization nodes endpoint
    const response = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to fetch branches: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response body: ${text}`);
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

