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
    
    let stats = {
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0,
    };

    // Fetch actual data from the same endpoints to get accurate counts
    try {
      // Request the count endpoint first (more efficient), fallback to the list endpoint if needed
      const camerasResponse = await fetch(`${controlPlaneUrl}/v1/admin/cameras/count`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (camerasResponse.ok) {
        const camerasData = await camerasResponse.json();
        // control-plane /count returns an object with total_cameras; list returns { cameras: [...] }
        // Postgres COUNT(*) often comes back as a string via node-postgres, coerce if necessary.
        if (camerasData && (camerasData.total_cameras !== undefined && camerasData.total_cameras !== null)) {
          stats.cameras = Number(camerasData.total_cameras) || 0;
        } else if (Array.isArray(camerasData.cameras)) {
          stats.cameras = camerasData.cameras.length;
        } else if (Array.isArray(camerasData)) {
          stats.cameras = camerasData.length;
        } else {
          stats.cameras = 0;
        }
      } else {
        // Fallback: try /list endpoint
        try {
          const listResp = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
            method: 'GET',
            headers,
            cache: 'no-store',
          });
          if (listResp.ok) {
            const listData = await listResp.json();
            stats.cameras = Array.isArray(listData.cameras) ? listData.cameras.length : 0;
          }
        } catch (err) {
          console.error('Failed to fetch cameras list fallback:', err);
        }
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
              return Array.isArray(agentsData.data)
                ? agentsData.data.filter((agent: any) => agent.credentialStatus !== 'revoked').length
                : 0;
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

