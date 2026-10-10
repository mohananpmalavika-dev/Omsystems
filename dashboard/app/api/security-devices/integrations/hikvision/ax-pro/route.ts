import { NextRequest, NextResponse } from 'next/server';
import {
  requireAxProTenant,
  getHikvisionAxProIntegrationService,
  axProApiError,
} from '@/lib/backend/hikvision-axpro';
import { readAxProBody, isRecord } from '../../../../../../../src/security-devices/integrations/hikvision/axpro/client';
import { AxProError } from '../../../../../../../src/security-devices/integrations/hikvision/axpro/errors';
import type { CreateAxProIntegrationInput } from '../../../../../../../src/security-devices/integrations/hikvision/axpro/integration.service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAxProTenant(request);
    const body = JSON.parse(await readAxProBody(request, AbortSignal.timeout(10_000)));
    if (!isRecord(body) || (body.enabled !== undefined && typeof body.enabled !== 'boolean') || (body.allowInsecureHttp !== undefined && typeof body.allowInsecureHttp !== 'boolean')) throw new AxProError('AXPRO_CONFIG_INVALID', 'Request must contain an integration object with boolean enabled/allowInsecureHttp fields', 400);
    const service = getHikvisionAxProIntegrationService();
    const data = await service.create(tenantId, {
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
      // The shared service validates these optional fields before persistence.
      authMethod: body.authMethod as CreateAxProIntegrationInput['authMethod'],
      endpointPaths: body.endpointPaths as CreateAxProIntegrationInput['endpointPaths'],
      eventTypeMap: body.eventTypeMap as CreateAxProIntegrationInput['eventTypeMap'],
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return axProApiError(error);
  }
}
