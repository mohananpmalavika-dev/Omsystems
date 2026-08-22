import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredTenantId,
  getHikvisionAxProIntegrationService,
  requireSessionToken,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    requireSessionToken(request);
    const body = await request.json();
    const service = getHikvisionAxProIntegrationService();
    const data = await service.create(getConfiguredTenantId(), {
      name: String(body.name || ''),
      branchId: String(body.branchId || ''),
      host: String(body.host || ''),
      port: Number(body.port),
      protocol: String(body.protocol || 'HTTPS').toUpperCase() as 'HTTP' | 'HTTPS',
      credentialSecretId: String(body.credentialSecretId || ''),
      pollingIntervalSeconds: body.pollingIntervalSeconds === undefined ? undefined : Number(body.pollingIntervalSeconds),
      enabled: body.enabled !== false,
      timeoutMs: body.timeoutMs === undefined ? undefined : Number(body.timeoutMs),
      allowInsecureHttp: body.allowInsecureHttp === true,
      authMethod: body.authMethod,
      endpointPaths: body.endpointPaths,
      eventTypeMap: body.eventTypeMap,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'unauthenticated') return NextResponse.json({ error: 'unauthenticated', message }, { status: 401 });
    const status = /required|must be|disabled|between|format/.test(message) ? 400 : message.includes('not configured') ? 503 : 502;
    return NextResponse.json({ error: 'integration_create_failed', message }, { status });
  }
}

