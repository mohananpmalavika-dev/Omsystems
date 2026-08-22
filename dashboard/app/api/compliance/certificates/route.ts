import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/compliance/certificates
 * List compliance certificates
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const assessmentId = searchParams.get('assessmentId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');

    const params = new URLSearchParams();
    if (assessmentId) params.append('assessmentId', assessmentId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);

    const url = `${API_BASE_URL}/v1/compliance/certificates?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('List certificates API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance certificates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compliance/certificates
 * Generate a new compliance certificate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/compliance/certificates`;

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
    console.error('Generate certificate API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate compliance certificate' },
      { status: 500 }
    );
  }
}
