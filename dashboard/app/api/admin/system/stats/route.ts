import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 
                           process.env.CONTROL_PLANE_PUBLIC_URL ||
                           'http://localhost:8080';
    
    // Get authentication from cookie or header (same as control proxy)
    const employeeSession = request.cookies.get('sentinel_access')?.value ??
      request.headers.get('x-sentinel-session');
    const devUserId = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';
    
    // Build headers with authentication
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (employeeSession) {
      headers['authorization'] = 'Bearer ' + employeeSession;
    } else {
      headers['x-user-id'] = devUserId;
    }
    
    // Add bridge key if available
    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) {
      headers['x-edge-bridge-key'] = bridgeKey;
    }
    
    let stats = {
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    };

    // Fetch actual data from the same endpoints to get accurate counts
    try {
      // Get cameras count
      const camerasResponse = await fetch(`${controlPlaneUrl}/v1/admin/cameras`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (camerasResponse.ok) {
        const camerasData = await camerasResponse.json();
        stats.cameras = Array.isArray(camerasData) ? camerasData.length : 0;
      }
    } catch (error) {
      console.error('Failed to fetch cameras count:', error);
    }

    // Get branches count
    try {
      const branchesResponse = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        stats.branches = Array.isArray(branchesData.data) ? branchesData.data.length : 0;
      }
    } catch (error) {
      console.error('Failed to fetch branches count:', error);
    }

    // Get gateways count by aggregating from all branches
    try {
      const branchesResponse = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        const branches = branchesData.data || [];
        
        // Fetch edge agents for all branches
        const gatewayPromises = branches.map(async (branch: any) => {
          try {
            const agentsResponse = await fetch(
              `${controlPlaneUrl}/v1/branches/${branch.id}/edge-agents`,
              {
                method: 'GET',
                headers,
                cache: 'no-store',
              }
            );
            if (agentsResponse.ok) {
              const agentsData = await agentsResponse.json();
              return Array.isArray(agentsData.data) ? agentsData.data.length : 0;
            }
            return 0;
          } catch {
            return 0;
          }
        });
        
        const gatewayCounts = await Promise.all(gatewayPromises);
        stats.gateways = gatewayCounts.reduce((sum, count) => sum + count, 0);
      }
    } catch (error) {
      console.error('Failed to fetch gateways count:', error);
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    });
  }
}

