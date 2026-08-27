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
    
    const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Control plane returned ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch cameras' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return the cameras array directly (frontend expects array, not {cameras: [...]})
    return NextResponse.json(data.cameras || []);
  } catch (error) {
    console.error('Error fetching cameras:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

