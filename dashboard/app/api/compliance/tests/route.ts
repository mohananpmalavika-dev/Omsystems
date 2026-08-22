import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/compliance/tests
 * List compliance tests
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const controlId = searchParams.get('controlId');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const params = new URLSearchParams();
    if (controlId) params.append('controlId', controlId);
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const url = `${API_BASE_URL}/v1/compliance/tests?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('List tests API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance tests' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compliance/tests
 * Create and execute a new control test
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/compliance/tests`;

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
    console.error('Create test API error:', error);
    return NextResponse.json(
      { error: 'Failed to create compliance test' },
      { status: 500 }
    );
  }
}
