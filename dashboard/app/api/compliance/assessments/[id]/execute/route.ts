import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * POST /api/compliance/assessments/[id]/execute
 * Execute a compliance assessment
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const url = `${API_BASE_URL}/v1/compliance/assessments/${params.id}/execute`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': request.headers.get('x-tenant-id') || '',
        'x-user-id': request.headers.get('x-user-id') || 'system',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Execute assessment API error:', error);
    return NextResponse.json(
      { error: 'Failed to execute compliance assessment' },
      { status: 500 }
    );
  }
}
