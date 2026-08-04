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
    
    // Step 1: Fetch all branches
    const branchesResponse = await fetch(`${controlPlaneUrl}/v1/branches`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!branchesResponse.ok) {
      console.error(`Failed to fetch branches: ${branchesResponse.status}`);
      return NextResponse.json([]);
    }

    const branchesData = await branchesResponse.json();
    const branches = branchesData.data || [];
    
    if (branches.length === 0) {
      return NextResponse.json([]);
    }

    // Step 2: Fetch edge agents for each branch
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

        if (!agentsResponse.ok) {
          return [];
        }

        const agentsData = await agentsResponse.json();
        const agents = agentsData.data || [];
        
        // Add branch info to each agent
        return agents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          status: agent.status || 'unknown',
          last_seen_at: agent.lastSeenAt || null,
          created_at: agent.createdAt || null,
          branch_name: branch.name,
          branch_id: branch.id,
        }));
      } catch (error) {
        console.error(`Error fetching agents for branch ${branch.id}:`, error);
        return [];
      }
    });

    // Step 3: Wait for all requests and flatten results
    const gatewayArrays = await Promise.all(gatewayPromises);
    const allGateways = gatewayArrays.flat();
    
    return NextResponse.json(allGateways);
    
  } catch (error) {
    console.error('Error fetching gateways:', error);
    return NextResponse.json([], { status: 200 });
  }
}
