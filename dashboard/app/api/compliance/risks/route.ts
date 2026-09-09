import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    const headers = authorizationHeaders(request);
    if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/v1/compliance/risks${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers,
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Compliance risks API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance risks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const headers = authorizationHeaders(request);
    if (!headers) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const body = await request.json();
    const url = `${API_BASE_URL}/v1/compliance/risks`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Compliance risks API error:', error);
    return NextResponse.json(
      { error: 'Failed to create compliance risk' },
      { status: 500 }
    );
  }
}

function authorizationHeaders(request: NextRequest): HeadersInit | null {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?? request.cookies.get('sentinel_access')?.value;
  if (bearer) return { authorization: `Bearer ${bearer}` };

  // Header identities are only supported by the control plane's explicit
  // development adapter; never synthesize a privileged identity in production.
  if (process.env.NODE_ENV !== 'production') {
    const userId = request.headers.get('x-user-id') ?? process.env.DASHBOARD_DEV_USER_ID;
    if (userId) return { 'x-user-id': userId };
  }
  return null;
}
