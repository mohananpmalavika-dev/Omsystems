/**
 * Branch Lifecycle Impact Analysis API Route
 * 
 * Proxies lifecycle impact analysis requests to the control plane backend
 * Shows what resources would be affected by a lifecycle transition
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const targetStatus = searchParams.get('targetStatus');
    
    // Validate target status
    if (!targetStatus || !['ACTIVE', 'DISABLED', 'ARCHIVED'].includes(targetStatus)) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          message: 'targetStatus query parameter is required and must be one of: ACTIVE, DISABLED, ARCHIVED'
        },
        { status: 400 }
      );
    }
    
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 
                           process.env.CONTROL_PLANE_PUBLIC_URL ||
                           'http://localhost:8080';
    
    const headers = buildControlPlaneHeaders(request, { 'content-type': 'application/json' });
    if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    
    // Forward request to control plane
    const response = await fetch(
      `${controlPlaneUrl}/v1/organization/nodes/${encodeURIComponent(id)}/lifecycle-impact?targetStatus=${encodeURIComponent(targetStatus)}`,
      {
        method: 'GET',
        headers,
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data, { status: 200 });
    
  } catch (error) {
    console.error('Error fetching lifecycle impact:', error);
    return NextResponse.json(
      { 
        error: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to fetch lifecycle impact'
      },
      { status: 500 }
    );
  }
}
