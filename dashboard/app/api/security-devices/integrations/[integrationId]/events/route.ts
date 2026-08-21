import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredTenantId,
  getHikvisionAxProIntegrationService,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

/**
 * Inbound AX PRO receiver endpoint. It deliberately does not use the browser
 * session cookie: the device authenticates with a timestamped HMAC signature.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  try {
    const { integrationId } = await params;
    const rawBody = await request.text();
    const result = await getHikvisionAxProIntegrationService().ingestReceiverEvent(
      getConfiguredTenantId(),
      integrationId,
      rawBody,
      request.headers.get('content-type') || '',
      request.headers.get('x-sentinel-axpro-signature'),
      request.headers.get('x-sentinel-axpro-timestamp'),
    );
    return NextResponse.json({ data: result }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('signature') || message.includes('timestamp') || message.includes('SECRET') ? 401 : message.includes('not found') || message.includes('approved') ? 404 : 502;
    return NextResponse.json({ error: 'axpro_event_rejected', message }, { status });
  }
}

