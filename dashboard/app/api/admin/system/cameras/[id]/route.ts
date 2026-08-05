import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    // Build forwarded headers from incoming request so the control proxy
    // sees the same authentication data as the browser request.
    const forwardedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) forwardedHeaders.cookie = cookieHeader;
    const sentinelSession = request.headers.get('x-sentinel-session');
    if (sentinelSession) forwardedHeaders['x-sentinel-session'] = sentinelSession;
    const userIdHeader = request.headers.get('x-user-id');
    if (userIdHeader) forwardedHeaders['x-user-id'] = userIdHeader;
    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) forwardedHeaders['x-edge-bridge-key'] = bridgeKey;

    const baseOrigin = (request as any).nextUrl?.origin ?? new URL(request.url).origin;
    const controlUrl = new URL(`/api/control/v1/admin/cameras/${encodeURIComponent(id)}`, baseOrigin).toString();
    let response;

    try {
      response = await fetch(controlUrl, {
        method: 'DELETE',
        headers: forwardedHeaders,
        cache: 'no-store',
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error('Camera delete proxy failed', { controlUrl, id, message });
      return NextResponse.json(
        { error: 'camera_delete_proxy_failed', message },
        { status: 500 },
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => undefined);
      console.error('Failed to delete camera', { id, status: response.status, details: text, controlUrl });
      return NextResponse.json(
        { error: 'Failed to delete camera', details: text },
        { status: response.status }
      );
    }

    // Successful deletion returns 204
    if (response.status === 204) return NextResponse.json({ success: true });
    const json = await response.json().catch(() => undefined);
    return NextResponse.json({ success: true, details: json });
    
  } catch (error) {
    console.error('Error deleting camera:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
