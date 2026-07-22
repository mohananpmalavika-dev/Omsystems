import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * GET /api/audit/branch-compliance
 * Get comprehensive branch compliance summary
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const branchNodeId = searchParams.get('branchNodeId');

    const params = new URLSearchParams();
    if (branchNodeId) params.append('branchNodeId', branchNodeId);

    const url = `${API_BASE_URL}/v1/audit/branch-compliance?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Branch compliance API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch branch compliance summary' },
      { status: 500 }
    );
  }
}
