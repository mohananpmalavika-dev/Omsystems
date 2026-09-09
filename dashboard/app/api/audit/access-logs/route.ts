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
  try { return JSON.parse(text); } catch { return { error: 'Audit service returned an invalid response.' }; }
}

/**
 * GET /api/audit/access-logs
 * Get video access logs
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const accessType = searchParams.get('accessType');
    const incidentId = searchParams.get('incidentId');
    const sessionId = searchParams.get('sessionId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = searchParams.get('limit');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (accessType) params.append('accessType', accessType);
    if (incidentId) params.append('incidentId', incidentId);
    if (sessionId) params.append('sessionId', sessionId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (limit) params.append('limit', limit);
    if (summary) params.append('summary', 'true');

    const url = `${API_BASE_URL}/v1/audit/access-logs?${params.toString()}`;

    const response = await fetch(url, {
      headers: upstreamHeaders(request),
      cache: 'no-store',
    });

    const data = await responsePayload(response);
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Access logs API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video access logs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/access-logs
 * Log video access event
 */
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    { error: 'Access logs are written by audited video-access services and cannot be created through this endpoint.' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
