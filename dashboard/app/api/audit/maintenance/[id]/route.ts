import { NextRequest, NextResponse } from 'next/server';

const CONTROL_BFF_BASE = '/api/control';

/**
 * GET /api/audit/maintenance/[id]
 * Get maintenance work order details
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders/${encodeURIComponent(params.id)}`, request.nextUrl.origin);

    const authorization = request.headers.get('authorization');
    const sentinelSession = request.headers.get('x-sentinel-session');
    const response = await fetch(url, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        ...(authorization ? { authorization } : {}),
        ...(sentinelSession ? { 'x-sentinel-session': sentinelSession } : {}),
      },
      cache: 'no-store',
    });

    return proxyResponse(response);
  } catch (error) {
    console.error('Get maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to load the maintenance work order' },
      { status: 502 }
    );
  }
}

/**
 * PUT /api/audit/maintenance/[id]
 * Update maintenance work order
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'validation_error', message: 'A work-order update payload is required' }, { status: 400 });
    }
    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders/${encodeURIComponent(params.id)}`, request.nextUrl.origin);

    const authorization = request.headers.get('authorization');
    const sentinelSession = request.headers.get('x-sentinel-session');
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
        ...(authorization ? { authorization } : {}),
        ...(sentinelSession ? { 'x-sentinel-session': sentinelSession } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    return proxyResponse(response);
  } catch (error) {
    console.error('Update maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to update the maintenance work order' },
      { status: 502 }
    );
  }
}

async function proxyResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json(await response.json(), { status: response.status });
  }
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': contentType || 'text/plain; charset=utf-8' },
  });
}
