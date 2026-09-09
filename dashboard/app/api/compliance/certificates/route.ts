import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function upstreamHeaders(request: NextRequest) {
  return {
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
      headers: upstreamHeaders(request),
      cache: 'no-store',
    });

    const data = await responsePayload(response);
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('List certificates API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance certificates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    { error: 'Certificates must be issued from an assessment.' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
