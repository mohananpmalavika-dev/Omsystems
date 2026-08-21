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
    const data = await getHikvisionAxProIntegrationService().poll(getConfiguredTenantId(), integrationId);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'unauthenticated') return NextResponse.json({ error: 'unauthenticated', message }, { status: 401 });
    return NextResponse.json({ error: 'integration_poll_failed', message }, { status: message.includes('not found') ? 404 : 502 });
  }
}

