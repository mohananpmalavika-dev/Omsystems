/**
 * Archive Branch API Route
 * 
 * Proxies branch archive requests to the control plane backend
 * Transitions branch from DISABLED → ARCHIVED (terminal state)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
    
    // Get authentication
    const employeeSession = request.cookies.get('sentinel_access')?.value ??
      request.headers.get('x-sentinel-session');
    const devUserId = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (employeeSession) {
      headers['authorization'] = 'Bearer ' + employeeSession;
    } else {
      headers['x-user-id'] = devUserId;
    }
    
    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) {
      headers['x-edge-bridge-key'] = bridgeKey;
    }
    
    // Forward request to control plane
    const response = await fetch(
      `${controlPlaneUrl}/v1/organization/nodes/${encodeURIComponent(id)}/archive`,
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
    console.error('Error archiving branch:', error);
    return NextResponse.json(
      { 
        error: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to archive branch'
      },
      { status: 500 }
    );
  }
}
