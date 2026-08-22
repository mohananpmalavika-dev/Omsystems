import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredTenantId,
  getHikvisionAxProIntegrationService,
  requireSessionToken,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    requireSessionToken(request);
    const data = await getHikvisionAxProIntegrationService().list(getConfiguredTenantId());
    return NextResponse.json({ data });
  } catch (error) {
    return integrationError(error, 'integrations_unavailable');
  }
}

function integrationError(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'unauthenticated') {
    return NextResponse.json({ error: 'unauthenticated', message }, { status: 401 });
  }
  const status = message.includes('not configured') ? 503 : 502;
  return NextResponse.json({ error: fallback, message }, { status });
}

