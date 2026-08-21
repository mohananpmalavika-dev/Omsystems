import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredTenantId,
  getHikvisionAxProIntegrationService,
  requireSessionToken,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  try {
    requireSessionToken(request);
    const { integrationId } = await params;
    const data = await getHikvisionAxProIntegrationService().test(getConfiguredTenantId(), integrationId);
    return NextResponse.json({ data }, { status: data.success ? 200 : 502 });
  } catch (error) {
    return errorResponse(error, 'integration_test_failed');
  }
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'unauthenticated') return NextResponse.json({ error: 'unauthenticated', message }, { status: 401 });
  return NextResponse.json({ error: fallback, message }, { status: message.includes('not found') ? 404 : 502 });
}

