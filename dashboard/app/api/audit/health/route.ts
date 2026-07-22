import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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

    const url = `${API_BASE_URL}/v1/audit/health?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
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

    const url = `${API_BASE_URL}/v1/audit/health/check`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Camera health check API error:', error);
    return NextResponse.json(
      { error: 'Failed to perform camera health check' },
      { status: 500 }
    );
  }
}
