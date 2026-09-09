import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function upstreamHeaders(request: NextRequest, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'x-tenant-id': request.headers.get('x-tenant-id') || '',
    'x-user-id': request.headers.get('x-user-id') || 'system',
    ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
  };
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { error: 'Compliance service returned an invalid response.' }; }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/v1/compliance/evidence${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers: upstreamHeaders(request),
      cache: 'no-store',
    });

    const data = await responsePayload(response);
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Compliance evidence API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance evidence' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = `${API_BASE_URL}/v1/compliance/evidence`;

    const response = await fetch(url, {
      method: 'POST',
      headers: upstreamHeaders(request, true),
      body: JSON.stringify(body),
    });

    const data = await responsePayload(response);
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Compliance evidence API error:', error);
    return NextResponse.json(
      { error: 'Failed to create compliance evidence' },
      { status: 500 }
    );
  }
}
