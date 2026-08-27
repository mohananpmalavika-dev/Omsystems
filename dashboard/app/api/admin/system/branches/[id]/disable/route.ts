/**
 * Disable Branch API Route
 * 
 * Proxies branch disable requests to the control plane backend
 * Transitions branch from ACTIVE → DISABLED
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    // Validate request body
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          message: 'Reason is required and must be a non-empty string'
        },
        { status: 400 }
      );
    }
    
    if (body.reason.length > 500) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          message: 'Reason must not exceed 500 characters'
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
      `${controlPlaneUrl}/v1/organization/nodes/${encodeURIComponent(id)}/disable`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reason: body.reason.trim(),
        }),
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data, { status: 200 });
    
  } catch (error) {
    console.error('Error disabling branch:', error);
    return NextResponse.json(
      { 
        error: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to disable branch'
      },
      { status: 500 }
    );
  }
}
