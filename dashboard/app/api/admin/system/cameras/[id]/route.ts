import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../../lib/server/control-plane-auth';

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

    const forwardedHeaders = buildControlPlaneHeaders(request, { 'content-type': 'application/json' });
    if (!forwardedHeaders) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

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
      const responseText = await response.text().catch(() => undefined);
      let parsedBody: unknown = undefined;

      if (responseText) {
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = undefined;
        }
      }

      console.error('Failed to delete camera', { id, status: response.status, details: responseText, controlUrl });

      if (parsedBody && typeof parsedBody === 'object' && parsedBody !== null) {
        return NextResponse.json(parsedBody, { status: response.status });
      }

      return NextResponse.json(
        { error: 'Failed to delete camera', details: responseText ?? 'Unknown error' },
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
