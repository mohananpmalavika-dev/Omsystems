import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    const url = `${API_BASE_URL}/v1/compliance/dashboard`;

    const response = await fetch(url, {
      headers: {
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Compliance dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance dashboard' },
      { status: 500 }
    );
  }
}
