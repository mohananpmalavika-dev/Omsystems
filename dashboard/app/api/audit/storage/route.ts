import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/audit/storage
 * Get storage health checks and summary
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storageNodeId = searchParams.get('storageNodeId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');
    const minUtilization = searchParams.get('minUtilization');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (storageNodeId) params.append('storageNodeId', storageNodeId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);
    if (minUtilization) params.append('minUtilization', minUtilization);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (summary) params.append('summary', 'true');

    const url = `${API_BASE_URL}/v1/audit/storage?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Storage health API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch storage health data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/storage
 * Trigger storage health check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/audit/storage/check`;

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
    console.error('Storage health check API error:', error);
    return NextResponse.json(
      { error: 'Failed to perform storage health check' },
      { status: 500 }
    );
  }
}
