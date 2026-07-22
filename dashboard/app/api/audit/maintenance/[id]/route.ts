import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/audit/maintenance/[id]
 * Get maintenance work order details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = `${API_BASE_URL}/v1/audit/maintenance/${params.id}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Get maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintenance work order' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/audit/maintenance/[id]
 * Update maintenance work order
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const url = `${API_BASE_URL}/v1/audit/maintenance/${params.id}`;

    const response = await fetch(url, {
      method: 'PUT',
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
    console.error('Update maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'Failed to update maintenance work order' },
      { status: 500 }
    );
  }
}
