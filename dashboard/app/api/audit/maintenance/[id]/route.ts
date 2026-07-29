import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
    const url = `${API_BASE_URL}/v1/maintenance/workorders/${params.id}`;

    const sessionToken = request.cookies.get('sentinel_access')?.value;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${sessionToken || ''}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = await request.json();
    const url = `${API_BASE_URL}/v1/maintenance/workorders/${params.id}`;

    const sessionToken = request.cookies.get('sentinel_access')?.value;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sessionToken || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      credentials: 'include',
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
