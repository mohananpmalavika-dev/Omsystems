import { NextRequest, NextResponse } from 'next/server';

const CONTROL_BFF_BASE = '/api/control';

/**
 * GET /api/audit/maintenance
 * Get maintenance work orders
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const workType = searchParams.get('workType');
    const assignedTechnicianId = searchParams.get('assignedTechnicianId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (workType) params.append('workType', workType);
    if (assignedTechnicianId) params.append('assignedTechnicianId', assignedTechnicianId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (summary) params.append('summary', 'true');

    const query = params.toString();
    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders${query ? `?${query}` : ''}`, request.nextUrl.origin);

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
    console.error('Maintenance API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to load maintenance work orders' },
      { status: 502 }
    );
  }
}

/**
 * POST /api/audit/maintenance
 * Create maintenance work order
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'validation_error', message: 'A work-order payload is required' }, { status: 400 });
    }

    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders`, request.nextUrl.origin);

    const authorization = request.headers.get('authorization');
    const sentinelSession = request.headers.get('x-sentinel-session');
    const response = await fetch(url, {
      method: 'POST',
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
    console.error('Create maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to create maintenance work order' },
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
