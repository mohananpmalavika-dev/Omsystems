import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/audit/quality
 * Get camera quality checks
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const rating = searchParams.get('rating');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (rating) params.append('rating', rating);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const url = `${API_BASE_URL}/v1/audit/quality?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Camera quality API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch camera quality data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/quality
 * Perform camera quality check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/audit/quality/check`;

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
    console.error('Camera quality check API error:', error);
    return NextResponse.json(
      { error: 'Failed to perform camera quality check' },
      { status: 500 }
    );
  }
}
