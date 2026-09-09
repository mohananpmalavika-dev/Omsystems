import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const response = await fetch(`${API_BASE_URL}/v1/compliance/evidence/${encodeURIComponent(id)}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
        ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
      },
      body: JSON.stringify(await request.json()),
    });
    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: 'Compliance service returned an invalid response.' }; }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Validate compliance evidence API error:', error);
    return NextResponse.json({ error: 'Failed to validate compliance evidence' }, { status: 500 });
  }
}
