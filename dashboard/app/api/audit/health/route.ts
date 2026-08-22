import { NextRequest, NextResponse } from 'next/server';

// Route now proxies to the dashboard BFF (/api/control) rather than contacting the control plane directly.
const API_BFF_BASE = '/api/control';

/**
 * GET /api/audit/health
 * Get camera health checks and summary
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (summary) params.append('summary', 'true');

    // Use the dashboard BFF which handles auth, headers, and origin transformation.
    const bffUrl = new URL(`${API_BFF_BASE}/v1/audit/health?${params.toString()}`, request.nextUrl.origin).toString();

    const response = await fetch(bffUrl, {
      headers: {
        // forward cookies so the control BFF can extract the employee session
        cookie: request.headers.get('cookie') || '',
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // If upstream returned non-JSON (text, html), forward the text body
    const text = await response.text();
    return new NextResponse(text, { status: response.status, headers: { 'content-type': contentType } });
  } catch (error) {
    console.error('Camera health API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch camera health data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/health
 * Trigger camera health check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const bffUrl = new URL(`/api/control/v1/audit/health/check`, request.nextUrl.origin).toString();

    const response = await fetch(bffUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return new NextResponse(text, { status: response.status, headers: { 'content-type': contentType } });
  } catch (error) {
    console.error('Camera health check API error:', error);
    return NextResponse.json(
      { error: 'Failed to perform camera health check' },
      { status: 500 }
    );
  }
}
