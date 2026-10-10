import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredTenantId,
  getHikvisionAxProIntegrationService,
  axProApiError,
} from '@/lib/backend/hikvision-axpro';
import { readAxProBody } from '../../../../../../../src/security-devices/integrations/hikvision/axpro/client';

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
    const rawBody = await readAxProBody(request, AbortSignal.timeout(10_000));
    const result = await getHikvisionAxProIntegrationService().ingestReceiverEvent(
      request.headers.get('x-sentinel-tenant-id') || getConfiguredTenantId(),
      integrationId,
      rawBody,
      request.headers.get('content-type') || '',
      request.headers.get('x-sentinel-axpro-signature'),
      request.headers.get('x-sentinel-axpro-timestamp'),
    );
    return NextResponse.json({ data: result }, { status: 202 });
  } catch (error) {
    return axProApiError(error);
  }
}

