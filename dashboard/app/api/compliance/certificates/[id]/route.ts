import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/compliance/certificates/[id]
 * Get certificate details
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const url = `${API_BASE_URL}/v1/compliance/certificates/${encodeURIComponent(params.id)}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
        ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: 'Compliance service returned an invalid response.' }; }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Get certificate API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch certificate' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  void request;
  return NextResponse.json(
    { error: 'Certificate revocation is not available. Issue a replacement from the source assessment.' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
