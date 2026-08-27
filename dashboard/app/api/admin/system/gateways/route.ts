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
    
    // Step 1: Fetch all branches using organization nodes endpoint
    const branchesResponse = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!branchesResponse.ok) {
      console.error(`Failed to fetch branches: ${branchesResponse.status} ${branchesResponse.statusText}`);
      const text = await branchesResponse.text();
      console.error(`Response body: ${text}`);
      return NextResponse.json([], { status: 200 });
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
          console.error(`Failed to fetch agents for branch ${branch.id}: ${agentsResponse.status}`);
          return [];
        }

        const agentsData = await agentsResponse.json();
        const agents = (agentsData.data || []).filter(
          (agent: any) => agent.credentialStatus !== 'revoked',
        );
        
        // Add branch info to each agent
        return agents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          status: agent.status || 'unknown',
          last_seen_at: agent.lastSeenAt || agent.last_seen_at || null,
          created_at: agent.createdAt || agent.created_at || new Date().toISOString(),
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

