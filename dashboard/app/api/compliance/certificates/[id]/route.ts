import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/compliance/certificates/[id]
 * Get certificate details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = `${API_BASE_URL}/v1/compliance/certificates/${params.id}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Get certificate API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch certificate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/compliance/certificates/[id]
 * Revoke a certificate
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const url = `${API_BASE_URL}/v1/compliance/certificates/${params.id}/revoke`;

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
    console.error('Revoke certificate API error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke certificate' },
      { status: 500 }
    );
  }
}
