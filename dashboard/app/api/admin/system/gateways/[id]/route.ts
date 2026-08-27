import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildControlPlaneHeaders } from '../../../../../../lib/server/control-plane-auth';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL ||
    process.env.CONTROL_PLANE_PUBLIC_URL ||
    process.env.CONTROL_PLANE_URL ||
    'http://localhost:8080';
  const upstream = new URL(
    `/v1/edge-agents/${encodeURIComponent(id)}`,
    normalizeHttpOrigin(controlPlaneUrl),
  );

  const headers = buildControlPlaneHeaders(request, { accept: 'application/json' });
  if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const response = await fetch(upstream, {
      method: 'DELETE',
      headers,
      cache: 'no-store',
    });

    if (response.ok) {
      return new NextResponse(null, { status: 204 });
    }

    const responseText = await response.text().catch(() => '');
    const responseBody = parseErrorBody(responseText);
    console.error('Gateway deletion failed', {
      id,
      status: response.status,
      upstream: upstream.toString(),
      error: responseBody.error,
    });
    return NextResponse.json(responseBody, { status: response.status });
  } catch (error) {
    console.error('Gateway delete proxy failed', {
      id,
      upstream: upstream.toString(),
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: 'control_plane_unavailable',
        message: 'The gateway service is temporarily unavailable. Please try again.',
      },
      { status: 502 },
    );
  }
}

function normalizeHttpOrigin(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

function parseErrorBody(body: string): { error: string; message?: string; details?: unknown } {
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as { error: string; message?: string; details?: unknown };
      }
    } catch {
      // Use the plain-text upstream response below.
    }
  }
  return {
    error: 'gateway_delete_failed',
    message: body || 'Failed to remove gateway',
  };
}
