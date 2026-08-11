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
      headers['authorization'] = 'Bearer ' + employeeSession;
    } else {
      headers['x-user-id'] = devUserId;
    }
    
    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) {
      headers['x-edge-bridge-key'] = bridgeKey;
    }
    
    // Branch deletion has been replaced with lifecycle management
    // Use the proper lifecycle endpoints instead of direct deletion
    
    console.warn(`DELETE branch ${id} deprecated - use lifecycle operations instead`);
    
    return NextResponse.json(
      { 
        error: 'operation_deprecated',
        message: 'Direct branch deletion is not supported. Use lifecycle management instead.',
        suggestion: 'Use POST /api/admin/system/branches/:id/disable to disable the branch, then POST /api/admin/system/branches/:id/archive to archive it.',
        lifecycleEndpoints: {
          disable: `/api/admin/system/branches/${id}/disable`,
          reactivate: `/api/admin/system/branches/${id}/reactivate`,
          archive: `/api/admin/system/branches/${id}/archive`,
          impact: `/api/admin/system/branches/${id}/lifecycle-impact?targetStatus=DISABLED`
        },
        documentation: 'Branches follow a lifecycle: ACTIVE → DISABLED → ARCHIVED. This preserves historical data while controlling operational availability.'
      },
      { status: 410 } // 410 Gone - indicates the operation is no longer available
    );
    
  } catch (error) {
    console.error('Error deleting branch:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
