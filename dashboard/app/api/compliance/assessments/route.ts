import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/compliance/assessments
 * List compliance assessments with filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const frameworkId = searchParams.get('frameworkId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');

    const params = new URLSearchParams();
    if (frameworkId) params.append('frameworkId', frameworkId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);

    const url = `${API_BASE_URL}/v1/compliance/assessments?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('List assessments API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance assessments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compliance/assessments
 * Create a new compliance assessment
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/compliance/assessments`;

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
    console.error('Create assessment API error:', error);
    return NextResponse.json(
      { error: 'Failed to create compliance assessment' },
      { status: 500 }
    );
  }
}
