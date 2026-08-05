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
    const normalizedControlPlaneUrl = normalizeHttpOrigin(controlPlaneUrl);

    // Build forwarded headers so the control plane sees the same auth identity
    // that the browser request carried into the dashboard BFF.
    const forwardedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };

    const sentinelSession = request.headers.get('x-sentinel-session');
    const cookieHeader = request.headers.get('cookie');
    const cookieAccessToken = cookieHeader?.split(';').map((segment) => segment.trim()).find((segment) => segment.startsWith('sentinel_access='))?.split('=')[1];
    const sessionToken = cookieAccessToken || sentinelSession;
    if (sessionToken) {
      forwardedHeaders.authorization = `Bearer ${sessionToken}`;
    } else {
      forwardedHeaders['x-user-id'] = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';
    }

    const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
    if (bridgeKey) forwardedHeaders['x-edge-bridge-key'] = bridgeKey;

    const controlUrl = new URL(`/v1/admin/cameras/${encodeURIComponent(id)}`, normalizedControlPlaneUrl).toString();
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

function normalizeHttpOrigin(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}
