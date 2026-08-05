import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const makeProxyRequest = async (path: string, method: string) => {
    const forwardedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };

    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) forwardedHeaders.cookie = cookieHeader;

    const sentinelSession = request.headers.get('x-sentinel-session');
    if (sentinelSession) forwardedHeaders['x-sentinel-session'] = sentinelSession;

    const userIdHeader = request.headers.get('x-user-id');
    if (userIdHeader) forwardedHeaders['x-user-id'] = userIdHeader;

    const baseOrigin = (request as any).nextUrl?.origin ?? request.url;
    const controlUrl = new URL(`/api/control${path}`, baseOrigin).toString();
    return fetch(controlUrl, {
      method,
      headers: forwardedHeaders,
      cache: 'no-store',
    });
  };

  try {
    const deleteAgentResponse = await makeProxyRequest(
      `/v1/edge-agents/${encodeURIComponent(id)}`,
      'DELETE',
    );

    if (deleteAgentResponse.ok) {
      return new NextResponse(null, { status: 204 });
    }

    if (deleteAgentResponse.status === 404) {
      const branchesResponse = await makeProxyRequest('/v1/branches', 'GET');
      if (!branchesResponse.ok) {
        const body = await branchesResponse.text().catch(() => '');
        console.error('Failed to fetch branches:', branchesResponse.status, body);
        return NextResponse.json(
          { error: 'failed_to_get_branches', message: 'Could not retrieve branches' },
          { status: branchesResponse.status }
        );
      }

      const branchesData = await branchesResponse.json();
      const branches = branchesData.data || [];

      for (const branch of branches) {
        const agentResponse = await makeProxyRequest(
          `/v1/branches/${encodeURIComponent(branch.id)}/edge-agents`,
          'GET',
        );

        if (!agentResponse.ok) continue;

        const agentsData = await agentResponse.json();
        const agents = agentsData.data || [];
        const agent = agents.find((item: any) => item.id === id);
        if (agent) {
          const revokeResponse = await makeProxyRequest(
            `/v1/branches/${encodeURIComponent(branch.id)}/edge-agents/${encodeURIComponent(id)}/revoke`,
            'POST',
          );
          if (revokeResponse.ok) {
            return new NextResponse(null, { status: 204 });
          }
          const revokeBody = await revokeResponse.text().catch(() => '');
          let revokeError: any = { error: 'revoke_failed' };
          try {
            revokeError = JSON.parse(revokeBody || '{}');
          } catch {
            revokeError = { error: 'revoke_failed', message: revokeBody || 'Failed to revoke gateway' };
          }
          return NextResponse.json(revokeError, { status: revokeResponse.status });
        }
      }

      for (const branch of branches) {
        const deleteActivationResponse = await makeProxyRequest(
          `/v1/branches/${encodeURIComponent(branch.id)}/edge-activations/${encodeURIComponent(id)}`,
          'DELETE',
        );

        if (deleteActivationResponse.status === 204) {
          return new NextResponse(null, { status: 204 });
        }
      }

      return NextResponse.json(
        { error: 'gateway_not_found', message: 'Gateway or activation not found' },
        { status: 404 }
      );
    }

    const errorBody = await deleteAgentResponse.text().catch(() => '');
    let parsedError: any = { error: 'gateway_delete_failed' };
    try {
      parsedError = JSON.parse(errorBody || '{}');
    } catch {
      parsedError = { error: 'gateway_delete_failed', message: errorBody || 'Failed to delete gateway' };
    }

    return NextResponse.json(parsedError, { status: deleteAgentResponse.status });
  } catch (error) {
    console.error('Error deleting gateway:', error);
    return NextResponse.json(
      { error: 'internal_error', message: String(error) },
      { status: 500 }
    );
  }
}
